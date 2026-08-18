/**
 * DebugPanel — Debug UI scaffold.
 * Provides: Breakpoints list, Call Stack, Variables tree, Watch expressions.
 * Currently shows a graceful "not connected" state.
 * Architecture is ready for DAP (Debug Adapter Protocol) integration.
 */

import { bus } from '../../core/eventbus.js';

export class DebugPanel {
    #el;
    #breakpoints = new Map();  // fileId → Set<lineNumber>
    #isConnected = false;

    init() {
        this.#el = document.getElementById('debug-panel');
        if (!this.#el) return;

        this._render();

        // Listen for future DAP connection events
        bus.on('debug:connected',    () => this._onConnected());
        bus.on('debug:disconnected', () => this._onDisconnected());
        bus.on('debug:paused',       (frame) => this._onPaused(frame));
        bus.on('debug:resumed',      () => this._onResumed());
        bus.on('debug:stopped',      () => this._onDisconnected());

        // Breakpoints from editor
        bus.on('editor:breakpoint-toggle', ({ fileId, line }) => {
            this._toggleBreakpoint(fileId, line);
        });
    }

    _render() {
        this.#el.innerHTML = `
            <div class="debug-toolbar">
                <button class="debug-btn" id="debug-start-btn" title="Start Debugging (F5)">
                    <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2.78 2.068a.75.75 0 0 0-1.03.704v10.456a.75.75 0 0 0 1.03.704l10.456-5.228a.75.75 0 0 0 0-1.408Z"/></svg>
                </button>
                <button class="debug-btn" id="debug-pause-btn" title="Pause" disabled>
                    <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.25 3C3.007 3 2 4.007 2 5.25v5.5C2 11.993 3.007 13 4.25 13h1.5C6.993 13 8 11.993 8 10.75v-5.5C8 4.007 6.993 3 5.75 3H4.25Zm6 0C9.007 3 8 4.007 8 5.25v5.5C8 11.993 9.007 13 10.25 13h1.5C12.993 13 14 11.993 14 10.75v-5.5C14 4.007 12.993 3 11.75 3h-1.5Z"/></svg>
                </button>
                <button class="debug-btn" id="debug-step-over" title="Step Over (F10)" disabled>
                    <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 3.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM2 8a6 6 0 1 1 12 0A6 6 0 0 1 2 8Z"/></svg>
                </button>
                <button class="debug-btn" id="debug-step-into" title="Step Into (F11)" disabled>
                    <svg viewBox="0 0 16 16" fill="currentColor"><path d="M7.78 1.97a.75.75 0 0 1 0 1.06L6.56 4.25h1.19a4.25 4.25 0 0 1 0 8.5h-4a.75.75 0 0 1 0-1.5h4a2.75 2.75 0 0 0 0-5.5H6.56l1.22 1.22a.75.75 0 1 1-1.06 1.06L4.47 5.78a.75.75 0 0 1 0-1.06l2.25-2.25a.75.75 0 0 1 1.06 0Z"/></svg>
                </button>
                <button class="debug-btn" id="debug-step-out" title="Step Out (Shift+F11)" disabled>
                    <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8.22 1.97a.75.75 0 0 0-1.06 1.06L8.94 4.75H7.75a4.25 4.25 0 0 0 0 8.5h4a.75.75 0 0 0 0-1.5h-4a2.75 2.75 0 0 1 0-5.5h1.19L7.72 7.47a.75.75 0 0 0 1.06 1.06l2.25-2.25a.75.75 0 0 0 0-1.06L8.78 3.03a.75.75 0 0 0-.56-.06Z"/></svg>
                </button>
                <button class="debug-btn debug-btn-stop" id="debug-stop-btn" title="Stop Debugging" disabled>
                    <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 3.75C2 2.784 2.784 2 3.75 2h8.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25Z"/></svg>
                </button>
                <div class="debug-status-badge ${this.#isConnected ? 'debug-connected' : ''}" id="debug-status">
                    ${this.#isConnected ? '● Connected' : '○ Not connected'}
                </div>
            </div>

            <div class="debug-sections">
                <!-- Variables -->
                <details class="debug-section" open>
                    <summary class="debug-section-title">Variables</summary>
                    <div class="debug-section-body" id="debug-variables">
                        ${this._renderEmpty('variables')}
                    </div>
                </details>

                <!-- Watch -->
                <details class="debug-section">
                    <summary class="debug-section-title">
                        Watch
                        <button class="debug-add-btn" id="debug-add-watch" title="Add expression">+</button>
                    </summary>
                    <div class="debug-section-body" id="debug-watch">
                        ${this._renderEmpty('watch expressions')}
                    </div>
                </details>

                <!-- Call Stack -->
                <details class="debug-section" open>
                    <summary class="debug-section-title">Call Stack</summary>
                    <div class="debug-section-body" id="debug-callstack">
                        ${this._renderEmpty('call stack frames')}
                    </div>
                </details>

                <!-- Breakpoints -->
                <details class="debug-section" open>
                    <summary class="debug-section-title">Breakpoints</summary>
                    <div class="debug-section-body" id="debug-breakpoints">
                        ${this._renderBreakpoints()}
                    </div>
                </details>
            </div>

            ${!this.#isConnected ? `
                <div class="debug-no-adapter">
                    <div class="debug-no-adapter-icon">🔌</div>
                    <p>No debug adapter connected.</p>
                    <p class="debug-no-adapter-hint">DAP integration is planned. For now, use the <strong>Run</strong> panel to execute code.</p>
                    <button class="run-btn run-btn-run" id="debug-goto-run">Go to Run panel</button>
                </div>
            ` : ''}
        `;

        this.#el.querySelector('#debug-goto-run')?.addEventListener('click', () => {
            bus.emit('activity:tab-change', { tab: 'run' });
        });

        this.#el.querySelector('#debug-start-btn')?.addEventListener('click', () => {
            bus.emit('toast:info', { msg: 'Debug adapter not connected. Use the Run panel.' });
        });
    }

    _renderEmpty(label) {
        return `<div class="debug-empty">No ${label}</div>`;
    }

    _renderBreakpoints() {
        const all = [];
        for (const [fileId, lines] of this.#breakpoints.entries()) {
            for (const line of lines) {
                all.push({ fileId, line });
            }
        }
        if (!all.length) return this._renderEmpty('breakpoints');

        return all.map(bp => `
            <div class="debug-bp-item">
                <span class="debug-bp-dot">●</span>
                <span class="debug-bp-file">${bp.fileId.split('/').pop()}</span>
                <span class="debug-bp-line">:${bp.line}</span>
                <button class="debug-bp-remove" data-file="${bp.fileId}" data-line="${bp.line}">✕</button>
            </div>
        `).join('');
    }

    _toggleBreakpoint(fileId, line) {
        if (!this.#breakpoints.has(fileId)) this.#breakpoints.set(fileId, new Set());
        const lines = this.#breakpoints.get(fileId);
        if (lines.has(line)) lines.delete(line);
        else lines.add(line);
        this._refreshBreakpoints();
    }

    _refreshBreakpoints() {
        const el = this.#el?.querySelector('#debug-breakpoints');
        if (el) el.innerHTML = this._renderBreakpoints();
    }

    _onConnected()     { this.#isConnected = true;  this._render(); }
    _onDisconnected()  { this.#isConnected = false; this._render(); }
    _onPaused(frame)   { /* populate call stack and variables */ }
    _onResumed()       { /* clear pause indicators */ }
}

export const debugPanel = new DebugPanel();
