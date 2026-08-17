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
            let res = await pgPool.query(
                "SELECT data FROM file_snapshots WHERE file_id = $1 AND branch_id = $2",
                [safeFileId, safeBranchId]
            );
            if (res.rows.length > 0) return res.rows[0].data;
            
            // Fallback: lookup corresponding file on main branch by name in directories table
            if (safeBranchId !== 'main') {
                const dirRes = await pgPool.query(
                    `SELECT fs.data 
                     FROM directories d_sub
                     JOIN directories d_main ON d_sub.name = d_main.name AND d_sub.project_id = d_main.project_id
                     JOIN branches b_main ON d_main.branch_id = b_main.id AND b_main.type = 'main'
                     JOIN file_snapshots fs ON (fs.file_id = d_main.id::text OR fs.file_id = d_main.id) AND (fs.branch_id = b_main.id::text OR fs.branch_id = 'main')
                     WHERE (d_sub.id = $1::uuid OR d_sub.id::text = $1)
                     LIMIT 1`,
                    [safeFileId]
                ).catch(() => ({ rows: [] }));

                if (dirRes.rows && dirRes.rows.length > 0) {
                    await saveSnapshot(safeFileId, safeBranchId, dirRes.rows[0].data);
                    return dirRes.rows[0].data;
                }
            }
            return null;
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
                } else if (row && row.data) {
                    resolve(row.data);
                } else if (safeBranchId !== 'main') {
                    // Smart SQLite fallback: lookup corresponding file on main branch by name
                    sqliteDb.get(
                        `SELECT fs.data 
                         FROM directories d_sub
                         JOIN directories d_main ON d_sub.name = d_main.name AND d_sub.project_id = d_main.project_id
                         JOIN branches b_main ON d_main.branch_id = b_main.id AND b_main.type = 'main'
                         JOIN file_snapshots fs ON fs.file_id = d_main.id AND (fs.branch_id = b_main.id OR fs.branch_id = 'main')
                         WHERE d_sub.id = ?
                         ORDER BY fs.updated_at DESC LIMIT 1`,
                        [safeFileId],
                        (err2, row2) => {
                            if (row2 && row2.data) {
                                saveSnapshot(safeFileId, safeBranchId, row2.data);
                                resolve(row2.data);
                            } else {
                                sqliteDb.get(
                                    "SELECT data FROM file_snapshots WHERE file_id = ? AND branch_id = 'main'",
                                    [safeFileId],
                                    (err3, row3) => resolve(row3 ? row3.data : null)
                                );
                            }
                        }
                    );
                } else {
                    resolve(null);
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

const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 2e6,
    pingTimeout: 60000,
    pingInterval: 25000,
    cors: { origin: "*" }
});

// ── Reverse Proxy to FastAPI Backend ──────────────────────────────────────
const BACKEND_PORT = process.env.BACKEND_PORT || 8001;
const BACKEND_URL = process.env.BACKEND_URL || `http://127.0.0.1:${BACKEND_PORT}`;

const apiProxy = createProxyMiddleware({
    target: BACKEND_URL,
    changeOrigin: true,
    ws: false,
    pathRewrite: (pathname) => `/api${pathname}`,
    logLevel: "warn",
});

const docsProxy = createProxyMiddleware({
    target: BACKEND_URL,
    changeOrigin: true,
    ws: false,
    pathRewrite: (pathname) => `/docs${pathname}`,
    logLevel: "warn",
});

const wsProxy = createProxyMiddleware({
    target: BACKEND_URL,
    changeOrigin: true,
    ws: true,
    logLevel: "warn",
});

// Route API, docs, and terminal WebSockets to FastAPI
app.use("/api", apiProxy);
app.use("/docs", docsProxy);
app.use("/openapi.json", docsProxy);
app.use("/redoc", docsProxy);

// Handle WebSocket upgrade for terminal xterm execution
server.on("upgrade", (req, socket, head) => {
    if (req.url.startsWith("/ws")) {
        wsProxy.upgrade(req, socket, head);
    }
});

// ── Static Files & SPA Fallback ───────────────────────────────────────────
const reactBuildPath = path.join(__dirname, "public_react");
app.use(express.static(reactBuildPath, {
    setHeaders: (res) => {
        res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    }
}));
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
        
        // Notify others so they can initiate WebRTC
        socket.to(info.fileId).emit("peer-joined", {
            id: socket.id,
            name: info.name
        });
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

    socket.on("cursor-update", ({ line, column }) => {
        const info = peerInfo.get(socket.id);
        if (!info) return;
        if (typeof line !== "number" || typeof column !== "number") return;

        socket.to(info.fileId).emit("cursor-update", {
            socketId: socket.id,
            name: info.name || "Peer",
            color: info.color || "#6366f1",
            line: Math.max(1, Math.floor(line)),
            column: Math.max(1, Math.floor(column)),
        });
    });

    // ── WebRTC Signaling ──────────────────────────────────────────────────────
    socket.on("webrtc-join-call", () => {
        const info = peerInfo.get(socket.id);
        if (!info) return;
        socket.to(info.fileId).emit("webrtc-join-call", {
            senderId: socket.id
        });
    });

    socket.on("webrtc-signal", ({ targetId, signal }) => {
        const info = peerInfo.get(socket.id);
        if (!info) return;
        if (!targetId || !signal) return;
        
        // Forward the signal to the target peer securely
        io.to(targetId).emit("webrtc-signal", {
            senderId: socket.id,
            signal
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

// ── SPA Fallback for React UI Routing (Express 5 compatible) ──────────────
app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io") || req.path.startsWith("/ws")) {
        return next();
    }
    const indexPath = path.join(reactBuildPath, "index.html");
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.sendFile(indexPath, (err) => {
        if (err) {
            res.sendFile(path.join(__dirname, "public", "index.html"), (err2) => {
                if (err2) next();
            });
        }
    });
});

const PORT = process.env.PORT || 3330;

server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
        console.error(`\nPort ${PORT} is already in use.`);
        console.error("Another server is already running on this port — stop it first:\n");
        console.error("  npm run stop\n");
        process.exit(1);
    }
    throw err;
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`\n======================================================`);
    console.log(`  NULLTOR SECURE COLLABORATIVE PLATFORM READY`);
    console.log(`  Unified Single-Port Access: http://localhost:${PORT}`);
    console.log(`  On your Local Network:     http://0.0.0.0:${PORT}`);
    console.log(`======================================================\n`);
});
