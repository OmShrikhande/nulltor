from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
import os
import sys
import json
import uuid
import shutil
import subprocess
import platform

import tempfile

# Import winpty on Windows if available
PTY = None
if platform.system() == "Windows":
    try:
        from winpty import PTY
    except ImportError:
        PTY = None

router = APIRouter()

def _check_docker_available() -> bool:
    docker_bin = shutil.which("docker") or shutil.which("docker.exe")
    if not docker_bin:
        return False
    try:
        res = subprocess.run(["docker", "info"], capture_output=True, timeout=1.2)
        return res.returncode == 0
    except Exception:
        return False


@router.websocket("/ws/terminal")
async def terminal_websocket(websocket: WebSocket):
    await websocket.accept()
    
    # 1. Receive initial configuration (the code to run and language)
    try:
        init_data = await websocket.receive_text()
        config = json.loads(init_data)
        code = config.get("code", "")
        language = config.get("language", "python")
        cols = config.get("cols", 80)
        rows = config.get("rows", 24)
    except Exception as e:
        await websocket.send_text(f"\x1b[31mError receiving initialization data: {e}\x1b[0m\r\n")
        await websocket.close()
        return

    # 2. Write code to OS system temp directory (never pollutes git workspace)
    ext = ".py" if language == "python" else ".js" if language in ["javascript", "typescript"] else ".txt"
    temp_dir = os.path.join(tempfile.gettempdir(), "nulltor_exec")
    os.makedirs(temp_dir, exist_ok=True)
    script_name = f"nulltor_exec_{uuid.uuid4().hex[:8]}{ext}"
    script_path = os.path.join(temp_dir, script_name)
    
    with open(script_path, "w", encoding="utf-8") as f:
        f.write(code)

    try:
        # 3. Choose execution engine: Docker Sandbox (if present) vs Local Process (fallback)
        has_docker = _check_docker_available()
        
        if has_docker:
            app = "docker.exe" if platform.system() == "Windows" else "docker"
            if language == "python":
                cmdline = f'run -it --rm -v "{temp_dir}:/app" python:3.11-alpine python /app/{script_name}'
            elif language in ["javascript", "typescript"]:
                cmdline = f'run -it --rm -v "{temp_dir}:/app" node:20-alpine node /app/{script_name}'
            else:
                await websocket.send_text(f"\x1b[31mUnsupported language: {language}\x1b[0m\r\n")
                await websocket.close()
                return
        else:
            # Fallback to local host runtime
            if language == "python":
                app = sys.executable or "python"
                cmdline = f'"{script_path}"'
            elif language in ["javascript", "typescript"]:
                app = shutil.which("node") or shutil.which("node.exe") or "node"
                cmdline = f'"{script_path}"'
            else:
                await websocket.send_text(f"\x1b[31mUnsupported language: {language}\x1b[0m\r\n")
                await websocket.close()
                return

        # 4. Windows PTY Execution
        if platform.system() == "Windows" and PTY is not None:
            try:
                pty = PTY(cols, rows)
                pty.spawn(app, cmdline=cmdline)
            except Exception as e:
                await websocket.send_text(f"\x1b[31mFailed to spawn terminal process: {e}\x1b[0m\r\n")
                await websocket.close()
                return

            async def read_from_pty():
                try:
                    while pty.isalive():
                        data = pty.read(blocking=False)
                        if data:
                            await websocket.send_text(data)
                        else:
                            await asyncio.sleep(0.01)
                    
                    while True:
                        data = pty.read(blocking=False)
                        if data:
                            await websocket.send_text(data)
                        else:
                            break
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
            # Cross-platform subprocess execution (Linux/Mac/Windows without pywinpty)
            try:
                full_cmd = f'{app} {cmdline}'
                proc = await asyncio.create_subprocess_shell(
                    full_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    stdin=asyncio.subprocess.PIPE,
                    cwd=temp_dir
                )

                async def stream_output(stream):
                    while True:
                        line = await stream.read(1024)
                        if not line:
                            break
                        await websocket.send_text(line.decode("utf-8", errors="replace"))

                await asyncio.gather(
                    stream_output(proc.stdout),
                    stream_output(proc.stderr)
                )
                await proc.wait()
                await websocket.send_text("\x1b[32m\r\n[Process Exited]\x1b[0m\r\n")
                await websocket.close()
            except Exception as e:
                await websocket.send_text(f"\x1b[31mExecution error: {e}\x1b[0m\r\n")
                await websocket.close()
    finally:
        # Auto-delete temporary script file immediately after execution completes
        try:
            if os.path.exists(script_path):
                os.remove(script_path)
        except Exception:
            pass
