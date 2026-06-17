/* global io, SecureVault, randomPeerColor */

(function () {
    "use strict";

    const socket = io({ transports: ["websocket", "polling"] });
    const vault = new SecureVault();

    let isHost = false;
    let isGuest = false;
    let isApproved = false;
    let socketReady = false;
    let roomSalt = null;
    let remoteLock = false;
    let displayMode = "normal";
    let snapshotTimer = null;

    const peerName = localStorage.getItem("peer-name") || ("User-" + Math.floor(Math.random() * 900 + 100));
    const peerColor = localStorage.getItem("peer-color") || randomPeerColor();

    const $ = (id) => document.getElementById(id);
    const editor = $("editor");
    const createBtn = $("create-btn");
    const joinBtn = $("join-btn");
    const joinPass = $("join-pass");
    const createPass = $("create-pass");

    function log(msg) {
        console.log("[notepad]", msg);
    }

    function showBootError(msg) {
        const el = $("boot-error");
        if (el) {
            el.hidden = false;
            el.textContent = msg;
        }
        console.error("[notepad]", msg);
    }

    function setStatus(text, type) {
        const box = $("status");
        box.textContent = text;
        box.dataset.type = type || "ok";
    }

    function showLockScreen(show) {
        $("lock-screen").hidden = !show;
        document.body.classList.toggle("locked", show);
    }

    function showCreateTab() {
        $("tab-create").classList.add("active");
        $("tab-join").classList.remove("active");
        $("create-panel").hidden = false;
        $("join-panel").hidden = true;
    }

    function showJoinTab() {
        $("tab-join").classList.add("active");
        $("tab-create").classList.remove("active");
        $("create-panel").hidden = true;
        $("join-panel").hidden = false;
    }

    function setRoomReady(ready, salt) {
        if (salt) roomSalt = salt;
        const wait = $("room-wait");
        if (wait) wait.hidden = ready;
    }

    function updateButtons() {
        createBtn.disabled = false;
        joinBtn.disabled = false;
        joinPass.disabled = false;
        createPass.disabled = false;

        if (!socketReady) {
            createBtn.title = "Connecting to server…";
            joinBtn.title = "Connecting to server…";
        } else {
            createBtn.title = isHost ? "Create a new room" : "Only the first PC is host";
            joinBtn.title = "Join with the host's key";
        }
    }

    function getPlainText() {
        return editor.value;
    }

    function updateCharCount() {
        const len = getPlainText().length;
        $("char-count").textContent = len + " chars · " + (len ? "encrypted on wire" : "ready");
    }

    function applyDisplayMode() {
        if (displayMode === "normal") {
            editor.readOnly = !isHost && !isApproved;
            return;
        }
        if (displayMode === "cipher") {
            try {
                editor.value = vault.cipherPreview(getPlainText());
                editor.readOnly = true;
            } catch (e) {
                editor.value = "[unlock first]";
            }
            return;
        }
        if (displayMode === "mask") {
            editor.value = vault.maskText(getPlainText());
            editor.readOnly = false;
        }
    }

    function openEditor(bannerText) {
        showLockScreen(false);
        $("encrypt-badge").hidden = false;
        if (bannerText) {
            $("app-banner").hidden = false;
            $("app-banner").textContent = bannerText;
        }
        editor.readOnly = false;
        editor.focus();
        updateCharCount();
    }

    let editorBound = false;

    function bindEditor() {
        if (editorBound) return;
        editorBound = true;
        editor.addEventListener("input", () => {
            if (remoteLock || !vault.isUnlocked()) return;
            if (!isHost && !isApproved) return;
            if (displayMode !== "normal") return;

            clearTimeout(snapshotTimer);
            snapshotTimer = setTimeout(sendUpdate, 300);
            updateCharCount();
        });
    }

    function sendUpdate() {
        if (!vault.isUnlocked()) return;
        try {
            const encrypted = vault.encryptText(editor.value);
            socket.emit("y-delta", encrypted);
            socket.emit("y-snapshot", encrypted);
            log("sent update");
        } catch (e) {
            showBootError("Send failed: " + e.message);
        }
    }

    function applyRemoteEncrypted(payload) {
        if (!payload || !vault.isUnlocked()) return;
        try {
            const text = vault.decryptText(payload);
            const pos = editor.selectionStart;
            remoteLock = true;
            editor.value = text;
            remoteLock = false;
            try { editor.setSelectionRange(pos, pos); } catch (_) { /* ignore */ }
            updateCharCount();
        } catch (_) {
            /* wrong key or bad packet */
        }
    }

    function fetchRoomInfo(cb) {
        if (!socketReady) {
            cb({ exists: false, salt: null });
            return;
        }
        socket.emit("get-room-info", (info) => {
            if (info && info.exists && info.salt) setRoomReady(true, info.salt);
            cb(info || { exists: false, salt: null });
        });
    }

    function waitForSocket(ms) {
        return new Promise((resolve) => {
            if (socket.connected) { resolve(true); return; }
            const timer = setTimeout(() => resolve(false), ms);
            socket.once("connect", () => { clearTimeout(timer); resolve(true); });
        });
    }

    function waitForRole(ms) {
        return new Promise((resolve) => {
            if (isHost || isGuest) { resolve(true); return; }
            const timer = setTimeout(() => resolve(false), ms);
            const done = () => { clearTimeout(timer); resolve(true); };
            socket.once("host", done);
            socket.once("guest", done);
        });
    }

    /* ── Tabs ── */
    $("tab-create").addEventListener("click", showCreateTab);
    $("tab-join").addEventListener("click", () => { showJoinTab(); fetchRoomInfo(() => {}); });

    /* ── Create room ── */
    createBtn.addEventListener("click", async () => {
        const pass = createPass.value.trim();
        const errEl = $("create-error");
        errEl.textContent = "";
        createBtn.textContent = "Creating…";

        try {
            if (!pass) throw new Error("Enter a room key (e.g. 123456789)");

            if (!(await waitForSocket(8000))) throw new Error("Cannot reach server — run: npm run dev");
            await waitForRole(8000);

            if (!isHost) throw new Error("This PC is not the host. On the main PC open the page first, or use Join Room here.");

            const salt = SecureVault.createSaltBase64();

            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error("Server timeout — refresh and try again")), 8000);
                socket.once("room-created", (info) => {
                    clearTimeout(timer);
                    roomSalt = (info && info.salt) || salt;
                    setRoomReady(true, roomSalt);
                    resolve();
                });
                socket.emit("create-room", { salt });
                log("create-room sent");
            });

            vault.unlock(pass, roomSalt);
            openEditor("Room key: " + pass + " — share this with the other PC");
            setStatus("Room created · start typing", "ok");
            socket.emit("register-peer", { name: peerName, color: peerColor });
            bindEditor();
        } catch (e) {
            errEl.textContent = e.message;
            createBtn.textContent = "Create Room";
        }
    });

    /* ── Join room ── */
    joinBtn.addEventListener("click", async () => {
        const pass = joinPass.value.trim();
        const errEl = $("join-error");
        errEl.textContent = "";
        joinBtn.textContent = "Joining…";

        try {
            if (!pass) throw new Error("Enter the room key from the host");

            if (!(await waitForSocket(8000))) throw new Error("Cannot reach server — run: npm run dev");
            await waitForRole(8000);

            const info = await new Promise((resolve) => fetchRoomInfo(resolve));
            if (!info.exists || !info.salt) {
                throw new Error("Host has not created the room yet — ask them to click Create Room first");
            }

            roomSalt = info.salt;
            vault.unlock(pass, roomSalt);
            openEditor("");
            bindEditor();

            if (isApproved) {
                setStatus("Connected · you can edit", "ok");
                socket.emit("register-peer", { name: peerName, color: peerColor });
            } else {
                setStatus("Key OK · waiting for host to click Allow…", "warn");
                editor.readOnly = true;
            }
        } catch (e) {
            errEl.textContent = e.message;
        } finally {
            joinBtn.textContent = "Join Room";
        }
    });

    [joinPass, createPass].forEach((input) => {
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") (input === joinPass ? joinBtn : createBtn).click();
        });
    });

    /* ── Mode buttons ── */
    document.querySelectorAll("[data-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
            displayMode = btn.dataset.mode;
            document.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === displayMode));
            $("mode-indicator").textContent = displayMode.charAt(0).toUpperCase() + displayMode.slice(1);
            applyDisplayMode();
        });
    });

    /* ── Emoji ── */
    document.querySelectorAll(".emoji-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            if (!vault.isUnlocked() || displayMode === "cipher") return;
            const pos = editor.selectionStart;
            const text = editor.value;
            editor.value = text.slice(0, pos) + btn.textContent + text.slice(pos);
            editor.focus();
            sendUpdate();
        });
    });

    $("approve-btn").addEventListener("click", () => {
        if (window._pendingJoin) {
            socket.emit("approve-user", window._pendingJoin.id);
            $("join-modal").hidden = true;
        }
    });

    $("reject-btn").addEventListener("click", () => {
        if (window._pendingJoin) {
            socket.emit("reject-user", window._pendingJoin.id);
            $("join-modal").hidden = true;
        }
    });

    /* ── Socket ── */
    socket.on("connect", () => {
        socketReady = true;
        updateButtons();
        setStatus("Connected to server", "ok");
        log("socket connected " + socket.id);
        fetchRoomInfo(() => {});
    });

    socket.on("disconnect", () => {
        socketReady = false;
        updateButtons();
        setStatus("Disconnected — retrying…", "warn");
    });

    socket.on("connect_error", () => {
        setStatus("Cannot reach server — run npm run dev on host PC", "error");
        showBootError("Server not reachable. On host PC run: cd offline_notepad && npm run dev");
    });

    socket.on("host", () => {
        isHost = true;
        isGuest = false;
        isApproved = true;
        showCreateTab();
        setStatus("You are host — enter a key and click Create Room", "ok");
        updateButtons();
        log("role: host");
    });

    socket.on("guest", (info) => {
        isGuest = true;
        isHost = false;
        showJoinTab();
        setStatus("Click Join Room and enter the host's key", "ok");
        if (info && info.exists && info.salt) setRoomReady(true, info.salt);
        updateButtons();
        log("role: guest");
    });

    socket.on("room-info", (info) => {
        if (info && info.exists && info.salt) setRoomReady(true, info.salt);
    });

    socket.on("room-created", (info) => {
        if (info && info.salt) setRoomReady(true, info.salt);
    });

    socket.on("join-request", (user) => {
        window._pendingJoin = user;
        $("join-user-id").textContent = user.id.slice(0, 12) + "…";
        $("join-modal").hidden = false;
    });

    socket.on("approved", (data) => {
        isApproved = true;
        $("join-modal").hidden = true;
        editor.readOnly = false;
        setStatus("Approved · you can edit now", "ok");
        socket.emit("register-peer", { name: peerName, color: peerColor });
        if (data && data.snapshot) applyRemoteEncrypted(data.snapshot);
        else socket.emit("request-sync");
        editor.focus();
    });

    socket.on("rejected", (data) => {
        setStatus((data && data.reason) || "Rejected by host", "error");
    });

    socket.on("y-delta", applyRemoteEncrypted);
    socket.on("sync-response", (data) => {
        if (data && data.snapshot) applyRemoteEncrypted(data.snapshot);
    });

    socket.on("presence", (data) => {
        const list = $("peer-list");
        const peers = (data && data.peers) || [];
        list.innerHTML = peers.length
            ? peers.map((p) => "<li><span class=\"dot\" style=\"background:" + p.color + "\"></span>" + p.name + (p.isHost ? " · host" : "") + "</li>").join("")
            : "<li class=\"empty\">No peers yet</li>";
    });

    /* ── Boot ── */
    updateButtons();
    showLockScreen(true);
    bindEditor();
    log("app ready");

    window.addEventListener("error", (e) => {
        showBootError("App error: " + (e.message || "unknown"));
    });
})();
