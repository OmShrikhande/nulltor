import ast
import json
import re
import shutil
import subprocess
import tempfile
import os
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from core.deps import get_current_user
from models.user import User

router = APIRouter(prefix="/lsp", tags=["LSP / Language Intelligence"])


class DiagnosticItem(BaseModel):
    line: int
    column: int
    end_line: int
    end_column: int
    message: str
    severity: str  # 'error' | 'warning' | 'info'


class CompletionItem(BaseModel):
    label: str
    kind: str  # 'Keyword' | 'Function' | 'Class' | 'Snippet' | 'Variable'
    detail: Optional[str] = None
    insert_text: Optional[str] = None
    documentation: Optional[str] = None


class LSPAnalyzeRequest(BaseModel):
    code: str
    language: str
    filename: Optional[str] = None


class LSPAnalyzeResponse(BaseModel):
    diagnostics: List[DiagnosticItem] = []
    completions: List[CompletionItem] = []


COMMON_COMPLETIONS: Dict[str, List[Dict[str, Any]]] = {
    "python": [
        {"label": "def", "kind": "Keyword", "detail": "Define a function", "insert_text": "def ${1:function_name}(${2:args}):\n    ${0:pass}"},
        {"label": "class", "kind": "Keyword", "detail": "Define a class", "insert_text": "class ${1:ClassName}:\n    def __init__(self${2:, args}):\n        ${0:pass}"},
        {"label": "import", "kind": "Keyword", "detail": "Import module", "insert_text": "import ${0:module}"},
        {"label": "from import", "kind": "Keyword", "detail": "From module import", "insert_text": "from ${1:module} import ${0:name}"},
        {"label": "if __name__ == '__main__'", "kind": "Snippet", "detail": "Main entry point guard", "insert_text": "if __name__ == '__main__':\n    ${0:main()}"},
        {"label": "try ... except", "kind": "Snippet", "detail": "Exception handling block", "insert_text": "try:\n    ${1:pass}\nexcept ${2:Exception} as e:\n    ${0:print(f'Error: {e}')}"},
        {"label": "print", "kind": "Function", "detail": "print(*values, sep=' ', end='\\n')", "insert_text": "print(${0})"},
        {"label": "async def", "kind": "Keyword", "detail": "Define async coroutine", "insert_text": "async def ${1:coroutine_name}(${2:args}):\n    ${0:pass}"},
    ],
    "javascript": [
        {"label": "function", "kind": "Keyword", "detail": "Function declaration", "insert_text": "function ${1:name}(${2:params}) {\n  ${0}\n}"},
        {"label": "arrow function", "kind": "Snippet", "detail": "const fn = () => {}", "insert_text": "const ${1:name} = (${2:params}) => {\n  ${0}\n};"},
        {"label": "async function", "kind": "Keyword", "detail": "Async function", "insert_text": "async function ${1:name}(${2:params}) {\n  ${0}\n}"},
        {"label": "import from", "kind": "Keyword", "detail": "ES6 import", "insert_text": "import { ${1:names} } from '${2:module}';"},
        {"label": "console.log", "kind": "Function", "detail": "console.log(data)", "insert_text": "console.log(${0});"},
        {"label": "try ... catch", "kind": "Snippet", "detail": "Try catch block", "insert_text": "try {\n  ${1}\n} catch (err) {\n  console.error(err);\n}"},
    ],
    "typescript": [
        {"label": "interface", "kind": "Keyword", "detail": "TypeScript interface", "insert_text": "interface ${1:Name} {\n  ${0}\n}"},
        {"label": "type", "kind": "Keyword", "detail": "Type alias", "insert_text": "type ${1:Name} = ${0};"},
        {"label": "const", "kind": "Keyword", "detail": "Constant variable", "insert_text": "const ${1:name}: ${2:type} = ${0};"},
    ],
    "c": [
        {"label": "#include <stdio.h>", "kind": "Snippet", "detail": "Standard I/O header", "insert_text": "#include <stdio.h>\n"},
        {"label": "#include <stdlib.h>", "kind": "Snippet", "detail": "Standard library header", "insert_text": "#include <stdlib.h>\n"},
        {"label": "main", "kind": "Snippet", "detail": "int main(int argc, char *argv[])", "insert_text": "int main(int argc, char *argv[]) {\n    ${0:printf(\"Hello, World!\\\\n\");}\n    return 0;\n}"},
        {"label": "printf", "kind": "Function", "detail": "int printf(const char *format, ...)", "insert_text": "printf(\"${1:%s}\\\\n\"${2:, val});"},
        {"label": "struct", "kind": "Keyword", "detail": "Struct definition", "insert_text": "typedef struct {\n    ${0}\n} ${1:Name};"},
    ],
    "cpp": [
        {"label": "#include <iostream>", "kind": "Snippet", "detail": "C++ I/O stream", "insert_text": "#include <iostream>\nusing namespace std;\n"},
        {"label": "#include <vector>", "kind": "Snippet", "detail": "C++ STL vector", "insert_text": "#include <vector>\n"},
        {"label": "main", "kind": "Snippet", "detail": "int main()", "insert_text": "int main() {\n    ${0:cout << \"Hello, World!\" << endl;}\n    return 0;\n}"},
    ],
    "rust": [
        {"label": "fn main", "kind": "Snippet", "detail": "fn main() { ... }", "insert_text": "fn main() {\n    ${0:println!(\"Hello, World!\");}\n}"},
        {"label": "println!", "kind": "Function", "detail": "println!(\"{}\", val)", "insert_text": "println!(\"${1:{}}\"${2:, val});"},
        {"label": "struct", "kind": "Keyword", "detail": "struct declaration", "insert_text": "struct ${1:Name} {\n    ${0}\n}"},
    ],
    "go": [
        {"label": "package main", "kind": "Snippet", "detail": "Go main package header", "insert_text": "package main\n\nimport \"fmt\"\n\nfunc main() {\n\t${0:fmt.Println(\"Hello, World!\")}\n}"},
        {"label": "func", "kind": "Keyword", "detail": "func declaration", "insert_text": "func ${1:name}(${2:params}) ${3:returnType} {\n\t${0}\n}"},
        {"label": "fmt.Println", "kind": "Function", "detail": "fmt.Println(...)", "insert_text": "fmt.Println(${0})"},
    ],
}


