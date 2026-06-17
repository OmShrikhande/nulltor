const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

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
        if (socket.id !== hostId) {
            console.log("[create-room] denied — not host");
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

    socket.on("disconnect", () => {
        pendingJoinRequests.delete(socket.id);
        approvedUsers.delete(socket.id);
        peerMeta.delete(socket.id);
        lastUpdateAt.delete(socket.id);

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
