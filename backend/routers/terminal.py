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
    ext_map = {
        "python": ".py",
        "javascript": ".js",
        "typescript": ".ts",
        "javascriptreact": ".jsx",
        "typescriptreact": ".tsx",
        "jsx": ".jsx",
        "tsx": ".tsx",
    }
    ext = ext_map.get(language, ".js" if "javascript" in language or "typescript" in language else ".py")
    temp_dir = os.path.join(tempfile.gettempdir(), "nulltor_exec")
    os.makedirs(temp_dir, exist_ok=True)
    script_name = f"nulltor_exec_{uuid.uuid4().hex[:8]}{ext}"
    script_path = os.path.join(temp_dir, script_name)

    with open(script_path, "w", encoding="utf-8") as f:
        f.write(code)

    try:
        # 3. Determine runtime command
        node_bin = shutil.which("node") or shutil.which("node.exe") or "node"
        npx_bin = shutil.which("npx.cmd") or shutil.which("npx") or "npx"
        tsx_bin = shutil.which("tsx.cmd") or shutil.which("tsx")

        if language == "python":
            app = sys.executable or "python"
            cmd_args = [app, "-u", script_path]
            spawn_app = app
            spawn_cmdline = f'-u "{script_path}"'
            docker_image = "nulltor-sandbox-python:latest"
            docker_cmd = ["python", "-u", f"/code/{script_name}"]
        elif language in ["javascript", "typescript", "javascriptreact", "typescriptreact", "jsx", "tsx"]:
            # If pure JS without JSX/TS syntax, node runs it directly and instantly:
            if language == "javascript" and ext == ".js":
                app = node_bin
                cmd_args = [node_bin, script_path]
                spawn_app = node_bin
                spawn_cmdline = f'"{script_path}"'
            elif tsx_bin:
                app = tsx_bin
                cmd_args = [tsx_bin, script_path]
                spawn_app = tsx_bin
                spawn_cmdline = f'"{script_path}"'
            else:
                # Run via cmd.exe /c npx -y tsx on Windows to prevent Windows "Pick an app" file association popup
                if platform.system() == "Windows":
                    cmd_exe = os.environ.get("COMSPEC", "cmd.exe")
                    app = cmd_exe
                    cmd_args = [cmd_exe, "/c", npx_bin, "-y", "tsx", script_path]
                    spawn_app = cmd_exe
                    spawn_cmdline = f'/c "{npx_bin}" -y tsx "{script_path}"'
                else:
                    app = npx_bin
                    cmd_args = [npx_bin, "-y", "tsx", script_path]
                    spawn_app = npx_bin
                    spawn_cmdline = f'-y tsx "{script_path}"'

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
                    pty.spawn(spawn_app, cmdline=spawn_cmdline)
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
                                chunk = "".join(buffer)
                                buffer.clear()
                                await websocket.send_text(chunk)
                                last_send = asyncio.get_running_loop().time()

                        while pty.isalive():
                            data = pty.read(blocking=False)
                            if data:
                                buffer.append(data)
                                now = asyncio.get_running_loop().time()
                                # Flush if buffer exceeds 4KB or 16ms frame budget has elapsed (60 FPS)
                                if sum(len(s) for s in buffer) >= 4096 or (now - last_send) >= 0.016:
                                    await flush_buffer()
                                # Yield to event loop immediately during active output
                                await asyncio.sleep(0)
                            else:
                                if buffer:
                                    await flush_buffer()
                                # Adaptive sleep on idle (35ms instead of 100Hz busy loop, reduces idle CPU by ~85%)
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
        # Clean up temporary script
        try:
            if os.path.exists(script_path):
                os.remove(script_path)
        except Exception:
            pass

