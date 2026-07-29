/**
 * Awareness — Yjs awareness protocol wrapper.
 * Broadcasts local cursor/selection state to all peers.
 * Receives remote awareness states and emits them on the bus.
 *
 * The actual cursor rendering in Monaco is handled by presence.js.
 */

import { bus } from '../../core/eventbus.js';
import { store } from '../../core/store.js';
import { socketClient } from '../../core/socket-client.js';

const AWARENESS_THROTTLE_MS = 50;

export class Awareness {
    #lastSent = 0;
    #pendingTimer = null;
    #remoteStates = new Map(); // peerId → state

    init() {
        // When local cursor moves, schedule a broadcast
        bus.on('editor:cursor-change', (pos) => {
            this._scheduleLocalBroadcast({ cursor: pos, fileId: store.get('activeFileId') });
        });

        bus.on('editor:selection-change', (sel) => {
            this._scheduleLocalBroadcast({ selection: sel, fileId: store.get('activeFileId') });
        });

        // Receive remote awareness updates
        bus.on('awareness:remote', ({ from, payload }) => {
            try {
                const state = JSON.parse(payload);
                this.#remoteStates.set(from, { ...state, peerId: from });
                bus.emit('awareness:states-updated', this.getRemoteStates());
            } catch {
                /* malformed packet — ignore */
            }
        });

        // Clean up on peer disconnect
        bus.on('presence:peer-left', ({ id }) => {
            this.#remoteStates.delete(id);
            bus.emit('awareness:states-updated', this.getRemoteStates());
        });

        // When room is ready, broadcast our identity immediately
        bus.on('room:created', () => this._broadcastNow());
        bus.on('join:approved', () => this._broadcastNow());
    }

    /**
     * Get all remote awareness states as an array.
     */
    getRemoteStates() {
        return [...this.#remoteStates.values()];
    }

    /**
     * Broadcast the current local awareness state immediately.
     */
    _broadcastNow() {
        const state = {
            name:     store.get('peerName'),
            color:    store.get('peerColor'),
            fileId:   store.get('activeFileId'),
            cursor:   { line: store.get('cursorLine'), col: store.get('cursorCol') },
        };
        socketClient.emit('awareness-update', JSON.stringify(state));
        this.#lastSent = Date.now();
    }

    /**
     * Throttled broadcast — merges pending updates and sends at most every AWARENESS_THROTTLE_MS.
     */
    _scheduleLocalBroadcast(extra = {}) {
        clearTimeout(this.#pendingTimer);
        const now  = Date.now();
        const wait = Math.max(0, AWARENESS_THROTTLE_MS - (now - this.#lastSent));

        this.#pendingTimer = setTimeout(() => {
            const state = {
                name:   store.get('peerName'),
                color:  store.get('peerColor'),
                fileId: store.get('activeFileId'),
                cursor: { line: store.get('cursorLine'), col: store.get('cursorCol') },
                ...extra,
            };
            socketClient.emit('awareness-update', JSON.stringify(state));
            this.#lastSent = Date.now();
        }, wait);
    }
}

export const awareness = new Awareness();
