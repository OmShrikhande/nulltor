/**
 * FileTree — Left-panel file & directory explorer.
 * Renders a collapsible tree from store.fileTree.
 * Context menu: New File, New Folder, Rename, Delete.
 * Clicking a file opens it in the editor via TabManager.
 */

import { bus } from '../../core/eventbus.js';
import { store } from '../../core/store.js';
import { socketClient } from '../../core/socket-client.js';

export class FileTree {
    #el;
    #expanded = new Set();
    #ctxMenu  = null;

    init() {
        this.#el = document.getElementById('file-tree');
        if (!this.#el) return;

        this._buildContextMenu();
        store.subscribe('fileTree', (tree) => this._render(tree));
        bus.on('fs:listed',      (data) => store.set('fileTree', data.tree || []));
        bus.on('fs:tree-update', (data) => store.set('fileTree', data.tree || []));
        bus.on('fs:read-result', (data) => {
            if (data.fileId) {
                bus.emit('tab:open', { id: data.fileId, name: data.name, path: data.path, content: data.content });
            }
        });

        // Load initial file tree from server
        this._requestTree();

        // Dismiss context menu on outside click
        document.addEventListener('click', () => this._hideCtxMenu());
    }

    _requestTree() {
        socketClient.emit('file:list', { projectId: store.get('projectId') || 'default' });
    }

    _render(tree = []) {
        this.#el.innerHTML = `
            <div class="file-tree-header">
                <span class="file-tree-title">EXPLORER</span>
                <div class="file-tree-actions">
                    <button class="tree-icon-btn" id="tree-new-file" title="New File">
                        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 1.143v3.71c0 .525.284.95.832.95H14v8.46a.64.64 0 0 1-.637.637H2.637A.64.64 0 0 1 2 13.26V2.14A.64.64 0 0 1 2.637 1.5L9.5 1.143ZM10 1l4 4h-4V1ZM8 6.5a.5.5 0 0 0-1 0V8H5.5a.5.5 0 0 0 0 1H7v1.5a.5.5 0 0 0 1 0V9h1.5a.5.5 0 0 0 0-1H8V6.5Z"/></svg>
                    </button>
                    <button class="tree-icon-btn" id="tree-new-folder" title="New Folder">
                        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M.513 1.513A1.75 1.75 0 0 1 1.75 1h3.5c.55 0 1.07.26 1.4.7l.9 1.2a.25.25 0 0 0 .2.1h6.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25V2.75c0-.465.184-.91.513-1.237ZM8.75 7.5a.75.75 0 0 0-1.5 0V9H5.75a.75.75 0 0 0 0 1.5H7.25v1.5a.75.75 0 0 0 1.5 0V10.5h1.5a.75.75 0 0 0 0-1.5H8.75V7.5Z"/></svg>
                    </button>
                    <button class="tree-icon-btn" id="tree-upload-file" title="Upload File from PC">
                        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14H2.75Z"/><path d="M7.25 7.06 5.03 9.28a.75.75 0 0 1-1.06-1.06l3.5-3.5a.75.75 0 0 1 1.06 0l3.5 3.5a.75.75 0 0 1-1.06 1.06L8.75 7.06V1.75a.75.75 0 0 1-1.5 0v5.31Z"/></svg>
                    </button>
                    <button class="tree-icon-btn" id="tree-refresh" title="Refresh">
                        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.001 7.001 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z"/></svg>
                    </button>
                    <input type="file" id="tree-file-input" multiple style="display:none" />
                </div>
            </div>
            <div class="file-tree-body" id="file-tree-body">
                ${tree.length ? this._renderNodes(tree, 0) : '<div class="tree-empty">No files yet.<br>Click <strong>+</strong> or Upload to add files.</div>'}
            </div>
        `;

        // Header buttons
        document.getElementById('tree-new-file')?.addEventListener('click', () => this._promptNewFile(null));
        document.getElementById('tree-new-folder')?.addEventListener('click', () => this._promptNewFolder(null));
        document.getElementById('tree-refresh')?.addEventListener('click', () => this._requestTree());

        // File upload from PC
        const fileInput = document.getElementById('tree-file-input');
        document.getElementById('tree-upload-file')?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', (e) => {
            const files = e.target.files;
            if (!files || !files.length) return;
            for (const f of files) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    socketClient.emit('file:upload', {
                        name: f.name,
                        content: evt.target.result,
                        projectId: store.get('projectId') || 'default'
                    });
                    bus.emit('toast:success', { msg: `Uploaded ${f.name}` });
                };
                reader.readAsText(f);
            }
            e.target.value = '';
        });

        // Drag and Drop Upload
        const bodyEl = document.getElementById('file-tree-body');
        if (bodyEl) {
            bodyEl.addEventListener('dragover', (e) => e.preventDefault());
            bodyEl.addEventListener('drop', (e) => {
                e.preventDefault();
                const files = e.dataTransfer.files;
                if (!files || !files.length) return;
                for (const f of files) {
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                        socketClient.emit('file:upload', {
                            name: f.name,
                            content: evt.target.result,
                            projectId: store.get('projectId') || 'default'
                        });
                        bus.emit('toast:success', { msg: `Uploaded ${f.name}` });
                    };
                    reader.readAsText(f);
                }
            });
        }

        // Node clicks
        this.#el.querySelectorAll('[data-node-id]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const { nodeId, nodeType } = el.dataset;
                if (nodeType === 'dir') {
                    this._toggleDir(nodeId);
                } else {
                    this._openFile(nodeId);
                }
            });
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._showCtxMenu(e.clientX, e.clientY, el.dataset.nodeId, el.dataset.nodeType);
            });
        });
    }

    _renderNodes(nodes, depth) {
        return nodes.map(node => {
            const isDir     = node.type === 'directory';
            const isOpen    = this.#expanded.has(node.id);
            const indent    = depth * 14;
            const icon      = isDir
                ? (isOpen ? '📂' : '📁')
                : _fileIcon(node.name);

            return `
                <div class="tree-node ${isDir ? 'tree-dir' : 'tree-file'} ${isDir && isOpen ? 'tree-dir-open' : ''}"
                     data-node-id="${node.id}"
                     data-node-type="${node.type}"
                     style="padding-left:${12 + indent}px"
                     title="${node.path || node.name}">
                    <span class="tree-node-icon">${icon}</span>
                    <span class="tree-node-name">${_escape(node.name)}</span>
                </div>
                ${isDir && isOpen && node.children?.length
                    ? `<div class="tree-children">${this._renderNodes(node.children, depth + 1)}</div>`
                    : ''}
            `;
        }).join('');
    }

    _toggleDir(id) {
        if (this.#expanded.has(id)) this.#expanded.delete(id);
        else this.#expanded.add(id);
        this._render(store.get('fileTree'));
    }

    _openFile(fileId) {
        socketClient.emit('file:read', { fileId });
    }

    // ── Context menu ──────────────────────────────────────────────────────────

    _buildContextMenu() {
        this.#ctxMenu = document.createElement('div');
        this.#ctxMenu.className = 'ctx-menu';
        this.#ctxMenu.id = 'tree-ctx-menu';
        this.#ctxMenu.hidden = true;
        document.body.appendChild(this.#ctxMenu);
    }

    _showCtxMenu(x, y, nodeId, nodeType) {
        const items = nodeType === 'directory'
            ? [
                { label: '📄 New File',   fn: () => this._promptNewFile(nodeId) },
                { label: '📁 New Folder', fn: () => this._promptNewFolder(nodeId) },
                { label: '✏️ Rename',     fn: () => this._promptRename(nodeId) },
                { label: '🗑️ Delete',     fn: () => this._confirmDelete(nodeId) },
              ]
            : [
                { label: '✏️ Rename', fn: () => this._promptRename(nodeId) },
                { label: '🗑️ Delete', fn: () => this._confirmDelete(nodeId) },
              ];

        this.#ctxMenu.innerHTML = items.map(i => `<div class="ctx-item">${i.label}</div>`).join('');
        this.#ctxMenu.querySelectorAll('.ctx-item').forEach((el, idx) => {
            el.addEventListener('click', () => { items[idx].fn(); this._hideCtxMenu(); });
        });

        this.#ctxMenu.style.left = `${Math.min(x, window.innerWidth - 160)}px`;
        this.#ctxMenu.style.top  = `${Math.min(y, window.innerHeight - items.length * 36)}px`;
        this.#ctxMenu.hidden = false;
    }

    _hideCtxMenu() {
        if (this.#ctxMenu) this.#ctxMenu.hidden = true;
    }

    // ── File ops ──────────────────────────────────────────────────────────────

    _promptNewFile(parentId) {
        const name = prompt('File name (e.g. main.py):');
        if (!name?.trim()) return;
        socketClient.emit('file:create', { name: name.trim(), type: 'file', parentId, projectId: store.get('projectId') || 'default' });
    }

    _promptNewFolder(parentId) {
        const name = prompt('Folder name:');
        if (!name?.trim()) return;
        socketClient.emit('file:create', { name: name.trim(), type: 'directory', parentId, projectId: store.get('projectId') || 'default' });
    }

    _promptRename(nodeId) {
        const node = this._findNode(store.get('fileTree'), nodeId);
        const name = prompt('New name:', node?.name || '');
        if (!name?.trim()) return;
        socketClient.emit('file:rename', { nodeId, name: name.trim() });
    }

    _confirmDelete(nodeId) {
        const node = this._findNode(store.get('fileTree'), nodeId);
        if (!confirm(`Delete "${node?.name || nodeId}"? This cannot be undone.`)) return;
        socketClient.emit('file:delete', { nodeId });
    }

    _findNode(nodes, id) {
        for (const n of nodes) {
            if (n.id === id) return n;
            if (n.children) {
                const found = this._findNode(n.children, id);
                if (found) return found;
            }
        }
        return null;
    }
}

function _fileIcon(name = '') {
    const ext = name.split('.').pop().toLowerCase();
    const m = { js:'🟨',ts:'🔷',py:'🐍',html:'🌐',css:'🎨',json:'📋',md:'📝',
                sh:'⚡',sql:'🗄️',c:'⚙️',cpp:'⚙️',java:'☕',go:'🔵',rs:'🦀',
                rb:'💎',php:'🐘',yaml:'⚙️',yml:'⚙️',env:'🔒',txt:'📄', };
    return m[ext] || '📄';
}

function _escape(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

export const fileTree = new FileTree();
