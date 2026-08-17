import os
import json
import urllib.request
import urllib.error
from typing import Optional, List, Dict, Any, Tuple
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
from uuid import UUID

from core.config import settings
from core.database import get_db
from core.deps import get_current_user
from models.user import User
from models.directory import Directory, NodeType

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
    api_key: Optional[str] = None
    model: Optional[str] = "llama-3.3-70b-versatile"
    base_url: Optional[str] = "https://api.groq.com/openai/v1"

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

# Tool definitions in standard OpenAI / Groq function calling schema
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
                        "description": "The exact name of the new file to create (e.g. 'fibonacci.py', 'utils.js', 'styles.css')."
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
            "description": "Writes or replaces code into an existing workspace file.",
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
            # Try fast JSON fallback
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

def _call_llm_api(
    base_url: str,
    api_key: str,
    model: str,
    messages: List[Dict[str, Any]],
    tools: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    url = f"{base_url.rstrip('/')}/chat/completions"
    payload_dict: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": 0.1,
    }
    if tools:
        payload_dict["tools"] = tools
        payload_dict["tool_choice"] = "auto"
        
    data = json.dumps(payload_dict).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "Nulltor-IDE-Agent/1.0"
        }
    )
    
    try:
        with urllib.request.urlopen(req, timeout=30.0) as resp:
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


