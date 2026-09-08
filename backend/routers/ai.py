import os
import sys
import json
import urllib.request
import urllib.error
import tempfile
import subprocess
import shutil
import platform
import asyncio
from typing import Optional, List, Dict, Any, Tuple
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
import uuid
from uuid import UUID

from core.config import settings
from core.database import get_db
from core.deps import get_current_user
from core.agent_security import is_sensitive_file, redact_secrets, get_sanitized_execution_env
from models.user import User
from models.directory import Directory, NodeType
from routers.tools import _resolve_parent_id
from routers.projects import _assert_project_access

router = APIRouter()

class Message(BaseModel):
    role: str  # user, assistant, system, tool
    content: Optional[str] = None
    name: Optional[str] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None

class AgentRunRequest(BaseModel):
    messages: List[Message]
    project_id: Optional[str] = None
    branch_id: Optional[str] = None
    active_file_name: Optional[str] = None
    active_file_content: Optional[str] = None
    diagnostics: Optional[Dict[str, Any]] = None  # Editor errors, warnings, cursor position
    api_key: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None
    provider: Optional[str] = None

class TestConnectionRequest(BaseModel):
    provider: Optional[str] = "groq"
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None

class TestConnectionResponse(BaseModel):
    success: bool
    message: str
    model: Optional[str] = None
    latency_ms: Optional[int] = None

class ToolExecutionResult(BaseModel):
    tool: str
    args: Dict[str, Any]
    result: str

class AgentRunResponse(BaseModel):
    reply: str
    updated_messages: List[Dict[str, Any]]
    executed_tools: List[ToolExecutionResult]
    code_modifications: Dict[str, str]  # filename -> new code content
    new_files: List[str] = []

# Comprehensive Agent Tool definitions in standard OpenAI / Groq function calling schema
AGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_file",
            "description": "Creates a new file in the workspace directory tree with initial code content and opens it.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_name": {
                        "type": "string",
                        "description": "The exact name of the new file to create (e.g. 'calc.py', 'utils.js', 'styles.css')."
                    },
                    "code_content": {
                        "type": "string",
                        "description": "The complete, production-ready code content to populate the new file."
                    },
                    "summary": {
                        "type": "string",
                        "description": "Brief description of the created file."
                    }
                },
                "required": ["file_name", "code_content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "write_code_to_file",
            "description": "Writes or completely replaces code into an existing workspace file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_name": {
                        "type": "string",
                        "description": "The target file name (e.g., 'main.js', 'app.py')."
                    },
                    "code_content": {
                        "type": "string",
                        "description": "The complete code content to write into the file."
                    },
                    "summary": {
                        "type": "string",
                        "description": "Brief description of the modifications."
                    }
                },
                "required": ["file_name", "code_content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "apply_code_patch",
            "description": "Applies a precise search-and-replace patch to a file without rewriting the entire file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_name": {
                        "type": "string",
                        "description": "Target file name to patch."
                    },
                    "search_block": {
                        "type": "string",
                        "description": "Exact block of code to find and replace."
                    },
                    "replace_block": {
                        "type": "string",
                        "description": "The replacement code block."
                    }
                },
                "required": ["file_name", "search_block", "replace_block"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_codebase",
            "description": "Searches for a query (function name, variable, class, or pattern) across all files in the current workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query or identifier to find across workspace files."
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "run_sandbox_code",
            "description": "Executes a script in the secure sandbox runner to verify tests, catch runtime errors, or check output.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_name": {
                        "type": "string",
                        "description": "File name (e.g., 'test_calc.py' or 'index.js')."
                    },
                    "code_content": {
                        "type": "string",
                        "description": "The exact code content to run in the sandbox."
                    }
                },
                "required": ["file_name", "code_content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_workspace_diagnostics",
            "description": "Retrieves the live Monaco editor syntax/compile errors, warnings, and active file info.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_active_file",
            "description": "Reads the current contents of the active open file in the editor.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_name": {
                        "type": "string",
                        "description": "Name of the file to inspect."
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Reads the code content of any workspace file by filename or path.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_name": {
                        "type": "string",
                        "description": "Exact name or path of the workspace file to inspect."
                    }
                },
                "required": ["file_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_workspace_files",
            "description": "Lists all file names in the current project workspace.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    }
]


