require("dotenv").config();
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const { Pool } = require("pg");

const sqlite3 = require("sqlite3").verbose();
const dbPath = path.join(__dirname, "backend", "nulltor.db");
const sqliteDb = new sqlite3.Database(dbPath);

sqliteDb.serialize(() => {
    sqliteDb.run(`
        CREATE TABLE IF NOT EXISTS file_snapshots (
            file_id     TEXT        NOT NULL,
            branch_id   TEXT        NOT NULL DEFAULT 'main',
            data        TEXT        NOT NULL,
            updated_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (file_id, branch_id)
        );
    `, (err) => {
        if (err) console.error("[sqlite] file_snapshots init error:", err.message);
        else console.log("[sqlite] file_snapshots table ready");
    });
});

let usePg = false;
let pgPool = null;

if (process.env.DATABASE_URL_PG) {
    try {
        const { Pool } = require("pg");
        pgPool = new Pool({ connectionString: process.env.DATABASE_URL_PG, connectionTimeoutMillis: 2000 });
        pgPool.query(`
            CREATE TABLE IF NOT EXISTS file_snapshots (
                file_id     TEXT        NOT NULL,
                branch_id   TEXT        NOT NULL DEFAULT 'main',
                data        TEXT        NOT NULL,
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (file_id, branch_id)
            );
        `).then(() => {
            usePg = true;
            console.log("[pg] file_snapshots table ready");
        }).catch(err => {
            console.log("[pg] PostgreSQL connection unavailable, using SQLite fallback");
            usePg = false;
        });
    } catch (err) {
        usePg = false;
    }
}

async function loadSnapshot(fileId, branchId = 'main') {
    const safeFileId = fileId.replace(/[^a-zA-Z0-9_:-]/g, "");
    const safeBranchId = branchId.replace(/[^a-zA-Z0-9_-]/g, "") || 'main';
    if (!safeFileId) return null;

    if (usePg && pgPool) {
        try {
            const res = await pgPool.query(
                "SELECT data FROM file_snapshots WHERE file_id = $1 AND branch_id = $2",
                [safeFileId, safeBranchId]
            );
            return res.rows.length > 0 ? res.rows[0].data : null;
        } catch (err) {
            console.error("[pg] loadSnapshot error:", err.message);
        }
    }

    return new Promise((resolve) => {
        sqliteDb.get(
            "SELECT data FROM file_snapshots WHERE file_id = ? AND branch_id = ?",
            [safeFileId, safeBranchId],
            (err, row) => {
                if (err) {
                    console.error("[sqlite] loadSnapshot error:", err.message);
                    resolve(null);
                } else {
                    resolve(row ? row.data : null);
                }
            }
        );
    });
}

async function saveSnapshot(fileId, branchId = 'main', data) {
    const safeFileId = fileId.replace(/[^a-zA-Z0-9_:-]/g, "");
    const safeBranchId = branchId.replace(/[^a-zA-Z0-9_-]/g, "") || 'main';
    if (!safeFileId) return;

    if (usePg && pgPool) {
        try {
            await pgPool.query(
                `INSERT INTO file_snapshots (file_id, branch_id, data, updated_at)
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (file_id, branch_id) DO UPDATE
                 SET data = EXCLUDED.data, updated_at = NOW()`,
                [safeFileId, safeBranchId, data]
            );
            return;
        } catch (err) {
            console.error("[pg] saveSnapshot error:", err.message);
        }
    }

    sqliteDb.run(
        `INSERT INTO file_snapshots (file_id, branch_id, data, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(file_id, branch_id) DO UPDATE
         SET data = excluded.data, updated_at = CURRENT_TIMESTAMP`,
        [safeFileId, safeBranchId, data],
        (err) => {
            if (err) console.error("[sqlite] saveSnapshot error:", err.message);
        }
    );
}

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

    socket.on("join-file", async ({ fileId, branchId }) => {
        if (!fileId || typeof fileId !== 'string') return;
        
        // Room key: fileId::branchId — each branch has independent Yjs state
        const safeBranchId = (branchId && typeof branchId === 'string')
            ? branchId.replace(/[^a-zA-Z0-9_-]/g, '') || 'main'
            : 'main';
        const roomKey = `${fileId}::${safeBranchId}`;
        
        socket.join(roomKey);
        peerInfo.set(socket.id, { fileId: roomKey, rawFileId: fileId, branchId: safeBranchId, name: "Peer", color: "#6366f1" });
        
        let members = roomMembers.get(roomKey);
        if (!members) {
            members = new Set();
            roomMembers.set(roomKey, members);
        }
        members.add(socket.id);

        console.log(`[join-file] ${socket.id} joined ${roomKey}`);
        
        const snapshot = await loadSnapshot(fileId, safeBranchId);
        socket.emit("approved", {
            snapshot,
            salt: null // Salt fetched from API by client
        });
        
        broadcastPresence(roomKey);
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

    socket.on("y-snapshot", async (payload) => {
        const info = peerInfo.get(socket.id);
        if (!info) return;
        
        if (!payload || typeof payload !== "string") return;
        if (payload.length > MAX_UPDATE_SIZE) return;

        await saveSnapshot(info.rawFileId || info.fileId, info.branchId || 'main', payload);
    });

    socket.on("request-sync", async () => {
        const info = peerInfo.get(socket.id);
        if (!info) return;
        
        const snap = await loadSnapshot(info.fileId);
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
