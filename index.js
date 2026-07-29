const express  = require("express");
const http     = require("http");
const path     = require("path");
const fs       = require("fs");
const { execFile, spawn } = require("child_process");
const { Server } = require("socket.io");

// ── IDE workspace root ────────────────────────────────────────────────────────
const IDE_WORKSPACE = path.join(__dirname, "ide-workspace");
fs.mkdirSync(IDE_WORKSPACE, { recursive: true });
const DEFAULT_PROJECT = path.join(IDE_WORKSPACE, "default");
fs.mkdirSync(DEFAULT_PROJECT, { recursive: true });

// Languages allowed to execute (whitelist)
const LANG_EXECUTORS = {
    python:     { cmd: "python",   args: (f) => [f] },
    javascript: { cmd: "node",     args: (f) => [f] },
    shell:      { cmd: "bash",     args: (f) => [f] },
    ruby:       { cmd: "ruby",     args: (f) => [f] },
    go:         { cmd: "go",       args: (f) => ["run", f] },
    php:        { cmd: "php",      args: (f) => [f] },
};

// ── Per-file Yjs snapshot store (in-memory, ephemeral) ───────────────────────
const fileSnapshots = new Map();  // fileId → encrypted snapshot string

// ── Active run processes ──────────────────────────────────────────────────────
const runProcesses = new Map();   // pid → ChildProcess

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 2e6,
    pingTimeout: 60000,
    pingInterval: 25000
});

app.use(express.static("public"));
app.use("/vendor/crypto-js", express.static(path.join(__dirname, "node_modules/crypto-js")));
app.use("/vendor/yjs", express.static(path.join(__dirname, "node_modules/yjs/dist")));
app.use("/vendor/lib0", (req, res, next) => {
    if (!path.extname(req.path)) {
        req.url = req.url + ".js";
    }
    next();
}, express.static(path.join(__dirname, "node_modules/lib0")));

// ── Dashboard SPA ────────────────────────────────────────────────────────────
app.use("/dashboard", express.static(path.join(__dirname, "public/dashboard")));
app.use("/dashboard", (_req, res) => {
    res.sendFile(path.join(__dirname, "public/dashboard/index.html"));
});

// ── IDE SPA ───────────────────────────────────────────────────────────────────
app.use("/ide", express.static(path.join(__dirname, "public/ide")));
app.get("/ide", (_req, res) => {
    res.sendFile(path.join(__dirname, "public/ide/index.html"));
});

const MAX_UPDATE_SIZE = 512 * 1024;
const RATE_LIMIT_MS = 16;
const MAX_PEERS = 16;

let hostId = null;
const approvedUsers = new Set();
const peerMeta = new Map();
const lastUpdateAt = new Map();

let encryptedSnapshot = null;
let roomSalt = null;
const pendingJoinRequests = new Map();

function roomInfoPayload() {
    return {
        exists: roomSalt !== null,
        salt: roomSalt
    };
}

function broadcastRoomInfo() {
    io.emit("room-info", roomInfoPayload());
}

function broadcastPresence() {
    const peers = [...approvedUsers].map((id) => ({
        id,
        name: peerMeta.get(id)?.name || "Peer",
        isHost: id === hostId,
        color: peerMeta.get(id)?.color || "#6366f1"
    }));

    io.to([...approvedUsers]).emit("presence", { peers, hostId });
}

function electNewHost() {
    const next = [...approvedUsers].find((id) => id !== hostId);
    if (next) {
        hostId = next;
        io.to(next).emit("host-promoted");
        broadcastPresence();
        console.log("New host:", next);
    } else {
        hostId = null;
        approvedUsers.clear();
        peerMeta.clear();
        encryptedSnapshot = null;
        roomSalt = null;
        console.log("Room empty — state cleared");
    }
}