def _extract_function_from_failed_generation(failed_gen: str) -> Optional[Tuple[str, str]]:
    if not failed_gen or "<function=" not in failed_gen:
        return None
    try:
        import re
        m_fn = re.search(r'<function=([a-zA-Z0-9_]+)', failed_gen)
        fn_name = m_fn.group(1) if m_fn else "create_file"

        m_file = re.search(r'"file_name"\s*:\s*"([^"\r\n]+)"', failed_gen)
        file_name = m_file.group(1) if m_file else "main.js"

        code_content = ""
        key_idx = failed_gen.find('"code_content"')
        if key_idx != -1:
            sub = failed_gen[key_idx + len('"code_content"'):]
            colon_idx = sub.find(':')
            if colon_idx != -1:
                after_colon = sub[colon_idx + 1:].lstrip()
                if after_colon.startswith('"'):
                    content_start = 1
                    sum_idx = after_colon.rfind('"summary"')
                    if sum_idx != -1:
                        comma_idx = after_colon.rfind(',', 0, sum_idx)
                        if comma_idx != -1:
                            quote_idx = after_colon.rfind('"', 0, comma_idx)
                            if quote_idx != -1:
                                code_content = after_colon[content_start:quote_idx]
                    if not code_content:
                        last_close = after_colon.rfind('}')
                        if last_close != -1:
                            quote_idx = after_colon.rfind('"', 0, last_close)
                            if quote_idx != -1:
                                code_content = after_colon[content_start:quote_idx]

        if not code_content:
            first_brace = failed_gen.find('{')
            last_brace = failed_gen.rfind('}')
            if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
                try:
                    parsed = json.loads(failed_gen[first_brace:last_brace+1], strict=False)
                    return fn_name, json.dumps(parsed)
                except Exception:
                    pass

        code_content = code_content.replace('\\\\\\"', '"').replace('\\\\"', '"').replace('\\"', '"').replace('\\n', '\n').replace('\\t', '\t')
        res_dict = {"file_name": file_name, "code_content": code_content}
        return fn_name, json.dumps(res_dict)
    except Exception as e:
        print("Extraction error:", e)
        return None


def _call_anthropic_api(
    base_url: str,
    api_key: str,
    model: str,
    messages: List[Dict[str, Any]],
    tools: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    url = f"{base_url.rstrip('/')}/messages" if not base_url.rstrip('/').endswith("/messages") else base_url.rstrip('/')

    system_prompt = ""
    anthropic_msgs = []

    for m in messages:
        role = m.get("role")
        content = m.get("content") or ""
        sanitized_content = redact_secrets(content)

        if role == "system":
            system_prompt = (system_prompt + "\n\n" + sanitized_content).strip()
        elif role == "tool":
            anthropic_msgs.append({
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": m.get("tool_call_id", f"call_{uuid.uuid4().hex[:8]}"),
                        "content": sanitized_content
                    }
                ]
            })
        elif role == "assistant" and m.get("tool_calls"):
            content_blocks = []
            if sanitized_content:
                content_blocks.append({"type": "text", "text": sanitized_content})
            for tc in m["tool_calls"]:
                fn = tc.get("function", {})
                args = {}
                try:
                    args = json.loads(fn.get("arguments", "{}"), strict=False)
                except Exception:
                    pass
                content_blocks.append({
                    "type": "tool_use",
                    "id": tc.get("id", f"call_{uuid.uuid4().hex[:8]}"),
                    "name": fn.get("name", ""),
                    "input": args
                })
            anthropic_msgs.append({"role": "assistant", "content": content_blocks})
        else:
            anthropic_msgs.append({
                "role": "user" if role == "user" else "assistant",
                "content": sanitized_content
            })

    if not anthropic_msgs:
        anthropic_msgs = [{"role": "user", "content": "Hello"}]

    anthropic_tools = []
    if tools:
        for t in tools:
            fn = t.get("function", {})
            anthropic_tools.append({
                "name": fn.get("name", ""),
                "description": fn.get("description", ""),
                "input_schema": fn.get("parameters", {"type": "object", "properties": {}})
            })

    payload_dict: Dict[str, Any] = {
        "model": model or "claude-3-5-sonnet-20241022",
        "max_tokens": 4096,
        "messages": anthropic_msgs
    }
    if system_prompt:
        payload_dict["system"] = system_prompt
    if anthropic_tools:
        payload_dict["tools"] = anthropic_tools

    data = json.dumps(payload_dict).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "User-Agent": "Nulltor-IDE-Agent/2.0"
    }

    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=45.0) as resp:
            resp_data = json.loads(resp.read().decode("utf-8"), strict=False)
            text_blocks = []
            tool_calls = []
            for item in resp_data.get("content", []):
                if item.get("type") == "text":
                    text_blocks.append(item.get("text", ""))
                elif item.get("type") == "tool_use":
                    tool_calls.append({
                        "id": item.get("id", f"call_{uuid.uuid4().hex[:8]}"),
                        "type": "function",
                        "function": {
                            "name": item.get("name", ""),
                            "arguments": json.dumps(item.get("input", {}))
                        }
                    })
            reply_text = "\n".join(text_blocks)
            return {
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": reply_text if reply_text else None,
                            "tool_calls": tool_calls if tool_calls else None
                        }
                    }
                ]
            }
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        try:
            err_json = json.loads(err_msg, strict=False)
            err_detail = err_json.get("error", {}).get("message", err_msg)
            raise RuntimeError(f"Anthropic API Error: {err_detail}")
        except Exception:
            raise RuntimeError(f"Anthropic API Error (HTTP {e.code}): {err_msg}")


