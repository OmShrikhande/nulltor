/**
 * TerminalPanel — Xterm.js embedded terminal.
 * Connects to the server's PTY bridge via Socket.IO.
 * Supports multiple terminal instances via tabs.
 */

import { bus } from '../../core/eventbus.js';
import { store } from '../../core/store.js';
import { socketClient } from '../../core/socket-client.js';

const XTERM_CDN   = 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js';
const XTERM_CSS   = 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css';
const FIT_CDN     = 'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js';

export class TerminalPanel {
    #terms      = new Map();   // termId → { term, fitAddon, container }
    #activeId   = null;
    #counter    = 0;
    #el         = null;
    #xtermReady = false;

    init() {
        this.#el = document.getElementById('terminal-panel');
        if (!this.#el) return;

        this._loadXterm();

        // Server → terminal output
        bus.on('run:output', ({ termId, data }) => {
            const t = this.#terms.get(termId ?? this.#activeId);
            t?.term.write(data ?? '');
        });

        bus.on('run:exit', ({ termId, code }) => {
            const t = this.#terms.get(termId ?? this.#activeId);
            t?.term.write(`\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m\r\n`);
        });

        // Show terminal panel when run starts
        bus.on('run:started', () => {
            if (!store.get('bottomPanelVisible')) bus.emit('panel:toggle-bottom', {});
            store.set('activeBottomTab', 'terminal');
        });

        // Bus command to create a new terminal
        bus.on('terminal:new', () => this.newTerminal());
        bus.on('terminal:clear', () => this.clearActive());
    }

    newTerminal() {
        if (!this.#xtermReady) {
            setTimeout(() => this.newTerminal(), 500);
            return;
        }

        const id  = ++this.#counter;
        const key = `term-${id}`;

        /* global Terminal, FitAddon */
        const term     = new Terminal({
            theme: {
                background:    '#1e1e1e',
                foreground:    '#d4d4d4',
                cursor:        '#aeafad',
                selection:     'rgba(38,79,120,0.5)',
                black:         '#1e1e1e',
                red:           '#f44747',
                green:         '#6a9955',
                yellow:        '#d7ba7d',
                blue:          '#569cd6',
                magenta:       '#c586c0',
                cyan:          '#4ec9b0',
                white:         '#d4d4d4',
                brightBlack:   '#808080',
                brightRed:     '#f44747',
                brightGreen:   '#b5cea8',
                brightYellow:  '#dcdcaa',
                brightBlue:    '#9cdcfe',
                brightMagenta: '#c586c0',
                brightCyan:    '#4dc9b0',
                brightWhite:   '#e6e6e6',
            },
            fontFamily: '"JetBrains Mono","Cascadia Code","Fira Code",Consolas,monospace',
            fontSize:   13,
            lineHeight: 1.4,
            cursorBlink: true,
            cursorStyle: 'bar',
            scrollback:  5000,
            allowProposedApi: true,
        });

        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);

        // Render into hidden container
        const container = document.createElement('div');
        container.className = 'terminal-instance';
        container.id = `xterm-${key}`;
        container.style.display = 'none';
        container.style.height  = '100%';

        const body = this.#el.querySelector('.terminal-body') || this.#el;
        body.appendChild(container);

        term.open(container);
        fitAddon.fit();

        // Input → server
        term.onData((data) => {
            socketClient.emit('terminal:input', { termId: key, data });
        });

        // Server spawns PTY
        socketClient.emit('terminal:spawn', { termId: key, cwd: store.get('projectId') || '.' });

        this.#terms.set(key, { term, fitAddon, container });

        this._addTab(key, `Shell ${id}`);
        this._switchTo(key);

        // Fit on resize
        const ro = new ResizeObserver(() => {
            if (this.#activeId === key) fitAddon.fit();
        });
        ro.observe(container);
    }

    clearActive() {
        const t = this.#terms.get(this.#activeId);
        t?.term.clear();
    }

    writeToActive(text) {
        const t = this.#terms.get(this.#activeId);
        t?.term.write(text);
    }

    // ── Tab strip ─────────────────────────────────────────────────────────────

    _addTab(termId, label) {
        const strip = this.#el.querySelector('#terminal-tab-strip');
        if (!strip) return;

        const btn = document.createElement('button');
        btn.className = 'terminal-tab';
        btn.id = `terminal-tab-${termId}`;
        btn.textContent = label;
        btn.addEventListener('click', () => this._switchTo(termId));

        // Close on middle click
        btn.addEventListener('auxclick', (e) => {
            if (e.button === 1) this._closeTerminal(termId);
        });

        const closeBtn = document.createElement('span');
        closeBtn.className = 'terminal-tab-close';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close terminal';
        closeBtn.addEventListener('click', (e) => { e.stopPropagation(); this._closeTerminal(termId); });
        btn.appendChild(closeBtn);

        strip.appendChild(btn);
    }

    _switchTo(termId) {
        // Hide previous
        if (this.#activeId) {
            const prev = this.#terms.get(this.#activeId);
            if (prev) prev.container.style.display = 'none';
            document.getElementById(`terminal-tab-${this.#activeId}`)?.classList.remove('terminal-tab-active');
        }

        // Show next
        this.#activeId = termId;
        const cur = this.#terms.get(termId);
        if (cur) {
            cur.container.style.display = 'block';
            cur.fitAddon.fit();
            cur.term.focus();
        }
        document.getElementById(`terminal-tab-${termId}`)?.classList.add('terminal-tab-active');
    }

    _closeTerminal(termId) {
        const t = this.#terms.get(termId);
        if (!t) return;
        t.term.dispose();
        t.container.remove();
        this.#terms.delete(termId);

        document.getElementById(`terminal-tab-${termId}`)?.remove();

        if (this.#activeId === termId) {
            const next = [...this.#terms.keys()].pop();
            if (next) this._switchTo(next);
            else this.#activeId = null;
        }

        socketClient.emit('terminal:kill', { termId });
    }

    // ── Load Xterm.js from CDN ────────────────────────────────────────────────

    _loadXterm() {
        const css = document.createElement('link');
        css.rel = 'stylesheet'; css.href = XTERM_CSS;
        document.head.appendChild(css);

        _loadScript(XTERM_CDN).then(() =>
            _loadScript(FIT_CDN)
        ).then(() => {
            this.#xtermReady = true;
            bus.emit('terminal:ready', {});
            this.newTerminal(); // Open first terminal automatically
        }).catch(() => {
            bus.emit('toast:error', { msg: 'Could not load Xterm.js terminal from CDN.' });
        });
    }
}

function _loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

export const terminalPanel = new TerminalPanel();