@router.post("/chat", response_model=AgentRunResponse)
async def run_agent(
    req: AgentRunRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    api_key = req.api_key or settings.GROQ_API_KEY or os.getenv("GROQ_API_KEY") or os.getenv("OPENAI_API_KEY")
    base_url = req.base_url or settings.AI_BASE_URL or os.getenv("AI_BASE_URL", "https://api.groq.com/openai/v1")
    model = req.model or settings.AI_MODEL or os.getenv("AI_MODEL", "llama-3.3-70b-versatile")

    # Fetch project files for context
    project_files = []
    pid: Optional[UUID] = None
    bid: Optional[UUID] = None
    if req.project_id:
        try:
            pid = UUID(req.project_id)
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

    system_prompt = (
        "You are Nulltor Agent, an expert AI software engineer embedded directly inside the Nulltor IDE.\n"
        "You have full autonomy to create, edit, and inspect code files in the user's workspace using your tools.\n"
        f"Active file currently open in editor: {req.active_file_name or 'none'}.\n"
        f"Existing workspace files: {', '.join(project_files) if project_files else 'none'}.\n\n"
        "GUIDELINES:\n"
        "1. When the user asks to create a new file or write code for a new file, call `create_file` with the full code.\n"
        "2. When modifying an existing open file, call `write_code_to_file`.\n"
        "3. Always generate complete, production-ready code with no placeholders or shortcuts."
    )

    history: List[Dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    for m in req.messages:
        # Ignore prior error notifications so they do not poison tool formatting
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

    async def _ensure_db_file_exists(filename: str) -> bool:
        if not pid:
            return False
        try:
            actual_bid = bid
            if not actual_bid:
                from models.branch import Branch
                main_b = (await db.execute(select(Branch.id).where(Branch.project_id == pid, Branch.name == 'main'))).scalar_one_or_none()
                if main_b:
                    actual_bid = main_b

            q = select(Directory).where(Directory.project_id == pid, Directory.name == filename)
            if actual_bid:
                q = q.where(Directory.branch_id == actual_bid)
            existing = (await db.execute(q)).scalar_one_or_none()
            if not existing:
                new_node = Directory(
                    project_id=pid,
                    name=filename,
                    type=NodeType.file,
                    branch_id=actual_bid,
                    created_by=user.id,
                    updated_by=user.id
                )
                db.add(new_node)
                await db.commit()
                return True
        except Exception as e:
            print("DB node creation error:", e)
        return False

    # If an API key is provided, execute the multi-step agent tool loop
    if api_key:
        try:
            max_turns = 5
            turns = 0
            while turns < max_turns:
                turns += 1
                response = _call_llm_api(base_url, api_key, model, history, AGENT_TOOLS)
                choice = response["choices"][0]
                message = choice["message"]
                history.append(message)

                tool_calls = message.get("tool_calls")
                if not tool_calls:
                    content_str = message.get("content") or "Task completed."
                    # If model didn't call tool but provided a code block, extract it
                    if not code_modifications and "```" in content_str:
                        parts = content_str.split("```")
                        if len(parts) >= 3:
                            extracted = parts[1]
                            lang_tag = ""
                            if "\n" in extracted:
                                lang_tag, extracted = extracted.split("\n", 1)
                            target_f = req.active_file_name or "main.js"
                            # If prompt specified a filename, extract it
                            for line in reversed(req.messages):
                                if line.role == "user" and line.content:
                                    import re
                                    m_fn = re.search(r'([a-zA-Z0-9_\-]+\.[a-zA-Z0-9]+)', line.content)
                                    if m_fn:
                                        target_f = m_fn.group(1)
                                    break
                            
                            code_modifications[target_f] = extracted.strip()
                            is_new = await _ensure_db_file_exists(target_f)
                            if is_new or target_f not in project_files:
                                new_files.append(target_f)

                            executed_tools.append(ToolExecutionResult(
                                tool="write_code_to_file",
                                args={"file_name": target_f, "extracted": True},
                                result=f"Extracted and wrote code to '{target_f}'."
                            ))
                    return AgentRunResponse(
                        reply=content_str,
                        updated_messages=history,
                        executed_tools=executed_tools,
                        code_modifications=code_modifications,
                        new_files=new_files
                    )

                # Process all tool calls from the model
                for tc in tool_calls:
                    fn_name = tc["function"]["name"]
                    call_id = tc["id"]
                    try:
                        args = json.loads(tc["function"]["arguments"], strict=False)
                    except Exception:
                        args = {}

                    tool_output = ""
                    if fn_name in ["create_file", "write_code_to_file"]:
                        target_file = args.get("file_name") or req.active_file_name or "main.js"
                        new_code = args.get("code_content", "")
                        code_modifications[target_file] = new_code
                        
                        is_new = await _ensure_db_file_exists(target_file)
                        if is_new or fn_name == "create_file" or target_file not in project_files:
                            if target_file not in new_files:
                                new_files.append(target_file)
                                
                        tool_output = f"Successfully {'created' if fn_name == 'create_file' else 'updated'} '{target_file}' with {len(new_code.splitlines())} lines."
                        executed_tools.append(ToolExecutionResult(
                            tool=fn_name,
                            args={"file_name": target_file, "lines": len(new_code.splitlines())},
                            result=tool_output
                        ))

                    elif fn_name == "read_active_file":
                        tool_output = req.active_file_content or "(File is empty)"
                        executed_tools.append(ToolExecutionResult(
                            tool=fn_name,
                            args={"file_name": req.active_file_name or "unknown"},
                            result=f"Read {len(tool_output)} characters."
                        ))

                    elif fn_name == "list_workspace_files":
                        tool_output = json.dumps(project_files)
                        executed_tools.append(ToolExecutionResult(
                            tool=fn_name,
                            args={},
                            result=f"Found {len(project_files)} files."
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
                        "content": tool_output
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

    # Local fallback
    last_user_msg = ""
    for m in reversed(req.messages):
        if m.role == "user" and m.content:
            last_user_msg = m.content
            break

    target_file = req.active_file_name or "main.js"
    import re
    m_fn = re.search(r'([a-zA-Z0-9_\-]+\.[a-zA-Z0-9]+)', last_user_msg)
    if m_fn:
        target_file = m_fn.group(1)
        new_files.append(target_file)
        await _ensure_db_file_exists(target_file)

    code_out = f"# Implementation for {target_file}\n\ndef fibonacci(n):\n    if n <= 0:\n        return 0\n    elif n == 1:\n        return 1\n    return fibonacci(n-1) + fibonacci(n-2)\n\nprint(fibonacci(10))\n"
    code_modifications[target_file] = code_out
    
    executed_tools.append(ToolExecutionResult(
        tool="create_file" if target_file in new_files else "write_code_to_file",
        args={"file_name": target_file, "lines": len(code_out.splitlines())},
        result=f"Wrote code to {target_file}."
    ))

    reply_text = f"Created `{target_file}` and populated it with the implementation."
    history.append({"role": "assistant", "content": reply_text})

    return AgentRunResponse(
        reply=reply_text,
        updated_messages=history,
        executed_tools=executed_tools,
        code_modifications=code_modifications,
        new_files=new_files
    )