def _call_llm_api(
    base_url: str,
    api_key: str,
    model: str,
    messages: List[Dict[str, Any]],
    tools: Optional[List[Dict[str, Any]]] = None,
    provider: Optional[str] = None
) -> Dict[str, Any]:
    # Route to native Anthropic adapter if targeted
    if provider == "anthropic" or (base_url and "anthropic.com" in base_url) or (api_key and api_key.startswith("sk-ant-")):
        return _call_anthropic_api(base_url or "https://api.anthropic.com/v1", api_key, model, messages, tools)

    url = f"{base_url.rstrip('/')}/chat/completions"

    # Redact sensitive secrets from all messages before dispatching to external LLMs
    sanitized_messages = []
    for m in messages:
        sanitized_msg = dict(m)
        if "content" in sanitized_msg and isinstance(sanitized_msg["content"], str):
            sanitized_msg["content"] = redact_secrets(sanitized_msg["content"])
        sanitized_messages.append(sanitized_msg)

    payload_dict: Dict[str, Any] = {
        "model": model,
        "messages": sanitized_messages,
        "temperature": 0.1,
    }
    if tools:
        payload_dict["tools"] = tools
        payload_dict["tool_choice"] = "auto"

    data = json.dumps(payload_dict).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Nulltor-IDE-Agent/2.0"
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    req = urllib.request.Request(url, data=data, headers=headers)

    try:
        with urllib.request.urlopen(req, timeout=45.0) as resp:
            return json.loads(resp.read().decode("utf-8"), strict=False)
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        try:
            err_json = json.loads(err_msg, strict=False)
            err_obj = err_json.get("error", {})
            failed_gen = err_obj.get("failed_generation") or ""
            if not failed_gen and "<function=" in err_msg:
                failed_gen = err_msg
            if failed_gen:
                extracted = _extract_function_from_failed_generation(failed_gen)
                if extracted:
                    fn_name, raw_args = extracted
                    return {
                        "choices": [
                            {
                                "message": {
                                    "role": "assistant",
                                    "content": f"Executing tool '{fn_name}'.",
                                    "tool_calls": [
                                        {
                                            "id": f"call_{uuid.uuid4().hex[:8]}",
                                            "type": "function",
                                            "function": {
                                                "name": fn_name,
                                                "arguments": raw_args
                                            }
                                        }
                                    ]
                                }
                            }
                        ]
                    }
            raise RuntimeError(err_obj.get("message", err_msg))
        except RuntimeError:
            raise
        except Exception as ex:
            print("HTTP fallback error:", ex)
            raise RuntimeError(f"HTTP {e.code}: {err_msg}")


