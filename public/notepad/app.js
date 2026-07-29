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

    let peerName = localStorage.getItem("peer-name");
    if (!peerName) {
        peerName = "User-" + Math.floor(Math.random() * 900 + 100);
        localStorage.setItem("peer-name", peerName);
    }

    let peerColor = localStorage.getItem("peer-color");
    if (!peerColor) {
        peerColor = randomPeerColor();
        localStorage.setItem("peer-color", peerColor);
    }

    const $ = (id) => document.getElementById(id);
    const editor = $("editor");

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

    function setRoomReady(ready, salt) {
        if (salt) roomSalt = salt;
        const wait = $("room-wait");
        if (wait) wait.hidden = ready;
    }

    function getPlainText() {
        return editor.value;
    }

    function updateCharCount() {
        const len = getPlainText().length;
        $("char-count").textContent = len + " chars · " + (len ? "encrypted on wire" : "ready");
    }

    let savedPlaintext = "";

    function applyDisplayMode() {
        if (displayMode === "normal") {
            if (savedPlaintext !== "") {
                editor.value = savedPlaintext;
                savedPlaintext = "";
            }
            editor.readOnly = !isApproved;
            return;
        }
        
        if (savedPlaintext === "") {
            savedPlaintext = getPlainText();
        }

        if (displayMode === "cipher") {
            try {
                editor.value = vault.cipherPreview(savedPlaintext);
            } catch (e) {
                editor.value = "[unlock first]";
            }
            editor.readOnly = true;
            return;
        }
        if (displayMode === "mask") {
            editor.value = vault.maskText(savedPlaintext);
            editor.readOnly = true; // Mask mode is for viewing only to prevent corrupting the document
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


    const urlParams = new URLSearchParams(window.location.search);
    const fileId = urlParams.get("fileId");
    const projectId = urlParams.get("projectId");
    const token = urlParams.get("token");

    function fetchRoomSalt(pass, mode) {
        if (!projectId || !fileId || !token) {
            $("file-error").textContent = "Missing file context in URL.";
            return;
        }
        
        $("file-error").textContent = "";
        const btn = mode === 'shared' ? $("file-share-btn") : $("file-private-btn");
        const originalText = btn.textContent;
        btn.textContent = "Connecting...";

        roomSalt = projectId + "-salt"; 
        
        try {
            if (mode === 'private') {
                // Auto-manage private key in localStorage
                const storageKey = `private_key_${fileId}_${peerName}`;
                let privateKey = localStorage.getItem(storageKey);
                if (!privateKey) {
                    const randomBytes = new Uint8Array(16);
                    crypto.getRandomValues(randomBytes);
                    privateKey = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
                    localStorage.setItem(storageKey, privateKey);
                }
                vault.unlock(privateKey, roomSalt);
            } else {
                if (!pass) throw new Error("Enter the Permanent Room Key");
                vault.unlock(pass, roomSalt);
            }
            
            if (mode === 'shared') {
                socket.emit("join-file", { fileId: fileId });
                openEditor("Collaborative Mode (Auto-Syncing)");
            } else {
                socket.emit("join-file", { fileId: fileId + "_private_" + peerName });
                openEditor("Private Copy (Local Only)");
            }
            bindEditor();
            socket.emit("register-peer", { name: peerName, color: peerColor });
        } catch (e) {
            $("file-error").textContent = e.message;
            btn.textContent = originalText;
        }
    }

    if (fileId && projectId && token) {
        const legacyTabs = $("legacy-tabs");
        if (legacyTabs) legacyTabs.hidden = true;
        
        const joinPanel = $("join-panel");
        if (joinPanel) joinPanel.hidden = true;
        
        const filePanel = $("file-panel");
        if (filePanel) filePanel.hidden = false;
        
        const lockTitle = $("lock-title");
        if (lockTitle) lockTitle.textContent = "Unlock File";

        $("file-private-btn").addEventListener("click", () => {
            fetchRoomSalt($("file-pass").value.trim(), 'private');
        });
        $("file-share-btn").addEventListener("click", () => {
            fetchRoomSalt($("file-pass").value.trim(), 'shared');
        });
    } else {
        const legacyJoinBtn = $("join-btn");
        if (legacyJoinBtn) {
            legacyJoinBtn.addEventListener("click", async () => {
                const pass = $("join-pass").value.trim();
                const errEl = $("join-error");
                errEl.textContent = "";
                legacyJoinBtn.textContent = "Joining…";

                try {
                    if (!pass) throw new Error("Enter the sharing code");
                    if (!socket.connected) throw new Error("Cannot reach server");

                    roomSalt = "global-shared-salt";
                    vault.unlock(pass, roomSalt);
                    socket.emit("join-file", { fileId: "legacy-shared-room" });
                    
                    openEditor("Legacy Shared Room");
                    bindEditor();
                    socket.emit("register-peer", { name: peerName, color: peerColor });
                } catch (e) {
                    errEl.textContent = e.message;
                } finally {
                    legacyJoinBtn.textContent = "Join Sharing Room";
                }
            });
        }
    }

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

    /* ── Socket ── */
    socket.on("connect", () => {
        socketReady = true;
        setStatus("Connected to server", "ok");
        log("socket connected " + socket.id);
    });

    socket.on("disconnect", () => {
        socketReady = false;
        setStatus("Disconnected — retrying…", "warn");
    });

    socket.on("connect_error", () => {
        setStatus("Cannot reach server", "error");
        showBootError("Server not reachable.");
    });

    socket.on("approved", (data) => {
        isApproved = true;
        editor.readOnly = false;
        setStatus("Connected · you can edit now", "ok");
        if (data && data.snapshot) applyRemoteEncrypted(data.snapshot);
        else socket.emit("request-sync");
        editor.focus();
    });

    socket.on("y-delta", applyRemoteEncrypted);
    socket.on("sync-response", (data) => {
        if (data && data.snapshot) applyRemoteEncrypted(data.snapshot);
    });
    socket.on("sync-needed", (data) => {
        if (vault.isUnlocked() && editor.value.length > 0) {
            socket.emit("y-sync-offer", { targetId: data.requesterId, payload: vault.encryptText(editor.value) });
        }
    });

    socket.on("presence", (data) => {
        const list = $("peer-list");
        const peers = (data && data.peers) || [];
        list.innerHTML = peers.length
            ? peers.map((p) => "<li><span class=\"dot\" style=\"background:" + p.color + "\"></span>" + p.name + "</li>").join("")
            : "<li class=\"empty\">No peers yet</li>";
    });

    /* ── Boot ── */
    showLockScreen(true);
    bindEditor();
    log("app ready");

    window.addEventListener("error", (e) => {
        showBootError("App error: " + (e.message || "unknown"));
    });
})();
