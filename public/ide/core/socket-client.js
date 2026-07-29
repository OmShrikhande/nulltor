/**
 * SocketClient — Centralises all Socket.IO network logic.
 * Translates raw socket events → EventBus events.
 * Modules never import socket.io directly.
 *
 * Usage:
 *   import { socketClient } from '../core/socket-client.js';
 *   socketClient.connect();
 *   socketClient.emit('file:read', { fileId });
 */

import { bus } from './eventbus.js';
import { store } from './store.js';

class SocketClient {
    #socket = null;
    #reconnectAttempts = 0;
    #maxReconnectAttempts = 10;

    /**
     * Connect to the Socket.IO server.
     */
    connect() {
        if (this.#socket) return;

        /* global io */
        this.#socket = io({
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: this.#maxReconnectAttempts,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        });

        this._bindEvents();
    }

    /**
     * Emit an event to the server.
     * @param {string} event
     * @param {*} data
     * @param {Function} [ack]  Optional acknowledgement callback
     */
    emit(event, data, ack) {
        if (!this.#socket) {
            console.warn('[SocketClient] Not connected — cannot emit:', event);
            return;
        }
        if (typeof ack === 'function') {
            this.#socket.emit(event, data, ack);
        } else {
            this.#socket.emit(event, data);
        }
    }

    /**
     * Raw socket ID.
     */
    get id() { return this.#socket?.id ?? null; }

    /**
     * Is the socket currently connected?
     */
    get connected() { return this.#socket?.connected ?? false; }

    // ── Private ───────────────────────────────────────────────────────────────

    _bindEvents() {
        const s = this.#socket;

        // ── Connection lifecycle ──────────────────────────────────────────
        s.on('connect', () => {
            this.#reconnectAttempts = 0;
            store.set({ connected: true, socketId: s.id });
            bus.emit('socket:connected', { id: s.id });
            console.info('[SocketClient] Connected:', s.id);
        });

        s.on('disconnect', (reason) => {
            store.set({ connected: false });
            bus.emit('socket:disconnected', { reason });
            console.warn('[SocketClient] Disconnected:', reason);
        });

        s.on('connect_error', (err) => {
            bus.emit('socket:error', { message: err.message });
        });

        s.on('reconnect_attempt', (n) => {
            this.#reconnectAttempts = n;
            bus.emit('socket:reconnecting', { attempt: n });
        });

        // ── Role assignment ───────────────────────────────────────────────
        s.on('host', () => {
            store.set({ role: 'host', isApproved: true });
            bus.emit('role:host', {});
        });

        s.on('guest', (info) => {
            store.set({ role: 'guest', isApproved: false });
            if (info?.salt) store.set('roomSalt', info.salt);
            bus.emit('role:guest', info);
        });

        s.on('host-promoted', () => {
            store.set({ role: 'host', isApproved: true });
            bus.emit('role:host-promoted', {});
        });

        // ── Room ─────────────────────────────────────────────────────────
        s.on('room-created', (info) => {
            if (info?.salt) store.set('roomSalt', info.salt);
            bus.emit('room:created', info);
        });

        s.on('room-info', (info) => {
            if (info?.salt) store.set('roomSalt', info.salt);
            bus.emit('room:info', info);
        });

        // ── Join request / approval ───────────────────────────────────────
        s.on('join-request', (user) => {
            store.set('pendingJoins', [...store.get('pendingJoins'), user]);
            bus.emit('join:request', user);
        });

        s.on('approved', (data) => {
            store.set({ isApproved: true });
            bus.emit('join:approved', data);
        });

        s.on('rejected', (data) => {
            bus.emit('join:rejected', data);
        });

        // ── Presence ─────────────────────────────────────────────────────
        s.on('presence', (data) => {
            store.set('peers', data?.peers || []);
            bus.emit('presence:update', data);
        });

        s.on('peer-left', (data) => {
            bus.emit('presence:peer-left', data);
        });

        // ── CRDT / document sync ──────────────────────────────────────────
        s.on('y-delta', (payload) => {
            bus.emit('crdt:delta', payload);
        });

        s.on('sync-response', (data) => {
            bus.emit('crdt:sync-response', data);
        });

        s.on('sync-needed', (data) => {
            bus.emit('crdt:sync-needed', data);
        });

        // ── Per-file CRDT ─────────────────────────────────────────────────
        s.on('file:y-delta', (payload) => {
            bus.emit('file:crdt-delta', payload);
        });

        s.on('file:y-state', (payload) => {
            bus.emit('file:crdt-state', payload);
        });

        // ── Awareness (cursors) ───────────────────────────────────────────
        s.on('awareness-update', (data) => {
            bus.emit('awareness:remote', data);
        });

        // ── File operations (responses) ───────────────────────────────────
        s.on('file:listed', (data) => {
            bus.emit('fs:listed', data);
        });

        s.on('file:read-result', (data) => {
            bus.emit('fs:read-result', data);
        });

        s.on('file:write-result', (data) => {
            bus.emit('fs:write-result', data);
        });

        s.on('file:rename-result', (data) => {
            bus.emit('fs:rename-result', data);
        });

        s.on('file:delete-result', (data) => {
            bus.emit('fs:delete-result', data);
        });

        s.on('file:tree-update', (data) => {
            store.set('fileTree', data.tree || []);
            bus.emit('fs:tree-update', data);
        });

        // ── Code execution ────────────────────────────────────────────────
        s.on('run:output', (data) => {
            bus.emit('run:output', data);
        });

        s.on('run:exit', (data) => {
            store.set({ runState: 'idle', runPid: null });
            bus.emit('run:exit', data);
        });

        s.on('run:started', (data) => {
            store.set({ runState: 'running', runPid: data?.pid ?? null });
            bus.emit('run:started', data);
        });

        s.on('run:error', (data) => {
            store.set({ runState: 'idle', runPid: null });
            bus.emit('run:error', data);
        });
    }
}

export const socketClient = new SocketClient();
