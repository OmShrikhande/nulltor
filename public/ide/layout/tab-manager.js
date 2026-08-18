/**
 * TabManager — Editor tab lifecycle.
 * Manages open tabs: open, close, activate, dirty state, reorder.
 * Renders the tab strip DOM and fires EventBus events on tab changes.
 */

import { bus } from '../core/eventbus.js';
import { store } from '../core/store.js';

export class TabManager {
    #strip;

    init() {
        this.#strip = document.getElementById('tab-strip');
        if (!this.#strip) return;

        store.subscribe('openFiles',    () => this._render());
        store.subscribe('activeFileId', () => this._render());

        bus.on('tab:open',   (file) => this.open(file));
        bus.on('tab:close',  ({ fileId }) => this.close(fileId));
        bus.on('tab:activate', ({ fileId }) => this.activate(fileId));
    }

    open(fileNode) {
        store.openFile(fileNode);
        this._render();
    }

    close(fileId) {
        // Warn if dirty
        const file = store.getOpenFile(fileId);
        if (file?.dirty) {
            const ok = confirm(`"${file.name}" has unsaved changes. Close anyway?`);
            if (!ok) return;
        }
        store.closeFile(fileId);
        bus.emit('editor:file-closed', { fileId });
        this._render();
    }

    activate(fileId) {
        store.set('activeFileId', fileId);
        bus.emit('editor:activate', { fileId });
        this._render();
    }

    markDirty(fileId, dirty) {
        store.markDirty(fileId, dirty);
        this._render();
    }

    _render() {
        if (!this.#strip) return;
        const files  = store.get('openFiles');
        const active = store.get('activeFileId');

        this.#strip.innerHTML = files.map(f => `
            <div class="tab ${f.id === active ? 'tab-active' : ''}" data-file-id="${f.id}" title="${f.path || f.name}">
                <span class="tab-icon">${_langIcon(f.name)}</span>
                <span class="tab-name">${f.name}</span>
                ${f.dirty ? '<span class="tab-dirty" title="Unsaved changes">●</span>' : ''}
                <button class="tab-close" data-close="${f.id}" title="Close">✕</button>
            </div>
        `).join('');

        // Events
        this.#strip.querySelectorAll('.tab').forEach(tab => {
            const fid = tab.dataset.fileId;
            tab.addEventListener('click', (e) => {
                if (e.target.closest('.tab-close')) return;
                this.activate(fid);
            });
            tab.addEventListener('auxclick', (e) => {
                if (e.button === 1) this.close(fid); // Middle-click close
            });
        });

        this.#strip.querySelectorAll('.tab-close').forEach(btn => {
            btn.addEventListener('click', () => this.close(btn.dataset.close));
        });
    }
}

function _langIcon(filename = '') {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
        js: '🟨', ts: '🔷', py: '🐍', html: '🌐', css: '🎨',
        json: '📋', md: '📝', txt: '📄', sh: '⚡', sql: '🗄️',
        c: '⚙️', cpp: '⚙️', java: '☕', go: '🔵', rs: '🦀',
        rb: '💎', php: '🐘', yaml: '⚙️', yml: '⚙️', env: '🔒',
    };
    return icons[ext] || '📄';
}

export const tabManager = new TabManager();
