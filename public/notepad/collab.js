import * as Y from "/vendor/yjs/yjs.mjs";

/**
 * CRDT-backed collaborative editor.
 * Concurrent edits (including same-line) merge automatically — no errors, no locks.
 */
export class CollabEngine {
    #ydoc;
    #ytext;
    #textarea;
    #remoteLock = false;
    #onDisplayChange = null;
    #onLocalUpdate = null;
    #displayMode = "normal";
    #vault = null;
    #awarenessState = null;
    #remoteAwareness = {};
    #peerName = "You";
    #peerColor = "#6366f1";

    constructor(textarea, vault) {
        this.#textarea = textarea;
        this.#vault = vault;
        this.#ydoc = new Y.Doc();
        this.#ytext = this.#ydoc.getText("content");

        this.#ytext.observe(() => this.#onRemoteTextChange());
        this.#ydoc.on("update", (update, origin) => {
            if (origin !== "remote" && this.#onLocalUpdate) {
                this.#onLocalUpdate(update);
            }
        });

        textarea.addEventListener("input", () => this.#onLocalInput());
        textarea.addEventListener("keydown", (e) => this.#onKeyDown(e));
        textarea.addEventListener("paste", (e) => {
            if (this.#displayMode === "mask") {
                e.preventDefault();
                const text = e.clipboardData?.getData("text") || "";
                if (!text) return;
                const pos = this.#textarea.selectionStart;
                this.#ydoc.transact(() => {
                    this.#ytext.insert(pos, text);
                });
                requestAnimationFrame(() => this.#refreshDisplay());
                return;
            }
            requestAnimationFrame(() => this.#onLocalInput());
        });
        textarea.addEventListener("cut", () => {
            requestAnimationFrame(() => this.#onLocalInput());
        });
    }

    setDisplayMode(mode) {
        this.#displayMode = mode;
        return this.#refreshDisplay();
    }

    setOnLocalUpdate(handler) {
        this.#onLocalUpdate = handler;
    }

    setOnDisplayChange(handler) {
        this.#onDisplayChange = handler;
    }

    getDocument() {
        return this.#ydoc;
    }

    getPlainText() {
        return this.#ytext.toString();
    }

    applyRemoteUpdate(updateBytes) {
        Y.applyUpdate(this.#ydoc, updateBytes, "remote");
    }

    encodeState() {
        return Y.encodeStateAsUpdate(this.#ydoc);
    }

    applyFullState(stateBytes) {
        Y.applyUpdate(this.#ydoc, stateBytes, "remote");
        this.#refreshDisplay(true);
    }

    setAwarenessState(state) {
        this.#awarenessState = state;
        this.#renderRemoteCursors();
    }

    getLocalAwareness() {
        return {
            cursor: this.#textarea.selectionStart,
            selectionEnd: this.#textarea.selectionEnd,
            name: this.#peerName || "You",
            color: this.#peerColor || "#6366f1"
        };
    }

    setPeerIdentity(name, color) {
        this.#peerName = name;
        this.#peerColor = color;
    }

    setRemoteAwareness(states) {
        this.#remoteAwareness = states;
        this.#renderRemoteCursors();
    }

    #onLocalInput() {
        if (this.#remoteLock || this.#displayMode !== "normal") return;

        const oldText = this.#ytext.toString();
        const newText = this.#textarea.value;

        if (oldText === newText) return;

        this.#ydoc.transact(() => {
            this.#applyTextDiff(oldText, newText);
        });
    }

    #applyTextDiff(oldText, newText) {
        let prefix = 0;
        const minLen = Math.min(oldText.length, newText.length);
        while (prefix < minLen && oldText[prefix] === newText[prefix]) {
            prefix++;
        }

        let suffix = 0;
        while (
            suffix < oldText.length - prefix &&
            suffix < newText.length - prefix &&
            oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
        ) {
            suffix++;
        }

        const deleteCount = oldText.length - prefix - suffix;
        const insertText = newText.slice(prefix, newText.length - suffix);

        if (deleteCount > 0) {
            this.#ytext.delete(prefix, deleteCount);
        }
        if (insertText.length > 0) {
            this.#ytext.insert(prefix, insertText);
        }
    }

    #onRemoteTextChange() {
        if (this.#remoteLock) return;

        const selStart = this.#textarea.selectionStart;
        const selEnd = this.#textarea.selectionEnd;
        const oldLen = this.#textarea.value.length;
        const plain = this.#ytext.toString();

        this.#remoteLock = true;
        this.#textarea.value = plain;
        this.#remoteLock = false;

        const delta = plain.length - oldLen;
        const newStart = Math.max(0, Math.min(plain.length, selStart + delta));
        const newEnd = Math.max(0, Math.min(plain.length, selEnd + delta));

        try {
            this.#textarea.setSelectionRange(newStart, newEnd);
        } catch {
            /* selection fallback — never throw */
        }

        this.#refreshDisplay();
        this.#onDisplayChange?.(plain);
    }

    async #refreshDisplay(fromRemote = false) {
        const plain = this.#ytext.toString();

        if (this.#displayMode === "normal") {
            if (fromRemote || this.#textarea.value !== plain) {
                const selStart = this.#textarea.selectionStart;
                const selEnd = this.#textarea.selectionEnd;
                this.#remoteLock = true;
                this.#textarea.value = plain;
                this.#remoteLock = false;
                try {
                    this.#textarea.setSelectionRange(selStart, selEnd);
                } catch {
                    /* ignore */
                }
            }
            this.#textarea.readOnly = false;
            return;
        }

        this.#remoteLock = true;

        if (this.#displayMode === "mask") {
            this.#textarea.value = this.#vault.maskText(plain);
            this.#textarea.readOnly = false;
        } else if (this.#displayMode === "cipher") {
            try {
                this.#textarea.value = await this.#vault.cipherPreview(plain);
            } catch {
                this.#textarea.value = "[Encrypted — unlock to view]";
            }
            this.#textarea.readOnly = true;
        }

        this.#remoteLock = false;
    }

    #onKeyDown(e) {
        if (this.#displayMode === "cipher") {
            e.preventDefault();
            return;
        }

        if (this.#displayMode === "mask") {
            if (e.key === "Backspace" || e.key === "Delete") {
                e.preventDefault();
                this.#handleMaskDelete(e);
                return;
            }
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                this.#handleMaskInsert(e.key);
            }
        }
    }

    #handleMaskInsert(char) {
        const pos = this.#textarea.selectionStart;
        this.#ydoc.transact(() => {
            this.#ytext.insert(pos, char);
        });
        requestAnimationFrame(async () => {
            await this.#refreshDisplay();
            const newPos = pos + 1;
            this.#textarea.setSelectionRange(newPos, newPos);
        });
    }

    #handleMaskDelete(e) {
        const start = this.#textarea.selectionStart;
        const end = this.#textarea.selectionEnd;

        this.#ydoc.transact(() => {
            if (start !== end) {
                this.#ytext.delete(start, end - start);
            } else if (e.key === "Backspace" && start > 0) {
                this.#ytext.delete(start - 1, 1);
            } else if (e.key === "Delete" && start < this.#ytext.length) {
                this.#ytext.delete(start, 1);
            }
        });

        requestAnimationFrame(() => this.#refreshDisplay());
    }

    #renderRemoteCursors() {
        const layer = document.getElementById("cursor-layer");
        if (!layer || !this.#remoteAwareness) return;

        layer.innerHTML = "";

        for (const [peerId, state] of Object.entries(this.#remoteAwareness)) {
            if (!state || state.cursor == null) continue;

            const marker = document.createElement("div");
            marker.className = "remote-cursor";
            marker.style.borderColor = state.color || "#6366f1";
            marker.title = state.name || peerId;
            marker.style.left = `${Math.min(95, (state.cursor / Math.max(1, this.#ytext.length)) * 100)}%`;
            layer.appendChild(marker);
        }
    }
}
