const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const isWin = process.platform === "win32";
const venvPython = isWin
    ? path.join(__dirname, "backend", "venv", "Scripts", "python.exe")
    : path.join(__dirname, "backend", "venv", "bin", "python");

const pythonCmd = fs.existsSync(venvPython) ? venvPython : (isWin ? "python" : "python3");

console.log(`[FastAPI] Launching backend server on port 8001 using: ${pythonCmd}`);
const proc = spawn(pythonCmd, ["-m", "uvicorn", "main:app", "--port", "8001", "--host", "0.0.0.0", "--reload"], {
    cwd: path.join(__dirname, "backend"),
    stdio: "inherit"
});

proc.on("exit", (code) => {
    process.exit(code || 0);
});