def _execute_code_in_sandbox_sync(file_name: str, code_content: str, extra_files: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """
    Executes code in a secure, isolated sandbox subprocess with stripped environment variables.
    """
    ext = os.path.splitext(file_name)[1].lower() or ".py"
    temp_dir = os.path.join(tempfile.gettempdir(), f"nulltor_ai_test_{uuid.uuid4().hex[:8]}")
    os.makedirs(temp_dir, exist_ok=True)
    script_path = os.path.join(temp_dir, file_name)

    with open(script_path, "w", encoding="utf-8") as f:
        f.write(code_content)

    if extra_files:
        for ef_name, ef_content in extra_files.items():
            if ef_name and ef_name != file_name and ef_content:
                base_ef = os.path.basename(ef_name)
                ef_path = os.path.join(temp_dir, base_ef)
                try:
                    with open(ef_path, "w", encoding="utf-8") as ef:
                        ef.write(ef_content)
                except Exception:
                    pass

    env = get_sanitized_execution_env()

    cmd = []
    if ext == ".py":
        cmd = [sys.executable or "python", "-u", file_name]
    elif ext in [".js", ".mjs"]:
        node_bin = shutil.which("node") or "node"
        cmd = [node_bin, file_name]
    elif ext in [".ts", ".tsx"]:
        tsx_bin = shutil.which("tsx.cmd") or shutil.which("tsx") or "tsx"
        cmd = [tsx_bin, file_name]
    elif ext in [".c", ".cpp"]:
        compiler = "gcc" if ext == ".c" else "g++"
        compiler_bin = shutil.which(compiler) or shutil.which(f"{compiler}.exe")
        if not compiler_bin:
            return {"stdout": "", "stderr": f"{compiler} compiler not found on PATH.", "exit_code": 1}
        out_bin = os.path.join(temp_dir, "prog.exe" if platform.system() == "Windows" else "prog")
        compile_proc = subprocess.run(
            [compiler_bin, script_path, "-o", out_bin],
            cwd=temp_dir,
            capture_output=True,
            text=True,
            timeout=10,
            env=env
        )
        if compile_proc.returncode != 0:
            return {"stdout": compile_proc.stdout, "stderr": compile_proc.stderr, "exit_code": compile_proc.returncode}
        cmd = [out_bin]
    else:
        return {"stdout": "", "stderr": f"Execution for extension '{ext}' not supported.", "exit_code": 1}

    try:
        proc = subprocess.run(
            cmd,
            cwd=temp_dir,
            capture_output=True,
            text=True,
            timeout=10,
            env=env
        )
        return {
            "stdout": proc.stdout[:10000] if proc.stdout else "",
            "stderr": proc.stderr[:10000] if proc.stderr else "",
            "exit_code": proc.returncode
        }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Execution timed out (10s limit exceeded).", "exit_code": 124}
    except Exception as e:
        return {"stdout": "", "stderr": f"Execution error: {str(e)}", "exit_code": 1}
    finally:
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass


@router.post("/test-connection", response_model=TestConnectionResponse)
async def test_llm_connection(
    req: TestConnectionRequest,
    user: User = Depends(get_current_user)
):
    import time
    has_custom_key = bool(req.api_key and req.api_key.strip())
    is_local_ollama = bool(req.base_url and ("11434" in req.base_url or req.provider == "ollama"))

    if has_custom_key:
        api_key = req.api_key.strip()
        base_url = req.base_url or "https://api.openai.com/v1"
        model = req.model or "gpt-4o"
        provider = req.provider or "custom"
    elif is_local_ollama:
        api_key = req.api_key or "ollama"
        base_url = req.base_url or "http://localhost:11434/v1"
        model = req.model or "qwen2.5-coder:32b"
        provider = "ollama"
    else:
        api_key = settings.GROQ_API_KEY or os.getenv("GROQ_API_KEY") or os.getenv("OPENAI_API_KEY") or ""
        base_url = settings.AI_BASE_URL or os.getenv("AI_BASE_URL", "https://api.groq.com/openai/v1")
        model = settings.AI_MODEL or os.getenv("AI_MODEL", "llama-3.3-70b-versatile")
        provider = "groq"

    if not api_key and not is_local_ollama:
        return TestConnectionResponse(
            success=False,
            message="No API key provided and no default system key configured."
        )

    start_t = time.perf_counter()
    try:
        test_messages = [{"role": "user", "content": "Respond with 'OK'."}]
        resp = await asyncio.to_thread(
            _call_llm_api,
            base_url=base_url,
            api_key=api_key,
            model=model,
            messages=test_messages,
            tools=None,
            provider=provider
        )
        latency_ms = int((time.perf_counter() - start_t) * 1000)
        return TestConnectionResponse(
            success=True,
            message=f"Connected successfully ({latency_ms}ms). Provider: {provider.upper()}, Model: {model}",
            model=model,
            latency_ms=latency_ms
        )
    except Exception as e:
        latency_ms = int((time.perf_counter() - start_t) * 1000)
        safe_err = redact_secrets(str(e))
        return TestConnectionResponse(
            success=False,
            message=f"Connection failed ({latency_ms}ms): {safe_err}",
            model=model,
            latency_ms=latency_ms
        )


@router.post("/chat", response_model=AgentRunResponse)
async def run_agent(
    req: AgentRunRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    has_custom_key = bool(req.api_key and req.api_key.strip())
    is_local_ollama = bool(req.base_url and ("11434" in req.base_url or req.provider == "ollama"))

    if has_custom_key:
        api_key = req.api_key.strip()
        base_url = req.base_url or "https://api.openai.com/v1"
        model = req.model or "gpt-4o"
        provider = req.provider or "custom"
    elif is_local_ollama:
        api_key = req.api_key or "ollama"
        base_url = req.base_url or "http://localhost:11434/v1"
        model = req.model or "qwen2.5-coder:32b"
        provider = "ollama"
    else:
        # User has not provided their own key - smoothly fallback to system default key & configuration
        api_key = settings.GROQ_API_KEY or os.getenv("GROQ_API_KEY") or os.getenv("OPENAI_API_KEY") or ""
        base_url = settings.AI_BASE_URL or os.getenv("AI_BASE_URL", "https://api.groq.com/openai/v1")
        model = settings.AI_MODEL or os.getenv("AI_MODEL", "llama-3.3-70b-versatile")
        provider = "groq"

    # Fetch project files for context
    project_files = []
    pid: Optional[UUID] = None
    bid: Optional[UUID] = None
    if req.project_id:
        try:
            pid = UUID(req.project_id)
            await _assert_project_access(db, pid, user)
            if req.branch_id:
                try:
                    bid = UUID(req.branch_id)
                except Exception:
                    bid = None
            if not bid:
                from models.branch import Branch
                main_b = (await db.execute(select(Branch.id).where(Branch.project_id == pid, Branch.name == 'main'))).scalar_one_or_none()
                if main_b:
                    bid = main_b

            q_files = select(Directory).where(Directory.project_id == pid)
            if bid:
                q_files = q_files.where(Directory.branch_id == bid)
            res = await db.execute(q_files)
            nodes = res.scalars().all()
            project_files = [n.name for n in nodes if n.type == NodeType.file or n.type.value == "file"]
        except Exception as e:
            print("AI context loading error:", e)

    # Prepare live active file snippet for prompt
    active_code_preview = req.active_file_content if req.active_file_content is not None else ""
    if len(active_code_preview) > 50000:
        active_code_preview = active_code_preview[:50000] + "\n... [truncated]"

    diagnostics_info = ""
    if req.diagnostics:
        errors = req.diagnostics.get("errors", 0)
        warnings = req.diagnostics.get("warnings", 0)
        if errors > 0 or warnings > 0:
            diagnostics_info = f"\nEditor Diagnostics: {errors} Error(s), {warnings} Warning(s) in active tab."

    system_prompt = (
        "You are Nulltor Agent, an expert autonomous AI software engineer embedded directly inside the Nulltor IDE.\n"
        "You have full autonomy to inspect, create, patch, search, and verify code in the user's workspace using your tool suite.\n"
        f"Active open file: {req.active_file_name or 'none'}.{diagnostics_info}\n"
        f"Workspace files: {', '.join(project_files) if project_files else 'none'}.\n\n"
        f"--- LIVE REAL-TIME EDITOR CONTENT FOR '{req.active_file_name or 'active file'}' ---\n"
        f"{active_code_preview if active_code_preview else '(File is currently empty)'}\n"
        f"--- END LIVE REAL-TIME EDITOR CONTENT ---\n\n"
        "CORE AGENT PRINCIPLES & WORKFLOW:\n"
        "1. Understand & Search: Use `search_codebase` or `read_file` to locate relevant functions, models, or types across workspace files.\n"
        "2. Precise Editing: Use `apply_code_patch` for surgical modifications or `write_code_to_file`/`create_file` when generating full implementations.\n"
        "3. Verification Loop: If writing new complex algorithms or tests, use `run_sandbox_code` to verify. For direct refactoring, text removal, or docstring edits, apply changes directly without running repetitive test scripts.\n"
        "4. Strict Security: You are strictly forbidden from accessing `.env`, `*.db`, `nulltor.db`, `*config.py`, or host system files. Any attempt will be rejected.\n"
        "5. Complete Code: Always provide complete, production-ready code with no shortcuts or `# ... existing code ...` placeholders."
    )

    history: List[Dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    for m in req.messages:
        if m.content and ("Agent execution error:" in m.content or "HTTP 400:" in m.content):
            continue
        item: Dict[str, Any] = {"role": m.role}
        if m.content is not None:
            item["content"] = m.content
        if m.tool_calls:
            item["tool_calls"] = m.tool_calls
        if m.tool_call_id:
            item["tool_call_id"] = m.tool_call_id
        if m.name:
            item["name"] = m.name
        history.append(item)

    executed_tools: List[ToolExecutionResult] = []
    code_modifications: Dict[str, str] = {}
    new_files: List[str] = []

    async def _ensure_db_file_exists(filename: str, content: str = "") -> bool:
        if not pid:
            return False
        try:
            actual_bid = bid
            if not actual_bid:
                from models.branch import Branch
                main_b = (await db.execute(select(Branch.id).where(Branch.project_id == pid, Branch.name == 'main'))).scalar_one_or_none()
                if main_b:
                    actual_bid = main_b

            base_name, parent_id = await _resolve_parent_id(db, pid, actual_bid, filename)

            q = select(Directory).where(Directory.project_id == pid, Directory.name == base_name, Directory.parent_id == parent_id)
            if actual_bid:
                q = q.where(Directory.branch_id == actual_bid)
            existing = (await db.execute(q)).scalar_one_or_none()
            
            node_id = None
            is_new = False
            if not existing:
                new_node = Directory(
                    project_id=pid,
                    name=base_name,
                    parent_id=parent_id,
                    type=NodeType.file,
                    branch_id=actual_bid,
                    created_by=user.id,
                    updated_by=user.id
                )
                db.add(new_node)
                await db.flush()
                node_id = new_node.id
                is_new = True
            else:
                node_id = existing.id

            if content:
                stmt = text("""
                    INSERT INTO file_snapshots (file_id, branch_id, data, updated_at)
                    VALUES (:file_id, :branch_id, :data, CURRENT_TIMESTAMP)
                    ON CONFLICT(file_id, branch_id) DO UPDATE
                    SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP
                """)
                await db.execute(stmt, {
                    "file_id": str(node_id),
                    "branch_id": str(actual_bid),
                    "data": content
                })
            await db.commit()
            return is_new
        except Exception as e:
            print("DB node creation error:", e)
        return False

    async def _read_db_file_content(filename: str) -> Optional[str]:
        if not pid:
            return None
        try:
            base_name, parent_id = await _resolve_parent_id(db, pid, bid, filename)
            q = select(Directory).where(Directory.project_id == pid, Directory.name == base_name)
            if bid:
                q = q.where(Directory.branch_id == bid)
            node = (await db.execute(q)).scalar_one_or_none()
            if node:
                res = await db.execute(
                    text("SELECT data FROM file_snapshots WHERE file_id = :fid ORDER BY updated_at DESC LIMIT 1"),
                    {"fid": str(node.id)}
                )
                row = res.fetchone()
                if row and row[0]:
                    return row[0]
        except Exception:
            pass
        return None

    # Multi-turn autonomous tool execution loop
    if api_key:
        try:
            max_turns = 8
            turns = 0
            while turns < max_turns:
                turns += 1
                response = _call_llm_api(base_url, api_key, model, history, AGENT_TOOLS, provider=provider)
                choice = response["choices"][0]
                message = choice["message"]
                history.append(message)

                tool_calls = message.get("tool_calls")
                if not tool_calls:
                    content_str = message.get("content") or "Task completed."
                    return AgentRunResponse(
                        reply=content_str,
                        updated_messages=history,
                        executed_tools=executed_tools,
                        code_modifications=code_modifications,
                        new_files=new_files
                    )

                for tc in tool_calls:
                    fn_name = tc["function"]["name"]
                    call_id = tc["id"]
                    try:
                        args = json.loads(tc["function"]["arguments"], strict=False)
                    except Exception:
                        args = {}

                    tool_output = ""

                    # 1. create_file / write_code_to_file
                    if fn_name in ["create_file", "write_code_to_file"]:
                        target_file = args.get("file_name") or req.active_file_name or "main.js"
                        if is_sensitive_file(target_file):
                            tool_output = f"Security Policy Violation: Access or modification to sensitive file '{target_file}' is blocked."
                        else:
                            new_code = args.get("code_content", "")
                            code_modifications[target_file] = new_code
                            is_new = await _ensure_db_file_exists(target_file, new_code)
                            if is_new or fn_name == "create_file" or target_file not in project_files:
                                if target_file not in new_files:
                                    new_files.append(target_file)
                            tool_output = f"Successfully {'created' if fn_name == 'create_file' else 'updated'} '{target_file}' with {len(new_code.splitlines())} lines."

                        executed_tools.append(ToolExecutionResult(
                            tool=fn_name,
                            args={"file_name": target_file},
                            result=tool_output
                        ))

                    # 2. apply_code_patch
                    elif fn_name == "apply_code_patch":
                        target_file = args.get("file_name") or req.active_file_name or "main.js"
                        if is_sensitive_file(target_file):
                            tool_output = f"Security Policy Violation: Modification to sensitive file '{target_file}' is blocked."
                        else:
                            search_block = args.get("search_block", "")
                            replace_block = args.get("replace_block", "")
                            
                            current = code_modifications.get(target_file)
                            if current is None and target_file == req.active_file_name:
                                current = req.active_file_content
                            if current is None:
                                current = await _read_db_file_content(target_file)

                            if current is None:
                                tool_output = f"Error: Target file '{target_file}' not found."
                            elif search_block not in current:
                                tool_output = f"Error: Search block not found in '{target_file}'. Please inspect file content and retry."
                            else:
                                patched_code = current.replace(search_block, replace_block, 1)
                                code_modifications[target_file] = patched_code
                                await _ensure_db_file_exists(target_file, patched_code)
                                tool_output = f"Successfully applied patch to '{target_file}'."

                        executed_tools.append(ToolExecutionResult(
                            tool=fn_name,
                            args={"file_name": target_file},
                            result=tool_output
                        ))

                    # 3. search_codebase
                    elif fn_name == "search_codebase":
                        query = args.get("query", "").lower()
                        matches = []
                        if pid and query:
                            try:
                                q_all = select(Directory).where(Directory.project_id == pid)
                                if bid:
                                    q_all = q_all.where(Directory.branch_id == bid)
                                all_nodes = (await db.execute(q_all)).scalars().all()
                                for node in all_nodes:
                                    if node.type == NodeType.file or node.type.value == "file":
                                        if is_sensitive_file(node.name):
                                            continue
                                        # Check in recent modifications or DB
                                        content = code_modifications.get(node.name)
                                        if content is None:
                                            res_s = await db.execute(
                                                text("SELECT data FROM file_snapshots WHERE file_id = :fid ORDER BY updated_at DESC LIMIT 1"),
                                                {"fid": str(node.id)}
                                            )
                                            r_snap = res_s.fetchone()
                                            content = r_snap[0] if (r_snap and r_snap[0]) else ""
                                        
                                        if query in node.name.lower() or query in content.lower():
                                            snippet = ""
                                            for line_num, line in enumerate(content.splitlines(), 1):
                                                if query in line.lower():
                                                    snippet = f"Line {line_num}: {line.strip()}"
                                                    break
                                            matches.append({"file": node.name, "match": snippet or "Match in filename"})
                            except Exception as e:
                                print("Codebase search error:", e)

                        tool_output = json.dumps({"matches": matches[:10], "total_matches": len(matches)})
                        executed_tools.append(ToolExecutionResult(
                            tool=fn_name,
                            args={"query": query},
                            result=f"Found {len(matches)} matching file(s)."
                        ))

                    # 4. run_sandbox_code
                    elif fn_name == "run_sandbox_code":
                        target_f = args.get("file_name") or "test_run.py"
                        code_to_run = args.get("code_content", "")
                        if is_sensitive_file(target_f):
                            tool_output = json.dumps({"error": "Cannot execute sensitive file.", "exit_code": 1})
                        else:
                            extra_files = dict(code_modifications)
                            if req.active_file_name and req.active_file_content:
                                if req.active_file_name not in extra_files:
                                    extra_files[req.active_file_name] = req.active_file_content
                            run_res = await asyncio.to_thread(_execute_code_in_sandbox_sync, target_f, code_to_run, extra_files)
                            tool_output = json.dumps(run_res)

                        executed_tools.append(ToolExecutionResult(
                            tool=fn_name,
                            args={"file_name": target_f},
                            result=f"Exit {run_res.get('exit_code', 0)} | Stdout: {len(run_res.get('stdout', ''))} chars | Stderr: {len(run_res.get('stderr', ''))} chars"
                        ))

                    # 5. get_workspace_diagnostics
                    elif fn_name == "get_workspace_diagnostics":
                        tool_output = json.dumps({
                            "active_file": req.active_file_name,
                            "diagnostics": req.diagnostics or {"errors": 0, "warnings": 0}
                        })
                        executed_tools.append(ToolExecutionResult(
                            tool=fn_name,
                            args={},
                            result="Retrieved live LSP diagnostics."
                        ))

                    # 6. read_active_file / read_file
                    elif fn_name in ["read_active_file", "read_file"]:
                        target_f = args.get("file_name") or req.active_file_name
                        if is_sensitive_file(target_f or ""):
                            tool_output = f"Security Policy Violation: Access to '{target_f}' is restricted."
                        elif target_f and target_f == req.active_file_name and req.active_file_content:
                            tool_output = req.active_file_content
                        elif target_f and target_f in code_modifications:
                            tool_output = code_modifications[target_f]
                        else:
                            content = await _read_db_file_content(target_f or "")
                            tool_output = content if content else "(File content not found or empty)"

                        executed_tools.append(ToolExecutionResult(
                            tool=fn_name,
                            args={"file_name": target_f or "unknown"},
                            result=f"Read {len(tool_output)} characters."
                        ))

                    # 7. list_workspace_files
                    elif fn_name == "list_workspace_files":
                        safe_files = [f for f in project_files if not is_sensitive_file(f)]
                        tool_output = json.dumps(safe_files)
                        executed_tools.append(ToolExecutionResult(
                            tool=fn_name,
                            args={},
                            result=f"Found {len(safe_files)} files."
                        ))

                    else:
                        tool_output = f"Tool '{fn_name}' executed."
                        executed_tools.append(ToolExecutionResult(
                            tool=fn_name,
                            args=args,
                            result=tool_output
                        ))

                    history.append({
                        "role": "tool",
                        "tool_call_id": call_id,
                        "name": fn_name,
                        "content": redact_secrets(tool_output)
                    })

        except Exception as e:
            reply_err = f"Agent execution error: {str(e)}"
            history.append({"role": "assistant", "content": reply_err})
            return AgentRunResponse(
                reply=reply_err,
                updated_messages=history,
                executed_tools=executed_tools,
                code_modifications=code_modifications,
                new_files=new_files
            )

    # Local fallback when no API key is configured
    last_user_msg = ""
    for m in reversed(req.messages):
        if m.role == "user" and m.content:
            last_user_msg = m.content
            break

    lower_msg = last_user_msg.lower()
    is_code_creation = any(w in lower_msg for w in ["create", "write", "generate", "implement", "make", "build", "refactor"])
    
    target_file = req.active_file_name or "main.js"
    import re
    m_fn = re.search(r'([a-zA-Z0-9_\-]+\.[a-zA-Z0-9]+)', last_user_msg)
    if m_fn:
        target_file = m_fn.group(1)

    if is_code_creation:
        new_files.append(target_file)
        await _ensure_db_file_exists(target_file)
        code_out = f"// Implementation for {target_file}\n\nconsole.log('Nulltor workspace ready.');\n"
        if target_file.endswith(".py"):
            code_out = f"# Implementation for {target_file}\n\nprint('Nulltor workspace ready.')\n"
        elif target_file.endswith(".c"):
            code_out = f'#include <stdio.h>\n\nint main() {{\n    printf("Hello from {target_file}\\n");\n    return 0;\n}}\n'
        elif target_file.endswith(".cpp"):
            code_out = f'#include <iostream>\n\nint main() {{\n    std::cout << "Hello from {target_file}" << std::endl;\n    return 0;\n}}\n'

        code_modifications[target_file] = code_out
        executed_tools.append(ToolExecutionResult(
            tool="create_file" if target_file in new_files else "write_code_to_file",
            args={"file_name": target_file, "lines": len(code_out.splitlines())},
            result=f"Wrote code to {target_file}."
        ))
        reply_text = f"Created `{target_file}`. (Tip: Configure your LLM Provider and API key in Agent settings for autonomous reasoning, search, and self-testing in sandbox)."
    else:
        reply_text = f"I am active and observing '{req.active_file_name or 'workspace'}'. To enable autonomous multi-file coding, codebase search, and sandbox verification, click the settings gear ⚙ in the Agent header to configure your Groq, OpenAI, DeepSeek, or custom LLM API key."

    history.append({"role": "assistant", "content": reply_text})

    return AgentRunResponse(
        reply=reply_text,
        updated_messages=history,
        executed_tools=executed_tools,
        code_modifications=code_modifications,
        new_files=new_files
    )


# ── Inline Completion Endpoint (ghost-text autocomplete) ──────────────────────

class CompletionRequest(BaseModel):
    prefix: str                    # Code before the cursor (last N lines)
    suffix: Optional[str] = ""    # Code after the cursor (next few lines)
    language: Optional[str] = "python"
    api_key: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None


class CompletionResponse(BaseModel):
    suggestion: str  # Text to insert at cursor position


@router.post("/complete", response_model=CompletionResponse)
async def inline_complete(
    req: CompletionRequest,
    user: User = Depends(get_current_user),
):
    """Lightweight single-turn completion for Monaco ghost-text inline suggestions."""
    has_custom_key = bool(req.api_key and req.api_key.strip())
    is_local_ollama = bool(req.base_url and "11434" in req.base_url)

    if has_custom_key:
        api_key = req.api_key.strip()
        base_url = req.base_url or "https://api.openai.com/v1"
        model = req.model or "gpt-4o"
    elif is_local_ollama:
        api_key = req.api_key or "ollama"
        base_url = req.base_url or "http://localhost:11434/v1"
        model = req.model or "qwen2.5-coder:32b"
    else:
        api_key = settings.GROQ_API_KEY or os.getenv("GROQ_API_KEY") or os.getenv("OPENAI_API_KEY") or ""
        base_url = settings.AI_BASE_URL or os.getenv("AI_BASE_URL", "https://api.groq.com/openai/v1")
        model = settings.AI_MODEL or os.getenv("AI_MODEL", "openai/gpt-oss-120b")

    if not api_key and not is_local_ollama:
        return CompletionResponse(suggestion="")

    # Truncate prefix to last 50 lines to stay within token budget
    prefix_lines = req.prefix.splitlines()[-50:]
    prefix_trimmed = "\n".join(prefix_lines)
    suffix_trimmed = (req.suffix or "")[:200]

    messages = [
        {
            "role": "system",
            "content": (
                f"You are an expert {req.language} code completion engine embedded in an IDE. "
                "Output ONLY the completion text to insert at the cursor — no explanation, no markdown, "
                "no triple-backticks, no comments. If no meaningful completion exists, output an empty string."
            ),
        },
        {
            "role": "user",
            "content": (
                f"<prefix>\n{prefix_trimmed}\n</prefix>\n"
                f"<suffix>\n{suffix_trimmed}\n</suffix>\n"
                "Complete the code at the cursor position. Output only the text to insert."
            ),
        },
    ]

    try:
        resp = _call_llm_api(base_url, api_key, model, messages, tools=None)
        suggestion = resp["choices"][0]["message"].get("content", "").strip()
        if suggestion.startswith("```"):
            lines = suggestion.splitlines()
            suggestion = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        return CompletionResponse(suggestion=suggestion)
    except Exception as e:
        print("Inline completion error:", e)
        return CompletionResponse(suggestion="")
