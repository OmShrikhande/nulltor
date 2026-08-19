from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
import os
import sys
import json
import uuid
import shutil
import platform
import tempfile
import subprocess

# Import winpty on Windows if available
PTY = None
if platform.system() == "Windows":
    try:
        from winpty import PTY  # type: ignore[import-not-found, import-untyped]
    except ImportError:
        PTY = None

router = APIRouter()

def _check_docker_available() -> bool:
    docker_bin = shutil.which("docker") or shutil.which("docker.exe")
    if not docker_bin:
        return False
    try:
        res = subprocess.run(["docker", "info"], capture_output=True, timeout=5.0)
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
        # Client-controlled flags (from Settings page)
        use_docker_flag = bool(config.get("use_docker", False))
        timeout_seconds_raw = int(config.get("timeout_seconds", 30))
        if language == "python" and timeout_seconds_raw == 30:
            timeout_seconds_raw = 120  # AI / ML imports take a very long time
        timeout_seconds = max(5, min(timeout_seconds_raw, 300))
    except Exception as e:
        await websocket.send_text(f"\x1b[31mError receiving initialization data: {e}\x1b[0m\r\n")
        await websocket.close()
        return

    # Determine whether to use Docker isolation
    use_docker = use_docker_flag and _check_docker_available()

    # 2. Write code to OS system temp directory
    ext = ".py" if language == "python" else ".js" if language in ["javascript", "typescript"] else ".txt"
    temp_dir = os.path.join(tempfile.gettempdir(), "nulltor_exec")
    os.makedirs(temp_dir, exist_ok=True)
    script_name = f"nulltor_exec_{uuid.uuid4().hex[:8]}{ext}"
    script_path = os.path.join(temp_dir, script_name)

    with open(script_path, "w", encoding="utf-8") as f:
        f.write(code)

    # Create script file



    try:
        # 3. Determine runtime command
        if language == "python":
            app = sys.executable or "python"
            cmd_args = [app, "-u", script_path]
            docker_image = "nulltor-sandbox-python:latest"
            docker_cmd = ["python", "-u", f"/code/{script_name}"]
        elif language in ["javascript", "typescript"]:
            tsx_bin = shutil.which("tsx") or shutil.which("tsx.cmd")
            if tsx_bin:
                app = tsx_bin
                cmd_args = [app, script_path]
            else:
                npx_bin = shutil.which("npx") or shutil.which("npx.cmd") or "npx"
                app = npx_bin
                cmd_args = [app, "-y", "tsx", script_path]
            docker_image = "nulltor-sandbox-node:latest"
            docker_cmd = ["tsx", f"/code/{script_name}"]
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

            import subprocess
            env = os.environ.copy()
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
                            # Use asyncio.to_thread to read without blocking the event loop
                            # This bypasses Uvicorn's SelectorEventLoop restrictions on Windows
                            line = await asyncio.to_thread(proc.stdout.readline)
                            if not line:
                                break
                            text = line.decode("utf-8", errors="replace").replace("\n", "\r\n")
                            await websocket.send_text(text)
                except Exception:
                    pass
                finally:
                    try:
                        await websocket.send_text("\r\n\x1b[32m[Container exited]\x1b[0m\r\n")
                    except Exception:
                        pass
                    try:
                        # Only print container exited if it hasn't timed out yet
                        if proc.poll() is not None:
                            await websocket.send_text("\r\n\x1b[32m[Container exited]\x1b[0m\r\n")
                    except Exception:
                        pass

            async def docker_stream_input():
                try:
                    while proc.poll() is None:
                        data = await websocket.receive_text()
                        if data and proc.stdin and not proc.stdin.closed:
                            if not (data.startswith('{') and ('"type": "resize"' in data or '"type":"resize"' in data)):
                                proc.stdin.write(data.encode("utf-8"))
                                proc.stdin.flush()
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

        # 4b. Windows Host PTY Execution

        if platform.system() == "Windows":
            if PTY is not None:
                # Windows with winpty available
                try:
                    pty = PTY(cols, rows)
                    cmdline = f'"{script_path}"' if language == "python" else f'"{script_path}"'
                    pty.spawn(app, cmdline=cmdline)
                except Exception as e:
                    await websocket.send_text(f"\x1b[31mFailed to spawn PTY: {e}\x1b[0m\r\n")
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
                            mode_str = "[Sandbox] Docker" if use_docker else "[Host] Local Execution"
                            await websocket.send_text(f"\r\n\x1b[32m[Process completed] — {mode_str}\x1b[0m\r\n")
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
                # Windows fallback without winpty: standard subprocess execution
                env = os.environ.copy()
                env["PYTHONUNBUFFERED"] = "1"
                proc = await asyncio.create_subprocess_exec(
                    *cmd_args,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT,
                    stdin=asyncio.subprocess.PIPE,
                    env=env,
                )

                async def stream_output():
                    try:
                        if proc.stdout:
                            while True:
                                line = await proc.stdout.readline()
                                if not line:
                                    break
                                text = line.decode('utf-8', errors='replace').replace('\n', '\r\n')
                                await websocket.send_text(text)
                    except Exception:
                        pass
                    finally:
                        try:
                            mode_str = "[Sandbox] Docker" if use_docker else "[Host] Local Execution"
                            await websocket.send_text(f"\r\n\x1b[32m[Process completed] — {mode_str}\x1b[0m\r\n")
                        except Exception:
                            pass
                        await asyncio.sleep(0.2)
                        try:
                            await websocket.close()
                        except Exception:
                            pass

                async def stream_input():
                    try:
                        while proc.returncode is None:
                            data = await websocket.receive_text()
                            if data and proc.stdin and not proc.stdin.is_closing():
                                if not (data.startswith('{') and ('"type": "resize"' in data or '"type":"resize"' in data)):
                                    proc.stdin.write(data.encode('utf-8'))
                                    await proc.stdin.drain()
                    except WebSocketDisconnect:
                        pass
                    except Exception:
                        pass

                await asyncio.gather(stream_output(), stream_input())

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
                env = os.environ.copy()
                env["PYTHONUNBUFFERED"] = "1"
                env["NODE_OPTIONS"] = "--no-warnings"
                env["TERM"] = "xterm-256color"
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
                        while True:
                            try:
                                data = os.read(fd, 4096)
                                if not data:
                                    break
                                await websocket.send_text(data.decode('utf-8', errors='replace'))
                            except BlockingIOError:
                                await asyncio.sleep(0.01)
                            except OSError:
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
        # Clean up temporary script
        try:
            if os.path.exists(script_path):
                os.remove(script_path)
        except Exception:
            pass

