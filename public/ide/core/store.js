/**
 * Store — Reactive global state.
 * Single source of truth for the entire IDE.
 * Modules subscribe to slices; mutations go through `store.set()`.
 *
 * Usage:
 *   import { store } from '../core/store.js';
 *   store.subscribe('peers', (peers) => renderAvatars(peers));
 *   store.set('activeFileId', 'file-123');
 */

import { bus } from './eventbus.js';

class Store {
    #state = {
        // ── Connection ──────────────────────────────────────────────────
        connected: false,
        socketId: null,

        // ── Identity ────────────────────────────────────────────────────
        peerName: localStorage.getItem('ide-peer-name') || _generateName(),
        peerColor: localStorage.getItem('ide-peer-color') || _randomColor(),
        role: null,          // 'host' | 'guest'
        isApproved: false,

        // ── Project ──────────────────────────────────────────────────────
        projectId: null,
        projectName: 'Untitled Project',
        roomSalt: null,

        // ── File System ──────────────────────────────────────────────────
        fileTree: [],        // Array<FileNode>
        openFiles: [],       // Array<FileTab>
        activeFileId: null,

        // ── Peers ────────────────────────────────────────────────────────
        peers: [],           // Array<{ id, name, color, isHost, activeFileId }>

        // ── Editor ──────────────────────────────────────────────────────
        language: 'plaintext',
        cursorLine: 1,
        cursorCol: 1,
        indentSize: 4,
        useTabs: false,
        encoding: 'UTF-8',
        editorTheme: localStorage.getItem('ide-theme') || 'nullator-dark',
        editorFontFamily: localStorage.getItem('ide-font-family') || "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
        editorFontSize: parseInt(localStorage.getItem('ide-font-size') || '14', 10),

        // ── Run / Terminal ───────────────────────────────────────────────
        runState: 'idle',    // 'idle' | 'running' | 'killed'
        runPid: null,

        // ── UI State ─────────────────────────────────────────────────────
        leftPanelVisible: true,
        bottomPanelVisible: true,
        leftPanelWidth: 240,
        bottomPanelHeight: 220,
        activeActivityTab: 'explorer',  // 'explorer'|'search'|'run'|'debug'|'settings'
        activeBottomTab: 'terminal',    // 'terminal'|'output'|'problems'|'debug'

        // ── Notifications ────────────────────────────────────────────────
        notifications: [],

        // ── Pending join requests (host-only) ───────────────────────────
        pendingJoins: [],
    };

    #subscribers = new Map();

    /**
     * Get a state value.
     * @param {string} key
     */
    get(key) {
        return this.#state[key];
    }

    /**
     * Get the full state snapshot (read-only).
     */
    snapshot() {
        return { ...this.#state };
    }

    /**
     * Set one or more state values and notify subscribers.
     * @param {string|Object} keyOrObj
     * @param {*} [value]
     */
    set(keyOrObj, value) {
        const changes = typeof keyOrObj === 'string'
            ? { [keyOrObj]: value }
            : keyOrObj;

        for (const [k, v] of Object.entries(changes)) {
            const prev = this.#state[k];
            if (prev === v) continue;
            this.#state[k] = v;

            // Notify per-key subscribers
            const handlers = this.#subscribers.get(k);
            if (handlers) {
                for (const h of handlers) {
                    try { h(v, prev); } catch (e) { console.error('[Store]', e); }
                }
            }
        }

        // Emit a generic change event on the bus so modules can batch-react
        bus.emit('store:change', changes);
    }

    /**
     * Subscribe to a specific key's changes.
     * @param {string} key
     * @param {Function} handler  (newValue, prevValue) => void
     * @returns {Function} Unsubscribe
     */
    subscribe(key, handler) {
        if (!this.#subscribers.has(key)) {
            this.#subscribers.set(key, new Set());
        }
        this.#subscribers.get(key).add(handler);
        // Immediately invoke with current value
        handler(this.#state[key], undefined);
        return () => this.#subscribers.get(key)?.delete(handler);
    }

    /**
     * Persist identity fields to localStorage.
     */
    saveIdentity() {
        localStorage.setItem('ide-peer-name', this.#state.peerName);
        localStorage.setItem('ide-peer-color', this.#state.peerColor);
    }

    // ── File helpers ──────────────────────────────────────────────────────────

    openFile(fileNode) {
        const already = this.#state.openFiles.find(f => f.id === fileNode.id);
        if (!already) {
            this.set('openFiles', [...this.#state.openFiles, { ...fileNode, dirty: false }]);
        }
        this.set('activeFileId', fileNode.id);
    }

    closeFile(fileId) {
        const files = this.#state.openFiles.filter(f => f.id !== fileId);
        this.set('openFiles', files);
        if (this.#state.activeFileId === fileId) {
            const next = files[files.length - 1];
            this.set('activeFileId', next ? next.id : null);
        }
    }

    markDirty(fileId, dirty = true) {
        this.set('openFiles', this.#state.openFiles.map(f =>
            f.id === fileId ? { ...f, dirty } : f
        ));
    }

    getOpenFile(fileId) {
        return this.#state.openFiles.find(f => f.id === fileId) || null;
    }
}

function _generateName() {
    const adj = ['Swift', 'Bold', 'Calm', 'Keen', 'Wise', 'Pure'];
    const noun = ['Coder', 'Dev', 'Hacker', 'Wizard', 'Ninja'];
    return adj[Math.floor(Math.random() * adj.length)] + noun[Math.floor(Math.random() * noun.length)];
}

function _randomColor() {
    const palette = ['#6366f1','#8b5cf6','#ec4899','#14b8a6','#f59e0b','#22c55e','#ef4444','#3b82f6'];
    return palette[Math.floor(Math.random() * palette.length)];
}

export const store = new Store();
