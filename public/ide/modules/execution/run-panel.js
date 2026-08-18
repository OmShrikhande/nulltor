/**
 * RunPanel — Code execution panel.
 * Displays Run/Stop controls, language selector, and streams output.
 * Server-side execution via socket run:execute / run:kill events.
 */

import { bus } from '../../core/eventbus.js';
import { store } from '../../core/store.js';
import { socketClient } from '../../core/socket-client.js';

const SUPPORTED_LANGS = [
    { id: 'python',     label: 'Python 3',    cmd: 'python3' },
    { id: 'javascript', label: 'Node.js',     cmd: 'node'   },
    { id: 'typescript', label: 'ts-node',     cmd: 'ts-node' },
    { id: 'c',          label: 'C (gcc)',      cmd: 'gcc'    },
    { id: 'cpp',        label: 'C++ (g++)',    cmd: 'g++'    },
    { id: 'java',       label: 'Java',         cmd: 'java'   },
    { id: 'go',         label: 'Go',           cmd: 'go run' },
    { id: 'shell',      label: 'Bash',         cmd: 'bash'   },
    { id: 'ruby',       label: 'Ruby',         cmd: 'ruby'   },
];

export class RunPanel {
    #el;
    #outputEl;
    #selectedLang = null;

    init() {
        this.#el = document.getElementById('run-panel');
        if (!this.#el) return;

        this._render();

        // Auto-select language from active file
        bus.on('editor:language-change', ({ language }) => {
            const found = SUPPORTED_LANGS.find(l => l.id === language);
            if (found) {
                this.#selectedLang = found.id;
                this._updateLangSelect();
            }
        });

        // Stream output into the output area
        bus.on('run:output', ({ data }) => {
            this._appendOutput(data);
        });

        bus.on('run:started', ({ pid }) => {
            this._setRunning(true);
            this._appendOutput(`\x1b[32m▶ Process started (PID: ${pid})\x1b[0m\n`);
        });

        bus.on('run:exit', ({ code, elapsed }) => {
            this._setRunning(false);
            const color = code === 0 ? '\x1b[32m' : '\x1b[31m';
            this._appendOutput(`\n${color}■ Exited with code ${code}${elapsed ? ` · ${elapsed}ms` : ''}\x1b[0m\n`);
        });

        bus.on('run:error', ({ message }) => {
            this._setRunning(false);
            this._appendOutput(`\x1b[31m✗ Error: ${message}\x1b[0m\n`);
        });
    }

    _render() {
        this.#el.innerHTML = `
            <div class="run-toolbar">
                <div class="run-lang-group">
                    <label for="run-lang-select" class="run-label">Language</label>
                    <select id="run-lang-select" class="run-select">
                        ${SUPPORTED_LANGS.map(l => `<option value="${l.id}">${l.label}</option>`).join('')}
                    </select>
                </div>
                <div class="run-controls">
                    <button class="run-btn run-btn-compile" id="run-compile-btn" title="Compile / Build">
                        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M14.7 8.56a.75.75 0 0 0-.7-1.06H10.5V2.75a.75.75 0 0 0-1.5 0V7.5H4.25A.75.75 0 0 0 3.55 8.56l5 6a.75.75 0 0 0 1.15 0l5-6Z"/></svg>
                        Compile
                    </button>
                    <button class="run-btn run-btn-run" id="run-execute-btn" title="Run (Ctrl+F5)">
                        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2.78 2.068a.75.75 0 0 0-1.03.704v10.456a.75.75 0 0 0 1.03.704l10.456-5.228a.75.75 0 0 0 0-1.408Z"/></svg>
                        Run
                    </button>
                    <button class="run-btn run-btn-stop" id="run-stop-btn" title="Stop" disabled>
                        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 3.75C2 2.784 2.784 2 3.75 2h8.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25Z"/></svg>
                        Stop
                    </button>
                    <button class="run-btn run-btn-clear" id="run-clear-btn" title="Clear output">
                        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>
                        Clear
                    </button>
                </div>
                <div class="run-status" id="run-status-badge">
                    <span class="run-status-dot"></span>
                    <span id="run-status-text">Idle</span>
                </div>
            </div>
            <div class="run-output" id="run-output" role="log" aria-live="polite">
                <pre id="run-output-pre" class="run-output-pre"><span class="run-placeholder">Run a file to see output here…</span></pre>
            </div>
        `;

        this.#outputEl = this.#el.querySelector('#run-output-pre');

        // Sync lang select with active file
        const sel = this.#el.querySelector('#run-lang-select');
        if (this.#selectedLang) sel.value = this.#selectedLang;
        sel.addEventListener('change', (e) => { this.#selectedLang = e.target.value; });

        this.#el.querySelector('#run-compile-btn').addEventListener('click', () => this._compile());
        this.#el.querySelector('#run-execute-btn').addEventListener('click', () => this._execute());
        this.#el.querySelector('#run-stop-btn').addEventListener('click', () => this._kill());
        this.#el.querySelector('#run-clear-btn').addEventListener('click', () => this._clearOutput());
    }

    _updateLangSelect() {
        const sel = this.#el?.querySelector('#run-lang-select');
        if (sel && this.#selectedLang) sel.value = this.#selectedLang;
    }

    _compile() {
        const fileId = store.get('activeFileId');
        if (!fileId) {
            bus.emit('toast:warning', { msg: 'No file open — open a file before compiling.' });
            return;
        }

        // Auto-save active file first
        bus.emit('editor:save', {});

        const lang = this.#selectedLang
            ?? SUPPORTED_LANGS.find(l => l.id === store.get('language'))?.id;

        this._clearOutput();
        socketClient.emit('run:compile', { fileId, lang });

        if (!store.get('bottomPanelVisible')) bus.emit('panel:toggle-bottom', {});
        store.set('activeBottomTab', 'run');
    }

    _execute() {
        const fileId  = store.get('activeFileId');
        const lang    = this.#selectedLang
            ?? SUPPORTED_LANGS.find(l => l.id === store.get('language'))?.id;

        if (!fileId) {
            bus.emit('toast:warning', { msg: 'No file open — open a file before running.' });
            return;
        }

        if (store.get('runState') === 'running') {
            bus.emit('toast:warning', { msg: 'A process is already running. Stop it first.' });
            return;
        }

        // Auto-save active file before running
        bus.emit('editor:save', {});

        this._clearOutput();
        socketClient.emit('run:execute', { fileId, lang });

        // Show the bottom panel
        if (!store.get('bottomPanelVisible')) bus.emit('panel:toggle-bottom', {});
        store.set('activeBottomTab', 'run');
    }

    _kill() {
        const pid = store.get('runPid');
        socketClient.emit('run:kill', { pid });
    }

    _clearOutput() {
        if (this.#outputEl) {
            this.#outputEl.innerHTML = '<span class="run-placeholder">Run a file to see output here…</span>';
        }
    }

    _appendOutput(text) {
        if (!this.#outputEl) return;
        // Remove placeholder
        this.#outputEl.querySelector('.run-placeholder')?.remove();

        // Convert ANSI codes to styled spans (basic subset)
        const span = document.createElement('span');
        span.innerHTML = _ansiToHtml(text);
        this.#outputEl.appendChild(span);

        // Auto-scroll
        this.#outputEl.parentElement.scrollTop = this.#outputEl.parentElement.scrollHeight;
    }

    _setRunning(running) {
        const runBtn  = this.#el?.querySelector('#run-execute-btn');
        const stopBtn = this.#el?.querySelector('#run-stop-btn');
        const badge   = this.#el?.querySelector('#run-status-badge');
        const text    = this.#el?.querySelector('#run-status-text');

        if (runBtn)  runBtn.disabled  = running;
        if (stopBtn) stopBtn.disabled = !running;
        if (badge)   badge.classList.toggle('run-status-active', running);
        if (text)    text.textContent = running ? 'Running…' : 'Idle';
    }
}

// ── Basic ANSI → HTML ─────────────────────────────────────────────────────────
function _ansiToHtml(text) {
    const escaped = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return escaped
        .replace(/\x1b\[0m/g,  '</span>')
        .replace(/\x1b\[1m/g,  '<span style="font-weight:bold">')
        .replace(/\x1b\[31m/g, '<span style="color:#f44747">')
        .replace(/\x1b\[32m/g, '<span style="color:#6a9955">')
        .replace(/\x1b\[33m/g, '<span style="color:#d7ba7d">')
        .replace(/\x1b\[34m/g, '<span style="color:#569cd6">')
        .replace(/\x1b\[36m/g, '<span style="color:#4ec9b0">')
        .replace(/\x1b\[90m/g, '<span style="color:#808080">')
        .replace(/\r\n|\n/g, '\n');
}

export const runPanel = new RunPanel();