def _analyze_python(code: str) -> List[DiagnosticItem]:
    diagnostics = []
    try:
        ast.parse(code)
    except SyntaxError as e:
        line = e.lineno or 1
        col = e.offset or 1
        end_line = e.end_lineno or line
        end_col = e.end_offset or (col + 4)
        msg = e.msg or "Syntax error"
        diagnostics.append(DiagnosticItem(
            line=line,
            column=col,
            end_line=end_line,
            end_column=max(col + 1, end_col),
            message=f"Python SyntaxError: {msg}",
            severity="error",
        ))
    except Exception as e:
        diagnostics.append(DiagnosticItem(
            line=1,
            column=1,
            end_line=1,
            end_column=10,
            message=f"Analysis Error: {str(e)}",
            severity="warning",
        ))
    return diagnostics


def _analyze_json(code: str) -> List[DiagnosticItem]:
    diagnostics = []
    try:
        json.loads(code)
    except json.JSONDecodeError as e:
        diagnostics.append(DiagnosticItem(
            line=e.lineno,
            column=e.colno,
            end_line=e.lineno,
            end_column=e.colno + 1,
            message=f"Invalid JSON: {e.msg}",
            severity="error",
        ))
    return diagnostics


def _analyze_c_family(code: str, language: str) -> List[DiagnosticItem]:
    diagnostics = []
    # Check for basic unbalanced braces/parentheses
    stack = []
    lines = code.split("\n")
    for r_idx, line in enumerate(lines):
        for c_idx, ch in enumerate(line):
            if ch in "{[(":
                stack.append((ch, r_idx + 1, c_idx + 1))
            elif ch in "}])":
                if not stack:
                    diagnostics.append(DiagnosticItem(
                        line=r_idx + 1,
                        column=c_idx + 1,
                        end_line=r_idx + 1,
                        end_column=c_idx + 2,
                        message=f"Unmatched closing bracket '{ch}'",
                        severity="error",
                    ))
                else:
                    open_ch, o_line, o_col = stack.pop()
                    expected = {"{": "}", "[": "]", "(": ")"}.get(open_ch)
                    if expected != ch:
                        diagnostics.append(DiagnosticItem(
                            line=r_idx + 1,
                            column=c_idx + 1,
                            end_line=r_idx + 1,
                            end_column=c_idx + 2,
                            message=f"Mismatched bracket: opened with '{open_ch}' at line {o_line}, closed with '{ch}'",
                            severity="error",
                        ))
    for open_ch, o_line, o_col in stack:
        diagnostics.append(DiagnosticItem(
            line=o_line,
            column=o_col,
            end_line=o_line,
            end_column=o_col + 1,
            message=f"Unclosed opening bracket '{open_ch}'",
            severity="error",
        ))

    # If GCC / Clang compiler is locally available, run lightweight syntax check
    compiler = shutil.which("gcc") if language == "c" else shutil.which("g++")
    if compiler and len(code.strip()) > 0 and len(diagnostics) == 0:
        try:
            with tempfile.NamedTemporaryFile(suffix=".c" if language == "c" else ".cpp", delete=False, mode="w", encoding="utf-8") as tf:
                tf.write(code)
                temp_path = tf.name
            try:
                res = subprocess.run([compiler, "-fsyntax-only", temp_path], capture_output=True, text=True, timeout=3.0)
                if res.returncode != 0 and res.stderr:
                    for err_line in res.stderr.splitlines()[:5]:
                        m = re.search(r":(\d+):(\d+):\s+(error|warning):\s+(.*)", err_line)
                        if m:
                            l_num = int(m.group(1))
                            c_num = int(m.group(2))
                            sev = "error" if m.group(3) == "error" else "warning"
                            msg = m.group(4)
                            diagnostics.append(DiagnosticItem(
                                line=l_num,
                                column=c_num,
                                end_line=l_num,
                                end_column=c_num + 5,
                                message=msg,
                                severity=sev,
                            ))
            finally:
                if os.path.exists(temp_path):
                    os.unlink(temp_path)
        except Exception:
            pass

    return diagnostics


