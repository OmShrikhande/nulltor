const { spawn, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const isWin = process.platform === "win32";
const backendDir = path.join(__dirname, "backend");
const venvDir = path.join(backendDir, "venv");
const venvPython = isWin
    ? path.join(venvDir, "Scripts", "python.exe")
    : path.join(venvDir, "bin", "python");
const venvPip = isWin
    ? path.join(venvDir, "Scripts", "pip.exe")
    : path.join(venvDir, "bin", "pip");

function findSystemPython() {
    const candidates = isWin ? ["python", "py", "python3"] : ["python3", "python"];
    for (const cmd of candidates) {
        try {
            const res = spawnSync(cmd, ["--version"], { stdio: "ignore", shell: true });
            if (res.status === 0) return cmd;
        } catch (e) {}
    }
    return isWin ? "python" : "python3";
}

// 1. Auto-bootstrap virtual environment if missing
if (!fs.existsSync(venvPython)) {
    console.log("\x1b[33m[*] Python virtual environment not detected in backend/venv. Auto-initializing...\x1b[0m");
    const sysPy = findSystemPython();
    console.log(`\x1b[36m> Creating venv using ${sysPy}...\x1b[0m`);
    const venvRes = spawnSync(sysPy, ["-m", "venv", "venv"], { cwd: backendDir, stdio: "inherit", shell: true });
    if (venvRes.status === 0 && fs.existsSync(venvPip)) {
        console.log("\x1b[36m> Installing backend dependencies from requirements.txt...\x1b[0m");
        spawnSync(venvPip, ["install", "-r", "requirements.txt"], { cwd: backendDir, stdio: "inherit", shell: true });
    }
}

// 2. Auto-build frontend bundle if missing
const publicReact = path.join(__dirname, "public_react", "index.html");
if (!fs.existsSync(publicReact)) {
    const frontendDir = path.join(__dirname, "frontend");
    if (fs.existsSync(path.join(frontendDir, "package.json"))) {
        console.log("\x1b[33m[*] Production frontend build not found in public_react. Building React app...\x1b[0m");
        spawnSync("npm", ["run", "build"], { cwd: frontendDir, stdio: "inherit", shell: true });
    }
}

const pythonCmd = fs.existsSync(venvPython) ? venvPython : findSystemPython();

console.log(`\x1b[32m[FastAPI] Launching backend server on port 8001 using: ${pythonCmd}\x1b[0m`);
const proc = spawn(pythonCmd, ["-m", "uvicorn", "main:app", "--port", "8001", "--host", "0.0.0.0", "--reload"], {
    cwd: backendDir,
    stdio: "inherit",
    shell: isWin
});

function cleanup() {
    if (proc && !proc.killed) {
        proc.kill();
    }
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("exit", cleanup);

proc.on("exit", (code) => {
    process.exit(code || 0);
});
