from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Optional, Dict, Any
import asyncio
import os
import sys
import json
import uuid
import shutil
import platform
import tempfile
import subprocess
from core.security import decode_access_token
from core.agent_security import get_sanitized_execution_env
from core.config import settings

# Import winpty on Windows if available
PTY = None
if platform.system() == "Windows":
    try:
        from winpty import PTY  # type: ignore[import-not-found, import-untyped]
    except ImportError:
        PTY = None

router = APIRouter()

def _find_binary(name: str) -> Optional[str]:
    found = shutil.which(name) or shutil.which(f"{name}.exe")
    if found:
        return found
    if platform.system() == "Windows":
        local_app = os.environ.get("LOCALAPPDATA", "")
        if local_app:
            winget_path = os.path.join(local_app, "Microsoft", "WinGet", "Packages")
            if os.path.isdir(winget_path):
                for root, dirs, files in os.walk(winget_path):
                    if f"{name}.exe" in files:
                        return os.path.join(root, f"{name}.exe")
        candidates = [
            r"C:\msys64\mingw64\bin",
            r"C:\msys64\ucrt64\bin",
            r"C:\MinGW\bin",
            r"C:\Program Files\LLVM\bin",
        ]
        for c in candidates:
            p = os.path.join(c, f"{name}.exe")
            if os.path.isfile(p):
                return p
    return None

def _sanitize_output(text: str, temp_dir: str = "") -> str:
    if not text:
        return ""
    if temp_dir:
        text = text.replace(temp_dir + os.sep, "")
        text = text.replace(temp_dir + "/", "")
        text = text.replace(temp_dir + "\\", "")
        text = text.replace(temp_dir, "")
    user_home = os.path.expanduser("~")
    if user_home:
        text = text.replace(user_home + os.sep, "")
        text = text.replace(user_home + "/", "")
        text = text.replace(user_home + "\\", "")
        text = text.replace(user_home, "")
    local_app = os.environ.get("LOCALAPPDATA", "")
    if local_app:
        text = text.replace(local_app + os.sep, "")
        text = text.replace(local_app + "/", "")
        text = text.replace(local_app + "\\", "")
        text = text.replace(local_app, "")
    temp_base = tempfile.gettempdir()
    if temp_base:
        text = text.replace(temp_base + os.sep, "")
        text = text.replace(temp_base + "/", "")
        text = text.replace(temp_base + "\\", "")
        text = text.replace(temp_base, "")
    text = text.replace("nulltor_sessions\\", "")
    text = text.replace("nulltor_sessions/", "")
    return text

def _check_docker_available() -> bool:
    docker_bin = _find_binary("docker")
    if not docker_bin:
        return False
    try:
        res = subprocess.run(["docker", "info"], capture_output=True, timeout=5.0)
        return res.returncode == 0
    except Exception:
        return False


