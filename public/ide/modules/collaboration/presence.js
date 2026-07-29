/**
 * Presence — Peer avatar display + Monaco cursor decorations.
 * Renders coloured avatar bubbles in the title bar and
 * live cursor labels inside the Monaco editor for each remote peer.
 */

import { bus } from '../../core/eventbus.js';
import { store } from '../../core/store.js';

export class Presence {
    #decorationIds = new Map(); // peerId → decoration id array
    #monacoEditor  = null;      // Set by editor-manager via bus

    init() {
        // Get a reference to the Monaco editor instance when it's ready
        bus.on('editor:monaco-ready', ({ editor }) => {
            this.#monacoEditor = editor;
        });

        // Re-render avatars when peer list changes
        store.subscribe('peers', (peers) => this._renderAvatars(peers));

        // Render cursor decorations when awareness updates arrive
        bus.on('awareness:states-updated', (states) => {
            this._renderRemoteCursors(states);
        });

        // Join request notification (host only)
        bus.on('join:request', (user) => {
            this._showJoinRequest(user);
        });

        // Peer left — clear their decoration
        bus.on('presence:peer-left', ({ id }) => {
            this._clearDecoration(id);
        });
    }

    // ── Avatar strip ──────────────────────────────────────────────────────────

    _renderAvatars(peers = []) {
        const strip = document.getElementById('collab-avatars');
        if (!strip) return;

        strip.innerHTML = peers.map(p => {
            const initials = (p.name || 'P').slice(0, 2).toUpperCase();
            const isHost   = p.isHost ? ' ★' : '';
            return `
                <div class="collab-avatar" style="background:${p.color || '#6366f1'}" title="${_escape(p.name)}${isHost}">
                    ${initials}
                    ${p.isHost ? '<span class="avatar-host-crown">👑</span>' : ''}
                </div>
            `;
        }).join('');

        // Peer count chip
        const countEl = document.getElementById('peer-count-chip');
        if (countEl) countEl.textContent = `${peers.length} online`;
    }

    // ── Monaco cursor decorations ─────────────────────────────────────────────

    _renderRemoteCursors(states = []) {
        if (!this.#monacoEditor) return;
        /* global monaco */
        const activeFile = store.get('activeFileId');

        for (const state of states) {
            if (!state.cursor) continue;
            if (state.fileId && state.fileId !== activeFile) {
                this._clearDecoration(state.peerId);
                continue;
            }

            const line = Math.max(1, state.cursor.line || 1);
            const col  = Math.max(1, state.cursor.col  || 1);
            const color = state.color || '#6366f1';
            const name  = state.name  || state.peerId?.slice(0, 8) || 'Peer';

            const newDecorations = [{
                range: new monaco.Range(line, col, line, col),
                options: {
                    className:        `remote-cursor-line peer-${_cssId(state.peerId)}`,
                    beforeContentClassName: `remote-cursor-caret peer-caret-${_cssId(state.peerId)}`,
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
                    zIndex: 10,
                    after: {
                        content:    ` ${name} `,
                        inlineClassName: `remote-cursor-label`,
                        inlineClassNameAffectsLetterSpacing: false,
                    },
                },
            }];

            // Inject peer-specific color as CSS custom property
            this._injectPeerStyle(state.peerId, color);

            const old = this.#decorationIds.get(state.peerId) || [];
            const updated = this.#monacoEditor.deltaDecorations(old, newDecorations);
            this.#decorationIds.set(state.peerId, updated);
        }
    }

    _clearDecoration(peerId) {
        if (!this.#monacoEditor) return;
        const old = this.#decorationIds.get(peerId);
        if (old) {
            this.#monacoEditor.deltaDecorations(old, []);
            this.#decorationIds.delete(peerId);
        }
    }

    _injectPeerStyle(peerId, color) {
        const styleId = `peer-style-${_cssId(peerId)}`;
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        const cid = _cssId(peerId);
        style.textContent = `
            .peer-caret-${cid}::before {
                content: '';
                position: absolute;
                width: 2px;
                height: 18px;
                background: ${color};
                border-radius: 1px;
                z-index: 20;
            }
            .remote-cursor-label {
                background: ${color};
                color: #fff;
                font-size: 11px;
                padding: 0 4px;
                border-radius: 3px;
                font-family: var(--ide-font-ui);
                pointer-events: none;
                white-space: nowrap;
                z-index: 20;
            }
        `;
        document.head.appendChild(style);
    }

    // ── Join request UI ───────────────────────────────────────────────────────

    _showJoinRequest(user) {
        const modal = document.getElementById('join-request-modal');
        if (!modal) return;
        modal.hidden = false;
        document.getElementById('join-request-name').textContent = user.name || user.id.slice(0, 12);

        document.getElementById('join-approve-btn').onclick = () => {
            bus.emit('collab:approve-user', { id: user.id });
            modal.hidden = true;
        };
        document.getElementById('join-reject-btn').onclick = () => {
            bus.emit('collab:reject-user', { id: user.id });
            modal.hidden = true;
        };
    }
}

function _cssId(str = '') {
    return str.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 20);
}

function _escape(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export const presence = new Presence();