@router.post("/analyze", response_model=LSPAnalyzeResponse, summary="Perform multi-language syntax analysis & diagnostics")
async def analyze_code(
    payload: LSPAnalyzeRequest,
    user: User = Depends(get_current_user),
) -> LSPAnalyzeResponse:
    lang = (payload.language or "").lower()
    code = payload.code or ""
    diagnostics: List[DiagnosticItem] = []

    if not code.strip():
        return LSPAnalyzeResponse(diagnostics=[], completions=[])

    if lang in ("python", "py"):
        diagnostics = _analyze_python(code)
    elif lang in ("json",):
        diagnostics = _analyze_json(code)
    elif lang in ("c", "cpp", "c++", "rust", "rs", "go"):
        diagnostics = _analyze_c_family(code, lang)

    # Gather autocompletions for the language
    raw_completions = COMMON_COMPLETIONS.get(lang, [])
    if not raw_completions and "javascript" in lang:
        raw_completions = COMMON_COMPLETIONS.get("javascript", [])
    elif not raw_completions and "typescript" in lang:
        raw_completions = COMMON_COMPLETIONS.get("javascript", []) + COMMON_COMPLETIONS.get("typescript", [])

    completions = [CompletionItem(**item) for item in raw_completions]

    return LSPAnalyzeResponse(diagnostics=diagnostics, completions=completions)
