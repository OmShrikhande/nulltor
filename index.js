const express = require("express");
const http = require("http");
const fs = require('fs');
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 2e6,
    pingTimeout: 60000,
    pingInterval: 25000
});

// ── Static Files ─────────────────────────────────────────────────────────
app.use(express.static("public"));
app.use("/vendor/crypto-js", express.static(path.join(__dirname, "node_modules/crypto-js")));
app.use("/vendor/yjs", express.static(path.join(__dirname, "node_modules/yjs/dist")));

const MAX_UPDATE_SIZE = 512 * 1024;
const RATE_LIMIT_MS = 16;
const MAX_PEERS = 32;

// Maps fileId -> Set of socket IDs
const roomMembers = new Map();
// Maps socket.id -> { fileId, name, color }
const peerInfo = new Map();
// Maps socket.id -> timestamp
const lastUpdateAt = new Map();

const SNAPSHOTS_DIR = path.join(__dirname, 'snapshots');
if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

function loadSnapshot(fileId) {
    // Sanitize fileId to prevent directory traversal
    const safeFileId = fileId.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!safeFileId) return null;
    const p = path.join(SNAPSHOTS_DIR, safeFileId + ".bin");
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
    return null;
}

function saveSnapshot(fileId, data) {
    const safeFileId = fileId.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!safeFileId) return;
    const p = path.join(SNAPSHOTS_DIR, safeFileId + ".bin");
    fs.writeFileSync(p, data, "utf8");
}

function broadcastPresence(fileId) {
    const members = roomMembers.get(fileId);
    if (!members) return;

    const uniquePeers = new Map();
    [...members].forEach((id) => {
        const info = peerInfo.get(id) || {};
        const name = info.name || "Peer";
        if (!uniquePeers.has(name)) {
            uniquePeers.set(name, {
                id,
                name: name,
                isHost: false,
                color: info.color || "#6366f1"
            });
        }
    });

    io.to(fileId).emit("presence", { peers: Array.from(uniquePeers.values()), hostId: null });
}

io.on("connection", (socket) => {
    console.log("[connect]", socket.id);

    socket.on("join-file", ({ fileId }) => {
        if (!fileId || typeof fileId !== 'string') return;
        
        socket.join(fileId);
        peerInfo.set(socket.id, { fileId, name: "Peer", color: "#6366f1" });
        
        let members = roomMembers.get(fileId);
        if (!members) {
            members = new Set();
            roomMembers.set(fileId, members);
        }
        members.add(socket.id);

        console.log(`[join-file] ${socket.id} joined ${fileId}`);
        
        socket.emit("approved", {
            snapshot: loadSnapshot(fileId),
            salt: null // Salt will be fetched from API now
        });
        
        broadcastPresence(fileId);
    });

    socket.on("register-peer", ({ name, color }) => {
        const info = peerInfo.get(socket.id);
        if (!info) return;

        info.name = String(name || "Peer").slice(0, 32);
        info.color = String(color || "#6366f1").slice(0, 7);
        peerInfo.set(socket.id, info);
        
        broadcastPresence(info.fileId);
    });

    socket.on("y-delta", (payload) => {
        const info = peerInfo.get(socket.id);
        if (!info) return;
        
        if (!payload || typeof payload !== "string") return;
        if (payload.length > MAX_UPDATE_SIZE) return;

        const now = Date.now();
        const last = lastUpdateAt.get(socket.id) || 0;
        if (now - last < RATE_LIMIT_MS) return;
        lastUpdateAt.set(socket.id, now);

        socket.to(info.fileId).emit("y-delta", payload);
    });

    socket.on("y-snapshot", (payload) => {
        const info = peerInfo.get(socket.id);
        if (!info) return;
        
        if (!payload || typeof payload !== "string") return;
        if (payload.length > MAX_UPDATE_SIZE) return;

        saveSnapshot(info.fileId, payload);
    });

    socket.on("request-sync", () => {
        const info = peerInfo.get(socket.id);
        if (!info) return;
        
        const snap = loadSnapshot(info.fileId);
        if (snap) {
            socket.emit("sync-response", { snapshot: snap });
        } else {
            socket.to(info.fileId).emit("sync-needed", { requesterId: socket.id });
        }
    });

    socket.on("y-sync-offer", ({ targetId, payload }) => {
        const info = peerInfo.get(socket.id);
        if (!info) return;
        if (!payload || typeof payload !== "string") return;
        if (payload.length > MAX_UPDATE_SIZE) return;

        io.to(targetId).emit("sync-response", { snapshot: payload });
    });

    socket.on("awareness-update", (payload) => {
        const info = peerInfo.get(socket.id);
        if (!info) return;
        if (!payload || typeof payload !== "string") return;
        if (payload.length > 8192) return;

        socket.to(info.fileId).emit("awareness-update", {
            from: socket.id,
            payload
        });
    });

    socket.on("disconnect", () => {
        const info = peerInfo.get(socket.id);
        if (info) {
            const members = roomMembers.get(info.fileId);
            if (members) {
                members.delete(socket.id);
                if (members.size === 0) {
                    roomMembers.delete(info.fileId);
                } else {
                    broadcastPresence(info.fileId);
                }
            }
            io.to(info.fileId).emit("peer-left", { id: socket.id });
        }
        
        peerInfo.delete(socket.id);
        lastUpdateAt.delete(socket.id);
        
        console.log("Disconnected:", socket.id);
    });
});

const PORT = process.env.PORT || 3000;

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
    console.log(`Secure LAN Notepad → http://0.0.0.0:${PORT}`);
    console.log(`On this PC: http://127.0.0.1:${PORT}`);
    console.log(`On LAN:     http://192.168.31.101:${PORT}`);
});
