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

    # 2. Write code to OS system temp directory
    ext = ".py" if language == "python" else ".js" if language in ["javascript", "typescript"] else ".txt"
    temp_dir = os.path.join(tempfile.gettempdir(), "nulltor_exec")
    os.makedirs(temp_dir, exist_ok=True)
    script_name = f"nulltor_exec_{uuid.uuid4().hex[:8]}{ext}"
    script_path = os.path.join(temp_dir, script_name)
    
    with open(script_path, "w", encoding="utf-8") as f:
        f.write(code)

    try:
        # Fallback / local process command setup
        if language == "python":
            app = sys.executable or "python"
            cmd_args = [app, script_path]
        elif language in ["javascript", "typescript"]:
            app = shutil.which("node") or shutil.which("node.exe") or "node"
            cmd_args = [app, script_path]
        else:
            await websocket.send_text(f"\x1b[31mUnsupported language: {language}\x1b[0m\r\n")
            await websocket.close()
            return

        proc = await asyncio.create_subprocess_exec(
            *cmd_args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            stdin=asyncio.subprocess.PIPE,
            cwd=temp_dir
        )

        async def stream_stdout():
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                # Replace \n with \r\n for xterm.js
                text = line.decode("utf-8", errors="replace").replace("\r\n", "\n").replace("\n", "\r\n")
                await websocket.send_text(text)

        async def stream_stderr():
            while True:
                line = await proc.stderr.readline()
                if not line:
                    break
                text = line.decode("utf-8", errors="replace").replace("\r\n", "\n").replace("\n", "\r\n")
                await websocket.send_text(f"\x1b[31m{text}\x1b[0m")

        await asyncio.gather(stream_stdout(), stream_stderr())
        return_code = await proc.wait()

        if return_code == 0:
            await websocket.send_text("\r\n\x1b[32m[Process completed successfully with code 0]\x1b[0m\r\n")
        else:
            await websocket.send_text(f"\r\n\x1b[31m[Process exited with error code {return_code}]\x1b[0m\r\n")

        await asyncio.sleep(0.3)
        try:
            await websocket.close()
        except Exception:
            pass

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_text(f"\r\n\x1b[31mExecution error: {e}\x1b[0m\r\n")
            await websocket.close()
        except Exception:
            pass
    finally:
        try:
            if os.path.exists(script_path):
                os.remove(script_path)
        except Exception:
            pass
