/**
 * StatusBar — Bottom status bar.
 * Displays: connection · language · cursor Ln/Col · indentation · encoding · peers · encryption badge.
 * All values come from the store — no direct DOM access from other modules needed.
 */

import { bus } from '../../core/eventbus.js';
import { store } from '../../core/store.js';

export class StatusBar {
    #el;

    init() {
        this.#el = document.getElementById('ide-status-bar');
        if (!this.#el) return;

        this._render();

        // Re-render on any relevant store key change
        const keys = ['connected','language','cursorLine','cursorCol','indentSize','useTabs','encoding','peers','runState'];
        keys.forEach(k => store.subscribe(k, () => this._render()));

        bus.on('editor:cursor-change', ({ line, col }) => {
            store.set({ cursorLine: line, cursorCol: col });
        });
        bus.on('editor:language-change', ({ language }) => {
            store.set('language', language);
        });
    }

    _render() {
        const connected = store.get('connected');
        const lang      = store.get('language') || 'Plain Text';
        const ln        = store.get('cursorLine');
        const col       = store.get('cursorCol');
        const indent    = store.get('indentSize');
        const useTabs   = store.get('useTabs');
        const encoding  = store.get('encoding');
        const peers     = store.get('peers') || [];
        const runState  = store.get('runState');

        this.#el.innerHTML = `
            <div class="status-left">
                <span class="status-pill ${connected ? 'status-ok' : 'status-error'}" id="status-conn" title="${connected ? 'Connected' : 'Disconnected'}">
                    <span class="status-dot"></span>
                    ${connected ? 'Connected' : 'Offline'}
                </span>
                ${runState === 'running' ? '<span class="status-pill status-warn status-running"><span class="spin">⟳</span> Running…</span>' : ''}
            </div>
            <div class="status-right">
                <span class="status-pill status-peers" title="${peers.map(p=>p.name).join(', ') || 'No peers'}" id="status-peers">
                    <svg class="status-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M2 5.5a3.5 3.5 0 1 1 5.898 2.549 5.508 5.508 0 0 1 3.034 4.084.75.75 0 1 1-1.482.235 4.001 4.001 0 0 0-7.9 0 .75.75 0 0 1-1.482-.236A5.507 5.507 0 0 1 3.102 8.05 3.49 3.49 0 0 1 2 5.5Zm5.5 0a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z"/></svg>
                    ${peers.length} peer${peers.length !== 1 ? 's' : ''}
                </span>
                <span class="status-pill" title="Ln ${ln}, Col ${col}" id="status-cursor">Ln ${ln}, Col ${col}</span>
                <span class="status-pill" title="Indentation" id="status-indent">${useTabs ? 'Tab' : `Spaces: ${indent}`}</span>
                <span class="status-pill" title="Encoding" id="status-encoding">${encoding}</span>
                <span class="status-pill status-lang" title="Language" id="status-lang">${_prettyLang(lang)}</span>
                <span class="status-pill status-encrypt" title="End-to-end encrypted">🔒 AES·E2E</span>
            </div>
        `;

        // Lang click → could open language picker in future
        this.#el.querySelector('#status-lang')?.addEventListener('click', () => {
            bus.emit('toast:info', { msg: `Language: ${_prettyLang(lang)}` });
        });
    }
}

function _prettyLang(lang) {
    const map = {
        plaintext: 'Plain Text', javascript: 'JavaScript', typescript: 'TypeScript',
        python: 'Python', html: 'HTML', css: 'CSS', json: 'JSON', markdown: 'Markdown',
        sql: 'SQL', shell: 'Shell', c: 'C', cpp: 'C++', java: 'Java', go: 'Go',
        rust: 'Rust', ruby: 'Ruby', php: 'PHP', yaml: 'YAML',
    };
    return map[lang?.toLowerCase()] || lang;
}

export const statusBar = new StatusBar();