@router.websocket("/ws/terminal")
async def terminal_websocket(websocket: WebSocket):
    # 0. Check authentication token in cookies, query parameters, or fallback payload
    token = websocket.cookies.get("nulltor_access_token") or websocket.query_params.get("token")
    auth_payload = decode_access_token(token) if token else None

    await websocket.accept()

    # If not authenticated via query parameter, allow first packet to pass token fallback
    if not auth_payload:
        try:
            init_data = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
            config = json.loads(init_data)
            token_in_body = config.get("token")
            if token_in_body:
                auth_payload = decode_access_token(token_in_body)
            if not auth_payload:
                await websocket.send_text("\x1b[31mAuthentication Error: Missing or invalid JWT session token.\x1b[0m\r\n")
                await websocket.close(code=4001)
                return
        except Exception:
            await websocket.send_text("\x1b[31mAuthentication Error: Unauthorized.\x1b[0m\r\n")
            await websocket.close(code=4001)
            return
    else:
        # 1. Receive initial configuration
        try:
            init_data = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
            config = json.loads(init_data)
        except Exception as e:
            await websocket.send_text(f"\x1b[31mError receiving initialization data: {e}\x1b[0m\r\n")
            await websocket.close()
            return

    mode = config.get("mode", "exec")
    code = config.get("code", "")
    language = config.get("language", "python")

    cols_raw = config.get("cols")
    rows_raw = config.get("rows")
    try:
        cols = max(20, min(int(cols_raw) if cols_raw is not None and int(cols_raw) > 0 else 80, 500))
    except (ValueError, TypeError):
        cols = 80

    try:
        rows = max(5, min(int(rows_raw) if rows_raw is not None and int(rows_raw) > 0 else 24, 200))
    except (ValueError, TypeError):
        rows = 24

    default_docker = getattr(settings, "USE_DOCKER_SANDBOX", False) or os.environ.get("USE_DOCKER_SANDBOX", "").lower() in ("true", "1")
    use_docker_flag = bool(config.get("use_docker", default_docker))
    timeout_seconds_raw = int(config.get("timeout_seconds", 30))
    if mode == "shell":
        timeout_seconds_raw = 3600
    elif language == "python" and timeout_seconds_raw == 30:
        timeout_seconds_raw = 120
    timeout_seconds = max(5, min(timeout_seconds_raw, 3600))

    # Determine whether to use Docker isolation
    use_docker = use_docker_flag and _check_docker_available()

    # 2. Setup isolated per-session workspace directory
    filename = config.get("filename")
    files_map = config.get("files", {})

    if filename:
        file_ext = os.path.splitext(filename)[1].lower()
        ext_to_lang = {
            ".py": "python",
            ".js": "javascript",
            ".ts": "typescript",
            ".jsx": "javascript",
            ".tsx": "typescript",
            ".c": "c",
            ".cpp": "cpp",
            ".cc": "cpp",
            ".cxx": "cpp",
            ".go": "go",
            ".rs": "rust",
            ".sh": "shell",
            ".bash": "shell",
        }
        if file_ext in ext_to_lang:
            language = ext_to_lang[file_ext]

    ext_map = {
        "python": ".py",
        "javascript": ".js",
        "typescript": ".ts",
        "javascriptreact": ".jsx",
        "typescriptreact": ".tsx",
        "jsx": ".jsx",
        "tsx": ".tsx",
        "c": ".c",
        "cpp": ".cpp",
        "c++": ".cpp",
        "go": ".go",
        "golang": ".go",
        "rust": ".rs",
        "rs": ".rs",
    }
    if language in ext_map:
        ext = ext_map[language]
    elif "javascript" in language or "typescript" in language:
        ext = ".js"
    elif "rust" in language:
        ext = ".rs"
    elif "go" in language:
        ext = ".go"
    elif "c++" in language or "cpp" in language:
        ext = ".cpp"
    elif language == "c":
        ext = ".c"
    else:
        ext = ".py"

    session_id = uuid.uuid4().hex[:12]
    temp_dir = os.path.join(tempfile.gettempdir(), "nulltor_sessions", session_id)
    os.makedirs(temp_dir, exist_ok=True)

    if filename:
        script_name = os.path.basename(filename)
    else:
        script_name = f"main{ext}"

    script_path = os.path.join(temp_dir, script_name)

    if code:
        with open(script_path, "w", encoding="utf-8", newline="") as f:
            f.write(code)

    # Write sibling workspace files if provided
    if isinstance(files_map, dict):
        for fpath, fcontent in files_map.items():
            if fpath and fcontent and fpath != script_name:
                sibling_path = os.path.join(temp_dir, fpath)
                os.makedirs(os.path.dirname(sibling_path), exist_ok=True)
                with open(sibling_path, "w", encoding="utf-8", newline="") as sf:
                    sf.write(fcontent)

    try:
        # 3. Determine runtime command
        node_bin = shutil.which("node") or shutil.which("node.exe") or "node"
        npx_bin = shutil.which("npx.cmd") or shutil.which("npx") or "npx"
        tsx_bin = shutil.which("tsx.cmd") or shutil.which("tsx")

        if mode == "shell" or language in ["shell", "bash", "sh", "powershell", "cmd", "terminal"]:
            if platform.system() == "Windows":
                ps_bin = shutil.which("powershell.exe") or shutil.which("powershell") or os.environ.get("COMSPEC", "cmd.exe")
                app = ps_bin
                cmd_args = [ps_bin, "-NoLogo"]
                spawn_app = ps_bin
                spawn_cmdline = "-NoLogo"
            else:
                sh_bin = shutil.which("bash") or shutil.which("sh") or "/bin/sh"
                app = sh_bin
                cmd_args = [sh_bin]
                spawn_app = sh_bin
                spawn_cmdline = ""
            docker_image = "nulltor-sandbox-node:latest"
            docker_cmd = ["/bin/sh"]

        elif language == "python":
            app = sys.executable or "python"
            cmd_args = [app, "-u", script_name]
            spawn_app = app
            spawn_cmdline = f'-u "{script_name}"'
            docker_image = os.environ.get("DOCKER_IMAGE_PYTHON", "nulltor-python-sandbox:latest")
            docker_cmd = ["python", "-u", f"/code/{script_name}"]

        elif language in ["javascript", "typescript", "javascriptreact", "typescriptreact", "jsx", "tsx"]:
            # If pure JS without JSX/TS syntax, node runs it directly and instantly:
            if language == "javascript" and ext == ".js":
                app = node_bin
                cmd_args = [node_bin, script_name]
                spawn_app = node_bin
                spawn_cmdline = f'"{script_name}"'
            elif tsx_bin:
                app = tsx_bin
                cmd_args = [tsx_bin, script_name]
                spawn_app = tsx_bin
                spawn_cmdline = f'"{script_name}"'
            else:
                # Run via cmd.exe /c npx -y tsx on Windows to prevent Windows "Pick an app" file association popup
                if platform.system() == "Windows":
                    cmd_exe = os.environ.get("COMSPEC", "cmd.exe")
                    app = cmd_exe
                    cmd_args = [cmd_exe, "/c", npx_bin, "-y", "tsx", script_name]
                    spawn_app = cmd_exe
                    spawn_cmdline = f'/c "{npx_bin}" -y tsx "{script_name}"'
                else:
                    app = npx_bin
                    cmd_args = [npx_bin, "-y", "tsx", script_name]
                    spawn_app = npx_bin
                    spawn_cmdline = f'-y tsx "{script_name}"'

            docker_image = "nulltor-sandbox-node:latest"
            if language == "javascript" and ext == ".js":
                docker_cmd = ["node", f"/code/{script_name}"]
            else:
                docker_cmd = ["tsx", f"/code/{script_name}"]

        elif language == "c":
            docker_image = os.environ.get("DOCKER_IMAGE_C", "nulltor-sandbox-c:latest")
            docker_cmd = [
                "sh", "-c",
                f"printf '#include <stdio.h>\\nvoid __attribute__((constructor)) __unbuf(void){{ setvbuf(stdout, NULL, _IONBF, 0); setvbuf(stderr, NULL, _IONBF, 0); }}\\n' > /tmp/_unbuf.c && gcc /code/{script_name} /tmp/_unbuf.c -o /tmp/runner && /tmp/runner"
            ]
            if not use_docker:
                compiler = _find_binary("gcc") or _find_binary("clang")
                if not compiler and _check_docker_available():
                    use_docker = True
                    await websocket.send_text("\x1b[33m[Notice] Local GCC compiler not found on PATH. Automatically running via Docker sandbox...\x1b[0m\r\n")
                elif not compiler:
                    await websocket.send_text(
                        "\x1b[31m[Compiler Error] GCC or Clang compiler not found on system PATH.\r\n"
                        "Please install GCC (e.g. MinGW/MSYS2) or enable Docker Sandbox in settings.\x1b[0m\r\n"
                    )
                    await websocket.close()
                    return
                else:
                    try:
                        await websocket.send_text("\x1b[36m[Compiling C source...]\x1b[0m\r\n")
                        bin_name = "runner.exe" if platform.system() == "Windows" else "runner"
                        output_bin = os.path.join(temp_dir, bin_name)
                        def _do_compile_c():
                            return subprocess.run(
                                [compiler, script_name, "-o", bin_name],
                                cwd=temp_dir,
                                capture_output=True,
                                text=True,
                            )
                        c_res = await asyncio.to_thread(_do_compile_c)
                        if c_res.returncode != 0:
                            diag = _sanitize_output(c_res.stderr, temp_dir).replace("\n", "\r\n")
                            await websocket.send_text(f"\x1b[31m[Compilation Failed]\x1b[0m\r\n{diag}\r\n")
                            await websocket.close()
                            return
                        app = output_bin
                        cmd_args = [output_bin]
                        spawn_app = output_bin
                        spawn_cmdline = ""
                    except Exception as err:
                        await websocket.send_text(f"\x1b[31m[Internal Error during compilation: {err}]\x1b[0m\r\n")
                        await websocket.close()
                        return

        elif language in ["cpp", "c++"]:
            docker_image = os.environ.get("DOCKER_IMAGE_CPP", "nulltor-sandbox-c:latest")
            docker_cmd = [
                "sh", "-c",
                f"printf '#include <stdio.h>\\nextern \"C\" void __attribute__((constructor)) __unbuf(void){{ setvbuf(stdout, NULL, _IONBF, 0); setvbuf(stderr, NULL, _IONBF, 0); }}\\n' > /tmp/_unbuf.c && g++ -std=c++17 /code/{script_name} /tmp/_unbuf.c -o /tmp/runner && /tmp/runner"
            ]
            if not use_docker:
                compiler = _find_binary("g++") or _find_binary("clang++")
                if not compiler and _check_docker_available():
                    use_docker = True
                    await websocket.send_text("\x1b[33m[Notice] Local G++ compiler not found on PATH. Automatically running via Docker sandbox...\x1b[0m\r\n")
                elif not compiler:
                    await websocket.send_text(
                        "\x1b[31m[Compiler Error] G++ or Clang++ compiler not found on system PATH.\r\n"
                        "Please install G++ (e.g. MinGW/MSYS2) or enable Docker Sandbox in settings.\x1b[0m\r\n"
                    )
                    await websocket.close()
                    return
                else:
                    await websocket.send_text("\x1b[36m[Compiling C++ source...]\x1b[0m\r\n")
                    bin_name = "runner.exe" if platform.system() == "Windows" else "runner"
                    output_bin = os.path.join(temp_dir, bin_name)
                    def _do_compile_cpp():
                        return subprocess.run(
                            [compiler, "-std=c++17", script_name, "-o", bin_name],
                            cwd=temp_dir,
                            capture_output=True,
                            text=True,
                        )
                    cpp_res = await asyncio.to_thread(_do_compile_cpp)
                    if cpp_res.returncode != 0:
                        diag = _sanitize_output(cpp_res.stderr, temp_dir).replace("\n", "\r\n")
                        await websocket.send_text(f"\x1b[31m[Compilation Failed]\x1b[0m\r\n{diag}\r\n")
                        await websocket.close()
                        return
                    app = output_bin
                    cmd_args = [output_bin]
                    spawn_app = output_bin
                    spawn_cmdline = ""

        elif language in ["go", "golang"]:
            docker_image = os.environ.get("DOCKER_IMAGE_GO", "golang:alpine")
            docker_cmd = ["go", "run", f"/code/{script_name}"]
            if not use_docker:
                go_bin = _find_binary("go")
                if not go_bin and _check_docker_available():
                    use_docker = True
                    await websocket.send_text("\x1b[33m[Notice] Local Go not found on PATH. Automatically running via Docker sandbox...\x1b[0m\r\n")
                elif not go_bin:
                    await websocket.send_text(
                        "\x1b[31m[Runtime Error] Go compiler/runtime ('go') not found on system PATH.\r\n"
                        "Please install Go or enable Docker Sandbox in settings.\x1b[0m\r\n"
                    )
                    await websocket.close()
                    return
                else:
                    app = go_bin
                    cmd_args = [go_bin, "run", script_name]
                    spawn_app = go_bin
                    spawn_cmdline = f'run "{script_name}"'

        elif language in ["rust", "rs"]:
            docker_image = os.environ.get("DOCKER_IMAGE_RUST", "rust:alpine")
            docker_cmd = ["sh", "-c", f"rustc /code/{script_name} -o /tmp/runner && /tmp/runner"]
            if not use_docker:
                rustc_bin = _find_binary("rustc")
                if not rustc_bin and _check_docker_available():
                    use_docker = True
                    await websocket.send_text("\x1b[33m[Notice] Local Rust compiler not found on PATH. Automatically running via Docker sandbox...\x1b[0m\r\n")
                elif not rustc_bin:
                    await websocket.send_text(
                        "\x1b[31m[Compiler Error] Rust compiler ('rustc') not found on system PATH.\r\n"
                        "Please install Rust (rustup) or enable Docker Sandbox in settings.\x1b[0m\r\n"
                    )
                    await websocket.close()
                    return
                else:
                    await websocket.send_text("\x1b[36m[Compiling Rust source...]\x1b[0m\r\n")
                    bin_name = "runner.exe" if platform.system() == "Windows" else "runner"
                    output_bin = os.path.join(temp_dir, bin_name)
                    def _do_compile_rust():
                        return subprocess.run(
                            [rustc_bin, script_name, "-o", bin_name],
                            cwd=temp_dir,
                            capture_output=True,
                            text=True,
                        )
                    rs_res = await asyncio.to_thread(_do_compile_rust)
                    if rs_res.returncode != 0:
                        diag = _sanitize_output(rs_res.stderr, temp_dir).replace("\n", "\r\n")
                        await websocket.send_text(f"\x1b[31m[Compilation Failed]\x1b[0m\r\n{diag}\r\n")
                        await websocket.close()
                        return
                    app = output_bin
                    cmd_args = [output_bin]
                    spawn_app = output_bin
                    spawn_cmdline = ""

        else:
            await websocket.send_text(f"\x1b[31mUnsupported language: {language}\x1b[0m\r\n")
            await websocket.close()
            return

        # 4a. Docker Sandbox Execution (when enabled and available)
        if use_docker:
            docker_bin = shutil.which("docker") or "docker"
            full_cmd = [
                docker_bin, "run", "--rm", "--interactive",
                "--memory", "2g",
                "--cpus", "2.0",
                "--network", "none",
                "--env", "TF_CPP_MIN_LOG_LEVEL=3",
                "--env", "TF_ENABLE_ONEDNN_OPTS=0",
                "--volume", f"{temp_dir}:/code:ro",
                "--workdir", "/code",
                docker_image,
            ] + docker_cmd

            env = get_sanitized_execution_env({
                "PYTHONUNBUFFERED": "1",
                "PYTHONIOENCODING": "utf-8",
                "PYTHONUTF8": "1",
            })
            proc = subprocess.Popen(
                full_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.PIPE,
                env=env,
            )

            async def docker_stream_output():
                try:
                    if proc.stdout:
                        while True:
                            if hasattr(proc.stdout, 'read1'):
                                chunk = await asyncio.to_thread(proc.stdout.read1, 4096)
                            else:
                                chunk = await asyncio.to_thread(proc.stdout.read, 1024)
                            if not chunk:
                                break
                            text = chunk.decode("utf-8", errors="replace").replace("\n", "\r\n")
                            await websocket.send_text(text)
                except Exception:
                    pass
                finally:
                    try:
                        await websocket.send_text("\r\n\x1b[32m[Process completed]\x1b[0m\r\n")
                    except Exception:
                        pass

            docker_line_buffer = []

            async def docker_stream_input():
                try:
                    while proc.poll() is None:
                        data = await websocket.receive_text()
                        if not data or not proc.stdin or proc.stdin.closed:
                            continue
                        if data.startswith('{') and ('"type": "resize"' in data or '"type":"resize"' in data):
                            continue

                        for ch in data:
                            if ch == "\x03":  # Ctrl+C
                                proc.terminate()
                                break
                            elif ch in ["\r", "\n"]:
                                await websocket.send_text("\r\n")
                                line = "".join(docker_line_buffer) + "\n"
                                docker_line_buffer.clear()
                                proc.stdin.write(line.encode("utf-8"))
                                proc.stdin.flush()
                            elif ch in ["\x7f", "\b"]:
                                if docker_line_buffer:
                                    docker_line_buffer.pop()
                                    await websocket.send_text("\b \b")
                            elif ord(ch) >= 32 or ch == "\t":
                                docker_line_buffer.append(ch)
                                await websocket.send_text(ch)
                except Exception:
                    pass

            try:
                await asyncio.wait_for(
                    asyncio.gather(docker_stream_output(), docker_stream_input()),
                    timeout=float(timeout_seconds)
                )
            except asyncio.TimeoutError:
                proc.kill()
                try:
                    await websocket.send_text(f"\r\n\x1b[31m[Timeout] Process killed after {timeout_seconds}s\x1b[0m\r\n")
                    await websocket.close()
                except Exception:
                    pass
            return  # Done — skip PTY paths below

        # 4b. Windows Host Execution
        if platform.system() == "Windows":
            # For execution mode (or if PTY not available), run directly with high-performance subprocess streaming
            if mode == "exec" or PTY is None:
                compiler_bin_dir = os.path.dirname(app)
                extra = {
                    "PYTHONUNBUFFERED": "1",
                    "PYTHONIOENCODING": "utf-8",
                    "PYTHONUTF8": "1",
                    "NODE_OPTIONS": "--no-warnings",
                }
                env = get_sanitized_execution_env(extra)
                if compiler_bin_dir and compiler_bin_dir not in env.get("PATH", ""):
                    env["PATH"] = f"{compiler_bin_dir};" + env.get("PATH", "")

                try:
                    proc = subprocess.Popen(
                        cmd_args if cmd_args else [app],
                        cwd=temp_dir,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        stdin=subprocess.PIPE,
                        env=env,
                    )
                except Exception as e:
                    await websocket.send_text(f"\x1b[31mFailed to start process: {e}\x1b[0m\r\n")
                    await websocket.close()
                    return

                async def host_stream_output():
                    try:
                        if proc.stdout:
                            while True:
                                # Use read1 for unbuffered chunk reads so prompts without \n (e.g. input('Enter number: ')) stream instantly
                                if hasattr(proc.stdout, 'read1'):
                                    chunk = await asyncio.to_thread(proc.stdout.read1, 4096)
                                else:
                                    chunk = await asyncio.to_thread(proc.stdout.read, 1024)
                                if not chunk:
                                    break
                                text = _sanitize_output(chunk.decode("utf-8", errors="replace"), temp_dir).replace("\n", "\r\n")
                                await websocket.send_text(text)
                    except Exception:
                        pass
                    finally:
                        try:
                            await websocket.send_text("\r\n\x1b[32m[Process completed]\x1b[0m\r\n")
                        except Exception:
                            pass
                        await asyncio.sleep(0.05)
                        try:
                            await websocket.close()
                        except Exception:
                            pass

                host_line_buffer = []

                async def host_stream_input():
                    try:
                        while proc.poll() is None:
                            data = await websocket.receive_text()
                            if not data or not proc.stdin or proc.stdin.closed:
                                continue
                            if data.startswith('{') and ('"type": "resize"' in data or '"type":"resize"' in data):
                                continue

                            for ch in data:
                                if ch == "\x03":  # Ctrl+C
                                    proc.terminate()
                                    break
                                elif ch in ["\r", "\n"]:
                                    await websocket.send_text("\r\n")
                                    line = "".join(host_line_buffer) + "\n"
                                    host_line_buffer.clear()
                                    proc.stdin.write(line.encode("utf-8"))
                                    proc.stdin.flush()
                                elif ch in ["\x7f", "\b"]:
                                    if host_line_buffer:
                                        host_line_buffer.pop()
                                        await websocket.send_text("\b \b")
                                elif ord(ch) >= 32 or ch == "\t":
                                    host_line_buffer.append(ch)
                                    await websocket.send_text(ch)
                    except Exception:
                        pass

                try:
                    await asyncio.wait_for(
                        asyncio.gather(host_stream_output(), host_stream_input()),
                        timeout=float(timeout_seconds)
                    )
                except asyncio.TimeoutError:
                    proc.kill()
                    try:
                        await websocket.send_text(f"\r\n\x1b[31m[Timeout] Process killed after {timeout_seconds}s\x1b[0m\r\n")
                        await websocket.close()
                    except Exception:
                        pass
                return

            else:
                # Windows with winpty available for interactive shell tabs
                try:
                    full_cmd = f'"{spawn_app}" {spawn_cmdline}' if spawn_cmdline else f'"{spawn_app}"'
                    pty = PTY(cols, rows)
                    clean_env_dict = get_sanitized_execution_env({
                        "TERM": "xterm-256color",
                    })
                    winpty_env_str = '\0'.join(f'{k}={v}' for k, v in clean_env_dict.items()) + '\0\0'
                    pty.spawn(full_cmd, cwd=temp_dir, env=winpty_env_str)
                except Exception as e:
                    await websocket.send_text(f"\x1b[31mFailed to spawn PTY: {e}\x1b[0m\r\n")
                    await websocket.close()
                    return

                async def read_from_pty():
                    try:
                        buffer = []
                        last_send = asyncio.get_running_loop().time()

                        async def flush_buffer():
                            nonlocal last_send
                            if buffer:
                                chunk = _sanitize_output("".join(buffer), temp_dir)
                                buffer.clear()
                                await websocket.send_text(chunk)
                                last_send = asyncio.get_running_loop().time()

                        while pty.isalive():
                            data = pty.read(blocking=False)
                            if data:
                                buffer.append(data)
                                now = asyncio.get_running_loop().time()
                                if sum(len(s) for s in buffer) >= 4096 or (now - last_send) >= 0.016:
                                    await flush_buffer()
                                await asyncio.sleep(0)
                            else:
                                if buffer:
                                    await flush_buffer()
                                await asyncio.sleep(0.035)

                        while True:
                            data = pty.read(blocking=False)
                            if data:
                                buffer.append(data)
                            else:
                                break
                        await flush_buffer()
                    except Exception:
                        pass
                    finally:
                        if mode != "shell":
                            try:
                                await websocket.send_text("\r\n\x1b[32m[Process completed] — [Host] Local Execution\x1b[0m\r\n")
                            except Exception:
                                pass
                        await asyncio.sleep(0.2)
                        try:
                            await websocket.close()
                        except Exception:
                            pass

                async def write_to_pty():
                    try:
                        while pty.isalive():
                            data = await websocket.receive_text()
                            if data:
                                if data.startswith('{') and ('"type": "resize"' in data or '"type":"resize"' in data):
                                    try:
                                        rcfg = json.loads(data)
                                        pty.set_size(rcfg.get("cols", cols), rcfg.get("rows", rows))
                                        continue
                                    except Exception:
                                        pass
                                pty.write(data)
                    except WebSocketDisconnect:
                        pass
                    except Exception:
                        pass

                await asyncio.gather(read_from_pty(), write_to_pty())

        else:
            # 5. POSIX PTY Execution (Linux / macOS)
            try:
                import pty  # type: ignore[import-not-found]
                import fcntl  # type: ignore[import-not-found]
                import struct
                import termios  # type: ignore[import-not-found]
            except ImportError:
                await websocket.send_text("\x1b[31mPOSIX PTY modules not available on this platform\x1b[0m\r\n")
                await websocket.close()
                return

            pid, fd = pty.fork()
            if pid == 0:
                # Child process
                os.chdir(temp_dir)
                env = get_sanitized_execution_env({
                    "PYTHONUNBUFFERED": "1",
                    "NODE_OPTIONS": "--no-warnings",
                    "TERM": "xterm-256color"
                })
                os.execvpe(app, cmd_args, env)
            else:
                # Parent process
                def set_winsize(fd, rows, cols):
                    try:
                        winsize = struct.pack("HHHH", rows, cols, 0, 0)
                        fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)
                    except Exception:
                        pass
                
                set_winsize(fd, rows, cols)

                # Set fd to non-blocking
                fl = fcntl.fcntl(fd, fcntl.F_GETFL)
                fcntl.fcntl(fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)

                async def read_from_pty():
                    try:
                        buffer = []
                        last_send = asyncio.get_running_loop().time()

                        async def flush_buffer():
                            nonlocal last_send
                            if buffer:
                                chunk = "".join(buffer)
                                buffer.clear()
                                await websocket.send_text(chunk)
                                last_send = asyncio.get_running_loop().time()

                        while True:
                            try:
                                data = os.read(fd, 4096)
                                if not data:
                                    break
                                buffer.append(data.decode('utf-8', errors='replace'))
                                now = asyncio.get_running_loop().time()
                                if sum(len(s) for s in buffer) >= 4096 or (now - last_send) >= 0.016:
                                    await flush_buffer()
                                await asyncio.sleep(0)
                            except BlockingIOError:
                                if buffer:
                                    await flush_buffer()
                                await asyncio.sleep(0.035)
                            except OSError:
                                break
                        await flush_buffer()
                    except Exception:
                        pass
                    finally:
                        try:
                            await websocket.send_text("\r\n\x1b[32m[Process completed]\x1b[0m\r\n")
                        except Exception:
                            pass
                        await asyncio.sleep(0.2)
                        try:
                            await websocket.close()
                        except Exception:
                            pass
                        try:
                            os.waitpid(pid, os.WNOHANG)
                        except ChildProcessError:
                            pass

                async def write_to_pty():
                    try:
                        while True:
                            data = await websocket.receive_text()
                            if data:
                                if data.startswith('{') and ('"type": "resize"' in data or '"type":"resize"' in data):
                                    try:
                                        rcfg = json.loads(data)
                                        set_winsize(fd, rcfg.get("rows", rows), rcfg.get("cols", cols))
                                        continue
                                    except Exception:
                                        pass
                                os.write(fd, data.encode('utf-8'))
                    except WebSocketDisconnect:
                        pass
                    except Exception:
                        pass

                await asyncio.gather(read_from_pty(), write_to_pty())

    finally:
        # Clean up temporary session sandbox directory
        try:
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass

