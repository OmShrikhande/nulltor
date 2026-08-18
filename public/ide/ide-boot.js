/**
 * ide-boot.js — IDE Orchestrator / Entry Point
 * Imports and initialises every module in the correct dependency order.
 * This is the ONLY file loaded directly by index.html.
 *
 * Boot order:
 *  1. Core (EventBus already exported at import time)
 *  2. Store, SocketClient
 *  3. Layout (PanelManager, TabManager)
 *  4. UI Modules (ActivityBar, StatusBar, Notifications)
 *  5. Collaboration (Awareness, Presence)
 *  6. Feature Modules (FileTree, Editor, Terminal, Run, Debug)
 *  7. Socket connection + Collab room flow
 */

/* global SecureVault, Y */

// ── Core ──────────────────────────────────────────────────────────────────────
import { bus }          from './core/eventbus.js';
import { store }        from './core/store.js';
import { socketClient } from './core/socket-client.js';

// ── Layout ────────────────────────────────────────────────────────────────────
import { panelManager } from './layout/panel-manager.js';
import { tabManager }   from './layout/tab-manager.js';

// ── UI Modules ────────────────────────────────────────────────────────────────
import { toast }       from './modules/notifications/toast.js';
import { activityBar } from './modules/activity-bar/activity-bar.js';
import { statusBar }   from './modules/status-bar/status-bar.js';

// ── Collaboration ─────────────────────────────────────────────────────────────
import { awareness } from './modules/collaboration/awareness.js';
import { presence }  from './modules/collaboration/presence.js';

// ── Feature Modules ───────────────────────────────────────────────────────────
import { fileTree }      from './modules/file-tree/file-tree.js';
import { editorManager } from './modules/editor/editor-manager.js';
import { terminalPanel } from './modules/terminal/terminal-panel.js';
import { runPanel }      from './modules/execution/run-panel.js';
import { debugPanel }    from './modules/debug/debug-panel.js';

// ── Yjs ───────────────────────────────────────────────────────────────────────
import * as Y from 'yjs';
window.Y = Y;

// ─────────────────────────────────────────────────────────────────────────────

function boot() {
    // ── 1. Restore persisted layout prefs ─────────────────────────────────────
    const savedLeftW  = parseInt(localStorage.getItem('ide-left-width')    || '240', 10);
    const savedBotH   = parseInt(localStorage.getItem('ide-bottom-height') || '220', 10);
    store.set({ leftPanelWidth: savedLeftW, bottomPanelHeight: savedBotH });

    // ── 2. Init layout ────────────────────────────────────────────────────────
    panelManager.init();
    tabManager.init();

    // ── 3. Init UI modules ────────────────────────────────────────────────────
    toast.init();
    activityBar.init();
    statusBar.init();

    // ── 4. Init collaboration modules ─────────────────────────────────────────
    awareness.init();
    presence.init();

    // ── 5. Init feature modules ───────────────────────────────────────────────
    fileTree.init();

    // Create vault (SecureVault from existing crypto.js — loaded in index.html)
    const vault = new SecureVault();
    editorManager.init(vault);
    terminalPanel.init();
    runPanel.init();
    debugPanel.init();

    // ── 6. Wire up the collab room modal ──────────────────────────────────────
    _initCollabModal(vault);

    // ── 7. Wire bottom tabs ───────────────────────────────────────────────────
    _initBottomTabs();

    // ── 8. Wire activity tab → left panel view switching ─────────────────────
    _initActivityTabViews();

    // ── 9. Wire settings panel ────────────────────────────────────────────────
    _initSettings();

    // ── 10. Wire title bar buttons ────────────────────────────────────────────
    _initTitleBar(vault);

    // ── 11. Connect socket ────────────────────────────────────────────────────
    socketClient.connect();

    // ── 12. Global keyboard shortcuts ─────────────────────────────────────────
    _initKeyboardShortcuts();

    // ── 13. Wire socket → vault unlock (approve flow) ─────────────────────────
    bus.on('join:approved', (data) => {
        if (data?.salt && vault) {
            // Vault is already unlocked by modal — just request file sync
            socketClient.emit('request-sync', {});
        }
        toast.success('Joined session — you can now edit');
    });

    bus.on('join:rejected', (data) => {
        toast.error((data?.reason) || 'Host rejected your join request.');
        document.getElementById('collab-modal').hidden = false;
    });

    bus.on('role:host-promoted', () => {
        toast.info('You are now the host of this session.');
    });

    bus.on('socket:disconnected', () => {
        toast.warning('Disconnected. Reconnecting…', { duration: 3000 });
    });

    bus.on('socket:connected', () => {
        // Bring up the collab modal once connected (if not already in a room)
        if (!store.get('roomSalt')) {
            document.getElementById('collab-modal').hidden = false;
        }
    });

    // Host/guest role assignment
    bus.on('role:host', () => {
        // Switch to Create tab
        document.getElementById('tab-create')?.click();
    });

    bus.on('role:guest', () => {
        // Switch to Join tab
        document.getElementById('tab-join')?.click();
    });

    // Approve/reject from presence.js modal
    bus.on('collab:approve-user', ({ id }) => {
        socketClient.emit('approve-user', id);
        store.set('pendingJoins', store.get('pendingJoins').filter(p => p.id !== id));
    });
    bus.on('collab:reject-user', ({ id }) => {
        socketClient.emit('reject-user', id);
        store.set('pendingJoins', store.get('pendingJoins').filter(p => p.id !== id));
    });

    // Run from left sidebar shortcut
    document.getElementById('run-from-left-btn')?.addEventListener('click', () => {
        bus.emit('editor:save', {});
        setTimeout(() => bus.emit('run:trigger', {}), 400);
        store.set('activeBottomTab', 'run');
        if (!store.get('bottomPanelVisible')) bus.emit('panel:toggle-bottom', {});
    });

    // New terminal button
    document.getElementById('bottom-new-terminal')?.addEventListener('click', () => {
        bus.emit('terminal:new', {});
    });

    // Close bottom panel
    document.getElementById('bottom-toggle-panel')?.addEventListener('click', () => {
        bus.emit('panel:toggle-bottom', {});
    });

    console.info('[Nullator IDE] Boot complete');
}

// ── Collab Room Modal ──────────────────────────────────────────────────────────
function _initCollabModal(vault) {
    const modal = document.getElementById('collab-modal');

    const showCreate = () => {
        document.getElementById('create-panel').classList.add('active');
        document.getElementById('join-panel').classList.remove('active');
        document.getElementById('tab-create').classList.add('active');
        document.getElementById('tab-join').classList.remove('active');
    };

    const showJoin = () => {
        document.getElementById('join-panel').classList.add('active');
        document.getElementById('create-panel').classList.remove('active');
        document.getElementById('tab-join').classList.add('active');
        document.getElementById('tab-create').classList.remove('active');
    };

    document.getElementById('tab-create').addEventListener('click', showCreate);
    document.getElementById('tab-join').addEventListener('click', showJoin);

    // Pre-fill peer name
    const savedName = store.get('peerName');
    document.getElementById('create-peer-name').value = savedName;
    document.getElementById('join-peer-name').value   = savedName;

    // Create room
    document.getElementById('create-room-btn').addEventListener('click', async () => {
        const key    = document.getElementById('create-room-key').value.trim();
        const name   = document.getElementById('create-peer-name').value.trim() || store.get('peerName');
        const errEl  = document.getElementById('create-error');
        const btn    = document.getElementById('create-room-btn');
        errEl.textContent = '';

        if (!key) { errEl.textContent = 'Enter a room key'; return; }
        if (!socketClient.connected) { errEl.textContent = 'Not connected to server yet — wait a moment'; return; }

        store.set('peerName', name);
        store.saveIdentity();

        btn.disabled = true;
        btn.textContent = 'Creating room…';

        const salt = SecureVault.createSaltBase64();
        vault.unlock(key, salt);

        const closeModal = () => {
            modal.hidden = true;
            modal.style.display = 'none';
            btn.disabled = false;
            btn.textContent = 'Create Room';
            toast.success('Room created — share key: ' + key, { duration: 6000 });
            store.set('projectName', `Room: ${key}`);
            document.getElementById('title-project-name').textContent = key;
            if (fileTree && fileTree._requestTree) fileTree._requestTree();
        };

        // Register room-created listener BEFORE emitting create-room
        bus.once('room:created', () => {
            socketClient.emit('register-peer', { name, color: store.get('peerColor') });
            closeModal();
        });

        socketClient.emit('create-room', { salt });

        // Fallback: Ensure modal closes even if room:created event was handled prior
        setTimeout(() => {
            if (modal.style.display !== 'none' && !modal.hidden) {
                closeModal();
            }
        }, 1200);
    });

    // Join room
    document.getElementById('join-room-btn').addEventListener('click', async () => {
        const key   = document.getElementById('join-room-key').value.trim();
        const name  = document.getElementById('join-peer-name').value.trim() || store.get('peerName');
        const errEl = document.getElementById('join-error');
        errEl.textContent = '';

        if (!key) { errEl.textContent = 'Enter the room key from the host'; return; }
        if (!socketClient.connected) { errEl.textContent = 'Not connected to server yet'; return; }

        store.set('peerName', name);
        store.saveIdentity();

        // Get room info (salt) from server
        socketClient.emit('get-room-info', (info) => {
            if (!info?.exists || !info?.salt) {
                errEl.textContent = 'Room not found — ask the host to create the room first';
                return;
            }
            vault.unlock(key, info.salt);
            toast.info('Key accepted — waiting for host approval…');
            document.getElementById('join-room-btn').disabled = true;
            document.getElementById('join-room-btn').textContent = 'Waiting…';
        });
    });
}

// ── Bottom Panel Tabs ──────────────────────────────────────────────────────────
function _initBottomTabs() {
    const TABS = {
        terminal: 'bottom-view-terminal',
        run:      'bottom-view-run',
        problems: 'bottom-view-problems',
    };

    const switchTo = (tabId) => {
        document.querySelectorAll('.bottom-tab').forEach(t => t.classList.remove('bottom-tab-active'));
        document.querySelectorAll('.bottom-view').forEach(v => v.classList.remove('active'));
        document.getElementById(`btab-${tabId}`)?.classList.add('bottom-tab-active');
        document.getElementById(TABS[tabId])?.classList.add('active');
        store.set('activeBottomTab', tabId);
    };

    document.querySelectorAll('.bottom-tab[data-btab]').forEach(btn => {
        btn.addEventListener('click', () => switchTo(btn.dataset.btab));
    });

    store.subscribe('activeBottomTab', (tab) => {
        if (tab && TABS[tab]) switchTo(tab);
    });
}

// ── Activity Tab → Left Panel View ────────────────────────────────────────────
function _initActivityTabViews() {
    const VIEW_MAP = {
        explorer: 'view-explorer',
        search:   'view-search',
        run:      'view-run',
        debug:    'view-debug',
        settings: 'view-settings',
    };

    bus.on('activity:tab-change', ({ tab }) => {
        document.querySelectorAll('.left-panel-view').forEach(v => v.classList.remove('active'));
        const viewId = VIEW_MAP[tab];
        if (viewId) document.getElementById(viewId)?.classList.add('active');
    });
}

// ── Settings Panel ────────────────────────────────────────────────────────────
function _initSettings() {
    const nameInput  = document.getElementById('settings-peer-name');
    const colorInput = document.getElementById('settings-peer-color');
    const themeSel   = document.getElementById('settings-editor-theme');
    const fontSel    = document.getElementById('settings-editor-font');
    const sizeInput  = document.getElementById('settings-editor-size');
    const sizeVal    = document.getElementById('settings-font-size-val');
    const saveBtn    = document.getElementById('settings-save-btn');

    if (nameInput)  nameInput.value  = store.get('peerName');
    if (colorInput) colorInput.value = store.get('peerColor');
    if (themeSel)   themeSel.value   = store.get('editorTheme') || 'nullator-dark';
    if (fontSel)    fontSel.value    = store.get('editorFontFamily') || "'JetBrains Mono', Consolas, monospace";
    if (sizeInput)  sizeInput.value  = store.get('editorFontSize') || 14;
    if (sizeVal)    sizeVal.textContent = store.get('editorFontSize') || 14;

    sizeInput?.addEventListener('input', (e) => {
        if (sizeVal) sizeVal.textContent = e.target.value;
    });

    saveBtn?.addEventListener('click', () => {
        const name  = nameInput?.value.trim()  || store.get('peerName');
        const color = colorInput?.value || store.get('peerColor');
        const theme = themeSel?.value   || store.get('editorTheme');
        const font  = fontSel?.value    || store.get('editorFontFamily');
        const size  = parseInt(sizeInput?.value || '14', 10);

        store.set({
            peerName: name,
            peerColor: color,
            editorTheme: theme,
            editorFontFamily: font,
            editorFontSize: size
        });

        store.saveIdentity();
        localStorage.setItem('ide-theme', theme);
        localStorage.setItem('ide-font-family', font);
        localStorage.setItem('ide-font-size', size);

        socketClient.emit('register-peer', { name, color });
        bus.emit('toast:success', { msg: 'Settings saved & applied!' });
    });
}

// ── Title Bar ─────────────────────────────────────────────────────────────────
function _initTitleBar(vault) {
    document.getElementById('title-share-btn')?.addEventListener('click', () => {
        const url = location.href;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(() => toast.success('IDE URL copied to clipboard!'));
        } else {
            toast.info('Share this URL: ' + url);
        }
    });
}

// ── Global Keyboard Shortcuts ─────────────────────────────────────────────────
function _initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+B → toggle left panel
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            bus.emit('panel:toggle-left', {});
        }
        // Ctrl+` → toggle bottom panel (terminal)
        if ((e.ctrlKey || e.metaKey) && e.key === '`') {
            e.preventDefault();
            bus.emit('panel:toggle-bottom', {});
        }
        // Ctrl+F5 → run current file
        if (e.ctrlKey && e.key === 'F5') {
            e.preventDefault();
            bus.emit('run:trigger', {});
            store.set('activeBottomTab', 'run');
            if (!store.get('bottomPanelVisible')) bus.emit('panel:toggle-bottom', {});
        }
    });

    // Bus event for run trigger
    bus.on('run:trigger', () => {
        document.getElementById('run-execute-btn')?.click();
    });
}

// ── Run ───────────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
