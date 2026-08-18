/**
 * CollabAdapter — Bridges Yjs CRDT ↔ Monaco Editor model.
 * One Y.Doc per open file; applies remote updates without caret jumping;
 * encrypts all deltas on the wire via the existing SecureVault.
 *
 * This is the critical real-time collaboration engine.
 */

import { bus } from '../../core/eventbus.js';
import { store } from '../../core/store.js';
import { socketClient } from '../../core/socket-client.js';
import * as Y from 'yjs';

const SNAPSHOT_DEBOUNCE_MS = 500;

export class CollabAdapter {
    // fileId → { ydoc, ytext, monacoModel, binding, snapshotTimer }
    #sessions = new Map();
    #vault     = null;
    #remoteLock = false;
    #activeFileId = null;

    init(vault) {
        this.#vault = vault;

        // Per-file CRDT delta from server
        bus.on('file:crdt-delta', ({ fileId, payload }) => {
            this._applyRemoteDelta(fileId, payload);
        });

        // Full state sync for newly joined peer
        bus.on('file:crdt-state', ({ fileId, payload }) => {
            this._applyFullState(fileId, payload);
        });

        // Active file changes → switch binding
        store.subscribe('activeFileId', (fileId) => {
            this.#activeFileId = fileId;
        });

        // When a file is opened and its content is available
        bus.on('tab:open', ({ id: fileId, content = '' }) => {
            this._ensureSession(fileId, content);
        });

        // When editor tab is closed → clean up session
        bus.on('editor:file-closed', ({ fileId }) => {
            this._destroySession(fileId);
        });

        // Vault unlock signals content might need re-rendering
        bus.on('vault:unlocked', () => {
            // Re-apply current session's text
        });
    }

    /**
     * Bind this adapter to a specific Monaco editor model.
     * Called by editor-manager when it switches to a file's model.
     */
    bindModel(fileId, monacoModel) {
        const session = this.#sessions.get(fileId);
        if (!session) return;

        // Detach previous binding listener
        if (session.modelListener) {
            session.modelListener.dispose();
        }

        // Monaco → Yjs: when Monaco content changes locally, push to Yjs
        session.modelListener = monacoModel.onDidChangeContent((event) => {
            if (this.#remoteLock) return;
            if (!this.#vault?.isUnlocked()) return;

            session.ydoc.transact(() => {
                for (const change of event.changes) {
                    if (change.rangeLength > 0) {
                        session.ytext.delete(change.rangeOffset, change.rangeLength);
                    }
                    if (change.text.length > 0) {
                        session.ytext.insert(change.rangeOffset, change.text);
                    }
                }
            }, 'monaco');
        });

        session.monacoModel = monacoModel;
    }

    /**
     * Get the Yjs Y.Doc for a given file (creates if not existing).
     */
    getDoc(fileId) {
        return this.#sessions.get(fileId)?.ydoc ?? null;
    }

    // ── Session management ────────────────────────────────────────────────────

    _ensureSession(fileId, initialContent = '') {
        if (this.#sessions.has(fileId)) return;

        const ydoc  = new Y.Doc();
        const ytext = ydoc.getText('content');

        if (initialContent) {
            ydoc.transact(() => ytext.insert(0, initialContent), 'init');
        }

        let snapshotTimer = null;

        // Yjs → Monaco: when Yjs text changes, push to Monaco model
        ytext.observe(() => {
            if (this.#remoteLock) return;
            const session = this.#sessions.get(fileId);
            if (!session?.monacoModel) return;

            const newText = ytext.toString();
            const oldText = session.monacoModel.getValue();
            if (newText === oldText) return;

            this.#remoteLock = true;
            session.monacoModel.pushEditOperations(
                [],
                [{ range: session.monacoModel.getFullModelRange(), text: newText }],
                () => null,
            );
            this.#remoteLock = false;

            // Mark file dirty
            store.markDirty(fileId, true);
        });

        // Yjs doc updates → encrypt and broadcast
        ydoc.on('update', (update, origin) => {
            if (origin === 'remote' || origin === 'init') return;
            if (!this.#vault?.isUnlocked()) return;

            try {
                const encoded  = Array.from(update).join(',');
                const payload  = this.#vault.encryptText(encoded);
                socketClient.emit('file:y-delta', { fileId, payload });
            } catch {
                /* encryption not ready */
            }

            // Debounced snapshot for new peers
            clearTimeout(snapshotTimer);
            snapshotTimer = setTimeout(() => this._sendSnapshot(fileId), SNAPSHOT_DEBOUNCE_MS);
        });

        this.#sessions.set(fileId, { ydoc, ytext, monacoModel: null, modelListener: null, snapshotTimer });

        // Request server state for this file (for late joiners)
        socketClient.emit('file:y-request', { fileId });
    }

    _destroySession(fileId) {
        const session = this.#sessions.get(fileId);
        if (!session) return;
        session.modelListener?.dispose();
        session.ydoc.destroy();
        this.#sessions.delete(fileId);
    }

    // ── Remote sync ───────────────────────────────────────────────────────────

    _applyRemoteDelta(fileId, payload) {
        if (!this.#vault?.isUnlocked()) return;
        const session = this.#sessions.get(fileId);
        if (!session) return;

        try {
            const decoded = this.#vault.decryptText(payload);
            const update  = new Uint8Array(decoded.split(',').map(Number));
            this.#remoteLock = true;
            Y.applyUpdate(session.ydoc, update, 'remote');
            this.#remoteLock = false;
        } catch {
            /* wrong key or corrupt packet */
        }
    }

    _applyFullState(fileId, payload) {
        if (!this.#vault?.isUnlocked()) return;
        const session = this.#sessions.get(fileId);
        if (!session) return;

        try {
            const decoded = this.#vault.decryptText(payload);
            const update  = new Uint8Array(decoded.split(',').map(Number));
            this.#remoteLock = true;
            Y.applyUpdate(session.ydoc, update, 'remote');
            this.#remoteLock = false;
        } catch {
            /* ignore */
        }
    }

    _sendSnapshot(fileId) {
        if (!this.#vault?.isUnlocked()) return;
        const session = this.#sessions.get(fileId);
        if (!session) return;
        try {
            const state   = Y.encodeStateAsUpdate(session.ydoc);
            const encoded = Array.from(state).join(',');
            const payload = this.#vault.encryptText(encoded);
            socketClient.emit('file:y-snapshot', { fileId, payload });
        } catch {
            /* ignore */
        }
    }
}

export const collabAdapter = new CollabAdapter();