io.on("connection", (socket) => {
    console.log("[connect]", socket.id, "from", socket.handshake.address);

    if (!hostId) {
        hostId = socket.id;
        approvedUsers.add(socket.id);
        socket.emit("host");
        console.log("[host]", socket.id);
    } else if (approvedUsers.size >= MAX_PEERS) {
        console.log("[reject] room full", socket.id);
        socket.emit("rejected", { reason: "Room is full" });
        return;
    } else {
        console.log("[guest]", socket.id, "room exists:", roomSalt !== null);
        socket.emit("guest", roomInfoPayload());
        io.to(hostId).emit("join-request", { id: socket.id, name: "Guest" });
        pendingJoinRequests.set(socket.id, Date.now());
    }

    socket.on("create-room", ({ salt }) => {
        console.log("[create-room]", socket.id, "salt:", !!salt);
        if (!hostId || approvedUsers.size <= 1) {
            hostId = socket.id;
            approvedUsers.add(socket.id);
        }
        if (socket.id !== hostId) {
            console.log("[create-room] denied — not host");
            socket.emit("rejected", { reason: "Only the host can create a room." });
            return;
        }
        if (!salt || typeof salt !== "string" || salt.length > 128) {
            console.log("[create-room] denied — bad salt");
            return;
        }

        roomSalt = salt;
        socket.emit("room-created", roomInfoPayload());
        broadcastRoomInfo();
        console.log("[room-created] salt stored");
    });

    socket.on("get-room-info", (ack) => {
        console.log("[get-room-info]", socket.id);
        if (typeof ack === "function") ack(roomInfoPayload());
    });

    socket.on("register-peer", ({ name, color }) => {
        if (!approvedUsers.has(socket.id)) return;

        peerMeta.set(socket.id, {
            name: String(name || "Peer").slice(0, 32),
            color: String(color || "#6366f1").slice(0, 7)
        });
        broadcastPresence();
    });

    socket.on("approve-user", (id) => {
        if (socket.id !== hostId || !pendingJoinRequests.has(id)) return;

        pendingJoinRequests.delete(id);
        approvedUsers.add(id);

        io.to(id).emit("approved", {
            snapshot: encryptedSnapshot,
            salt: roomSalt
        });

        broadcastPresence();
        console.log("Approved:", id);
    });

    socket.on("reject-user", (id) => {
        if (socket.id !== hostId) return;
        pendingJoinRequests.delete(id);
        io.to(id).emit("rejected", { reason: "Host denied access" });
    });

    socket.on("y-delta", (payload) => {
        if (!approvedUsers.has(socket.id)) return;
        if (!payload || typeof payload !== "string") return;
        if (payload.length > MAX_UPDATE_SIZE) return;

        const now = Date.now();
        const last = lastUpdateAt.get(socket.id) || 0;
        if (now - last < RATE_LIMIT_MS) return;
        lastUpdateAt.set(socket.id, now);

        socket.broadcast.emit("y-delta", payload);
    });

    socket.on("y-snapshot", (payload) => {
        if (!approvedUsers.has(socket.id)) return;
        if (!payload || typeof payload !== "string") return;
        if (payload.length > MAX_UPDATE_SIZE) return;

        encryptedSnapshot = payload;
    });

    socket.on("request-sync", () => {
        if (!approvedUsers.has(socket.id)) return;

        if (encryptedSnapshot) {
            socket.emit("sync-response", { snapshot: encryptedSnapshot });
        } else {
            socket.broadcast.emit("sync-needed", { requesterId: socket.id });
        }
    });

    socket.on("y-sync-offer", ({ targetId, payload }) => {
        if (!approvedUsers.has(socket.id)) return;
        if (!approvedUsers.has(targetId)) return;
        if (!payload || typeof payload !== "string") return;
        if (payload.length > MAX_UPDATE_SIZE) return;

        io.to(targetId).emit("sync-response", { snapshot: payload });
    });

    socket.on("awareness-update", (payload) => {
        if (!approvedUsers.has(socket.id)) return;
        if (!payload || typeof payload !== "string") return;
        if (payload.length > 8192) return;

        socket.broadcast.emit("awareness-update", {
            from: socket.id,
            payload
        });
    });

    // ── IDE: File Operations ──────────────────────────────────────────────────

    socket.on("file:list", ({ projectId } = {}) => {
        if (!approvedUsers.has(socket.id)) return;
        const projectDir = _safeProjectDir(projectId);
        try {
            const tree = _buildTree(projectDir, projectDir);
            socket.emit("file:listed", { tree });
            socket.emit("file:tree-update", { tree });
        } catch (e) {
            console.error("[file:list]", e.message);
        }
    });

    socket.on("file:read", ({ fileId }) => {
        if (!approvedUsers.has(socket.id)) return;
        if (!fileId) return;
        const filePath = _safeFilePath(fileId);
        if (!filePath) return;
        try {
            const content = fs.readFileSync(filePath, "utf8");
            const name    = path.basename(filePath);
            socket.emit("file:read-result", { fileId, name, path: filePath, content });
        } catch (e) {
            socket.emit("file:read-result", { fileId, error: e.message });
        }
    });

    socket.on("file:write", ({ fileId, content }) => {
        if (!approvedUsers.has(socket.id)) return;
        if (!fileId || content === undefined) return;
        if (content.length > 2 * 1024 * 1024) return; // 2 MB limit
        const filePath = _safeFilePath(fileId);
        if (!filePath) return;
        try {
            fs.writeFileSync(filePath, content, "utf8");
            socket.emit("file:write-result", { fileId, ok: true });
            // Refresh tree for all peers
            const tree = _buildTree(DEFAULT_PROJECT, DEFAULT_PROJECT);
            io.to([...approvedUsers]).emit("file:tree-update", { tree });
        } catch (e) {
            socket.emit("file:write-result", { fileId, ok: false, error: e.message });
        }
    });

    socket.on("file:create", ({ name, type, parentId, projectId } = {}) => {
        if (!approvedUsers.has(socket.id)) return;
        if (!name || /[\/\\:*?"<>|]/.test(name)) return;
        const projectDir = _safeProjectDir(projectId);
        const parentDir  = parentId ? _safeFilePath(parentId) : projectDir;
        if (!parentDir) return;
        const newPath = path.join(parentDir, name);
        if (!newPath.startsWith(IDE_WORKSPACE)) return;
        try {
            if (type === "directory") {
                fs.mkdirSync(newPath, { recursive: true });
            } else {
                fs.writeFileSync(newPath, "", { flag: "wx" });
            }
            const tree = _buildTree(projectDir, projectDir);
            io.to([...approvedUsers]).emit("file:tree-update", { tree });
        } catch (e) {
            console.error("[file:create]", e.message);
        }
    });

    socket.on("file:rename", ({ nodeId, name }) => {
        if (!approvedUsers.has(socket.id)) return;
        if (!name || /[\/\\:*?"<>|]/.test(name)) return;
        const oldPath = _safeFilePath(nodeId);
        if (!oldPath) return;
        const newPath = path.join(path.dirname(oldPath), name);
        if (!newPath.startsWith(IDE_WORKSPACE)) return;
        try {
            fs.renameSync(oldPath, newPath);
            const tree = _buildTree(DEFAULT_PROJECT, DEFAULT_PROJECT);
            io.to([...approvedUsers]).emit("file:tree-update", { tree });
        } catch (e) {
            console.error("[file:rename]", e.message);
        }
    });

    socket.on("file:delete", ({ nodeId }) => {
        if (!approvedUsers.has(socket.id)) return;
        const filePath = _safeFilePath(nodeId);
        if (!filePath) return;
        try {
            fs.rmSync(filePath, { recursive: true, force: true });
            const tree = _buildTree(DEFAULT_PROJECT, DEFAULT_PROJECT);
            io.to([...approvedUsers]).emit("file:tree-update", { tree });
        } catch (e) {
            console.error("[file:delete]", e.message);
        }
    });

    socket.on("file:upload", ({ name, content, parentId, projectId } = {}) => {
        if (!approvedUsers.has(socket.id)) return;
        if (!name || /[\/\\:*?"<>|]/.test(name)) return;
        const projectDir = _safeProjectDir(projectId);
        const parentDir  = parentId ? _safeFilePath(parentId) : projectDir;
        if (!parentDir) return;
        const newPath = path.join(parentDir, name);
        if (!newPath.startsWith(IDE_WORKSPACE)) return;
        try {
            if (typeof content === "string") {
                fs.writeFileSync(newPath, content, "utf8");
            } else if (content) {
                fs.writeFileSync(newPath, Buffer.from(content));
            }
            const tree = _buildTree(projectDir, projectDir);
            io.to([...approvedUsers]).emit("file:tree-update", { tree });
            console.log(`[file:upload] Uploaded ${name}`);
        } catch (e) {
            console.error("[file:upload]", e.message);
        }
    });

    // ── IDE: Per-file CRDT ────────────────────────────────────────────────────

    socket.on("file:y-delta", ({ fileId, payload }) => {
        if (!approvedUsers.has(socket.id)) return;
        if (!fileId || !payload || typeof payload !== "string") return;
        if (payload.length > MAX_UPDATE_SIZE) return;
        // Store as snapshot (last write wins for late joiners)
        fileSnapshots.set(fileId, payload);
        socket.broadcast.emit("file:y-delta", { fileId, payload });
    });

    socket.on("file:y-snapshot", ({ fileId, payload }) => {
        if (!approvedUsers.has(socket.id)) return;
        if (!fileId || !payload || typeof payload !== "string") return;
        if (payload.length > MAX_UPDATE_SIZE) return;
        fileSnapshots.set(fileId, payload);
    });

    socket.on("file:y-request", ({ fileId }) => {
        if (!approvedUsers.has(socket.id)) return;
        const snapshot = fileSnapshots.get(fileId);
        if (snapshot) {
            socket.emit("file:y-state", { fileId, payload: snapshot });
        }
    });

    // ── IDE: Code Execution & Compilation ─────────────────────────────────────

    socket.on("run:execute", ({ fileId, lang, content }) => {
        if (!approvedUsers.has(socket.id)) return;
        if (!fileId) return;

        const filePath = _safeFilePath(fileId);
        if (!filePath) {
            socket.emit("run:error", { message: "Invalid file path." });
            return;
        }

        // Auto-save content if supplied
        if (typeof content === "string") {
            try { fs.writeFileSync(filePath, content, "utf8"); } catch {}
        }

        if (!fs.existsSync(filePath)) {
            socket.emit("run:error", { message: "File not found. Save the file first." });
            return;
        }

        const ext  = path.extname(filePath).toLowerCase();
        const dir  = path.dirname(filePath);
        const base = path.basename(filePath, ext);
        const detected = lang || _detectLangFromExt(ext);

        let command = "";
        switch (detected) {
            case "c":
                command = `gcc "${filePath}" -o "${path.join(dir, base)}.exe" && "${path.join(dir, base)}.exe"`;
                break;
            case "cpp":
                command = `g++ "${filePath}" -o "${path.join(dir, base)}.exe" && "${path.join(dir, base)}.exe"`;
                break;
            case "java":
                command = `javac "${filePath}" && java -cp "${dir}" ${base}`;
                break;
            case "python":
                command = `python "${filePath}"`;
                break;
            case "javascript":
                command = `node "${filePath}"`;
                break;
            case "typescript":
                command = `npx ts-node "${filePath}"`;
                break;
            case "go":
                command = `go run "${filePath}"`;
                break;
            case "rust":
                command = `rustc "${filePath}" -o "${path.join(dir, base)}.exe" && "${path.join(dir, base)}.exe"`;
                break;
            default:
                command = `node "${filePath}"`;
        }

        const startTime = Date.now();
        let proc;
        try {
            proc = spawn(command, [], {
                cwd:   dir,
                shell: true,
                timeout: 30000,
            });
        } catch (e) {
            socket.emit("run:error", { message: `Failed to start execution: ${e.message}` });
            return;
        }

        runProcesses.set(proc.pid, proc);
        socket.emit("run:started", { pid: proc.pid });
        console.log(`[run] PID=${proc.pid} lang=${detected} file=${path.basename(filePath)}`);

        proc.stdout.on("data", (d) => socket.emit("run:output", { data: d.toString() }));
        proc.stderr.on("data", (d) => socket.emit("run:output", { data: d.toString() }));

        proc.on("close", (code) => {
            runProcesses.delete(proc.pid);
            socket.emit("run:exit", { code, elapsed: Date.now() - startTime });
            console.log(`[run] PID=${proc.pid} exited with code ${code}`);
        });

        proc.on("error", (err) => {
            runProcesses.delete(proc?.pid);
            socket.emit("run:error", { message: err.message });
        });
    });

    socket.on("run:compile", ({ fileId, lang, content }) => {
        if (!approvedUsers.has(socket.id)) return;
        if (!fileId) return;

        const filePath = _safeFilePath(fileId);
        if (!filePath) return;

        if (typeof content === "string") {
            try { fs.writeFileSync(filePath, content, "utf8"); } catch {}
        }

        const ext  = path.extname(filePath).toLowerCase();
        const dir  = path.dirname(filePath);
        const base = path.basename(filePath, ext);
        const detected = lang || _detectLangFromExt(ext);

        let command = "";
        switch (detected) {
            case "c":    command = `gcc -c "${filePath}" -o "${path.join(dir, base)}.o"`; break;
            case "cpp":  command = `g++ -c "${filePath}" -o "${path.join(dir, base)}.o"`; break;
            case "java": command = `javac "${filePath}"`; break;
            case "rust": command = `rustc --emit=obj "${filePath}"`; break;
            default:
                socket.emit("run:output", { data: `[Compile] ${detected} does not require a separate compilation step.\n` });
                socket.emit("run:exit", { code: 0, elapsed: 0 });
                return;
        }

        const startTime = Date.now();
        let proc;
        try {
            proc = spawn(command, [], { cwd: dir, shell: true, timeout: 30000 });
        } catch (e) {
            socket.emit("run:error", { message: `Compile failed: ${e.message}` });
            return;
        }

        socket.emit("run:started", { pid: proc.pid });
        console.log(`[compile] lang=${detected} file=${path.basename(filePath)}`);

        proc.stdout.on("data", (d) => socket.emit("run:output", { data: d.toString() }));
        proc.stderr.on("data", (d) => socket.emit("run:output", { data: d.toString() }));

        proc.on("close", (code) => {
            if (code === 0) socket.emit("run:output", { data: `\x1b[32m✔ Compilation successful!\x1b[0m\n` });
            socket.emit("run:exit", { code, elapsed: Date.now() - startTime });
        });
    });

    socket.on("run:kill", ({ pid }) => {
        if (!approvedUsers.has(socket.id)) return;
        const proc = runProcesses.get(pid);
        if (proc) {
            proc.kill("SIGTERM");
            setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, 2000);
        }
    });

    // ── IDE: Terminal PTY (simple streaming bridge) ───────────────────────────

    socket.on("terminal:spawn", ({ termId, cwd } = {}) => {
        if (!approvedUsers.has(socket.id)) return;
        const safeDir = _safeProjectDir(cwd) || DEFAULT_PROJECT;
        const shell   = process.platform === "win32" ? "powershell.exe" : "bash";
        let proc;
        try {
            proc = spawn(shell, [], { cwd: safeDir, shell: false, windowsHide: true });
        } catch (e) {
            socket.emit("run:output", { termId, data: `\x1b[31mFailed to start shell: ${e.message}\x1b[0m\r\n` });
            return;
        }
        runProcesses.set(`t-${socket.id}-${termId}`, proc);
        proc.stdout.on("data", (d) => socket.emit("run:output", { termId, data: d.toString() }));
        proc.stderr.on("data", (d) => socket.emit("run:output", { termId, data: d.toString() }));
        proc.on("close", (code) => {
            runProcesses.delete(`t-${socket.id}-${termId}`);
            socket.emit("run:output", { termId, data: `\r\n\x1b[90m[Shell exited ${code}]\x1b[0m\r\n` });
        });
    });

    socket.on("terminal:input", ({ termId, data }) => {
        if (!approvedUsers.has(socket.id)) return;
        const proc = runProcesses.get(`t-${socket.id}-${termId}`);
        proc?.stdin?.write(data);
    });

    socket.on("terminal:kill", ({ termId }) => {
        const proc = runProcesses.get(`t-${socket.id}-${termId}`);
        if (proc) { proc.kill(); runProcesses.delete(`t-${socket.id}-${termId}`); }
    });

    // ── Disconnect (existing + cleanup run processes) ─────────────────────────

    socket.on("disconnect", () => {
        pendingJoinRequests.delete(socket.id);
        approvedUsers.delete(socket.id);
        peerMeta.delete(socket.id);
        lastUpdateAt.delete(socket.id);

        // Kill any running processes owned by this socket
        for (const [key, proc] of runProcesses.entries()) {
            if (String(key).includes(socket.id)) {
                try { proc.kill(); } catch {}
                runProcesses.delete(key);
            }
        }

        if (socket.id === hostId) {
            electNewHost();
        } else {
            broadcastPresence();
        }

        io.emit("peer-left", { id: socket.id });
        console.log("Disconnected:", socket.id);
    });
});

const PORT = process.env.PORT || 3000;

// ── IDE Helper Functions ──────────────────────────────────────────────────────

function _detectLangFromExt(ext) {
    const m = {
        ".c": "c", ".cpp": "cpp", ".h": "cpp", ".hpp": "cpp",
        ".py": "python", ".js": "javascript", ".ts": "typescript",
        ".java": "java", ".go": "go", ".rs": "rust", ".sh": "shell",
        ".rb": "ruby", ".php": "php"
    };
    return m[ext?.toLowerCase()] || "javascript";
}

/**
 * Resolve a projectId to a safe directory inside IDE_WORKSPACE.
 * Prevents path traversal attacks.
 */
function _safeProjectDir(projectId) {
    const safeId = (projectId || "default").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
    const dir    = path.join(IDE_WORKSPACE, safeId);
    if (!dir.startsWith(IDE_WORKSPACE)) return DEFAULT_PROJECT;
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

/**
 * Resolve a fileId (which is a relative path from workspace root) to an absolute path.
 * Returns null if the resolved path escapes the workspace.
 */
function _safeFilePath(fileId) {
    if (!fileId) return null;
    // fileId format: "default/path/to/file.py"  or just an absolute path stored earlier
    const resolved = fileId.startsWith(IDE_WORKSPACE)
        ? fileId
        : path.join(IDE_WORKSPACE, fileId);
    if (!resolved.startsWith(IDE_WORKSPACE)) return null;
    return resolved;
}

/**
 * Recursively build a file-tree JSON from a directory.
 * Each node: { id, name, type, path, children? }
 * id = relative path from IDE_WORKSPACE root (used as fileId).
 */
function _buildTree(dir, rootDir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return []; }

    return entries
        .filter(e => !e.name.startsWith("."))   // hide dotfiles
        .sort((a, b) => {
            // Directories first, then files
            if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
            return a.name.localeCompare(b.name);
        })
        .map(e => {
            const absPath = path.join(dir, e.name);
            const nodeId  = absPath; // absolute path used as fileId
            if (e.isDirectory()) {
                return {
                    id:       nodeId,
                    name:     e.name,
                    type:     "directory",
                    path:     absPath,
                    children: _buildTree(absPath, rootDir),
                };
            }
            return { id: nodeId, name: e.name, type: "file", path: absPath };
        });
}

server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
        console.error(`\nPort ${PORT} is already in use.`);
        console.error("Another notepad server is already running — use that one, or stop it first:\n");
        console.error("  npm run stop");
        console.error("  npm run dev\n");
        console.error("Or find the process: netstat -ano | findstr :3000\n");
        process.exit(1);
    }
    throw err;
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`\n◈  Nullator Server`);
    console.log(`   Notepad: http://127.0.0.1:${PORT}/`);
    console.log(`   IDE:     http://127.0.0.1:${PORT}/ide/`);
    console.log(`   Dashboard: http://127.0.0.1:${PORT}/dashboard/\n`);
});
