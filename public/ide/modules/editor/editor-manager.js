/**
 * EditorManager — Monaco Editor integration.
 * Creates one ITextModel per open file, switches active model on tab change.
 * No model is destroyed when switching — instant tab switching.
 * Wires language detection, cursor tracking, and the collab adapter.
 */

import { bus } from '../../core/eventbus.js';
import { store } from '../../core/store.js';
import { collabAdapter } from './collab-adapter.js';
import { socketClient } from '../../core/socket-client.js';

const MONACO_VS = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs';
const SAVE_DEBOUNCE_MS = 800;

const LANG_MAP = {
    js:'javascript', ts:'typescript', jsx:'javascript', tsx:'typescript',
    py:'python', html:'html', css:'css', scss:'css', json:'json',
    md:'markdown', sh:'shell', bash:'shell', sql:'sql', c:'c', cpp:'cpp',
    h:'cpp', java:'java', go:'go', rs:'rust', rb:'ruby', php:'php',
    yaml:'yaml', yml:'yaml', env:'plaintext', txt:'plaintext', xml:'xml',
};

export class EditorManager {
    #editor      = null;  // monaco.editor.IStandaloneCodeEditor
    #models      = new Map();   // fileId → ITextModel
    #saveTimers  = new Map();   // fileId → timer
    #vault       = null;

    init(vault) {
        this.#vault = vault;

        bus.on('tab:open',     ({ id, name, content = '' }) => this._openModel(id, name, content));
        bus.on('tab:activate', ({ fileId })                  => this._switchModel(fileId));
        bus.on('editor:activate', ({ fileId })               => this._switchModel(fileId));
        bus.on('editor:file-closed', ({ fileId })            => this._destroyModel(fileId));
        bus.on('editor:save',  ()                            => this._saveActive());
        bus.on('panel:resize-left',   () => this.#editor?.layout());
        bus.on('panel:resize-bottom', () => this.#editor?.layout());
        bus.on('panel:toggle-left',   () => setTimeout(() => this.#editor?.layout(), 150));
        bus.on('panel:toggle-bottom', () => setTimeout(() => this.#editor?.layout(), 150));

        // Collab adapter needs the vault
        collabAdapter.init(vault);

        this._loadMonaco();
    }

    layout() { this.#editor?.layout(); }

    // ── Monaco boot ───────────────────────────────────────────────────────────

    _loadMonaco() {
        if (window.monaco) {
            this._createEditor();
            return;
        }
        if (document.getElementById('monaco-loader-script')) {
            return;
        }
        const loaderScript = document.createElement('script');
        loaderScript.id = 'monaco-loader-script';
        loaderScript.src = `${MONACO_VS}/loader.js`;
        loaderScript.onload = () => {
            /* global require */
            if (window.require) {
                require.config({ paths: { vs: MONACO_VS } });
                require(['vs/editor/editor.main'], () => this._createEditor());
            }
        };
        loaderScript.onerror = () => bus.emit('toast:error', { msg: 'Failed to load Monaco Editor from CDN.', persist: true });
        document.head.appendChild(loaderScript);
    }

    _createEditor() {
        /* global monaco */
        const container = document.getElementById('monaco-container');
        if (!container) return;

        // Define custom Nullator dark theme
        monaco.editor.defineTheme('nullator-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'comment',  foreground: '6a9955', fontStyle: 'italic' },
                { token: 'keyword',  foreground: 'c586c0' },
                { token: 'string',   foreground: 'ce9178' },
                { token: 'number',   foreground: 'b5cea8' },
                { token: 'type',     foreground: '4ec9b0' },
                { token: 'function', foreground: 'dcdcaa' },
            ],
            colors: {
                'editor.background':           '#1e1e1e',
                'editor.foreground':           '#d4d4d4',
                'editorLineNumber.foreground': '#858585',
                'editorCursor.foreground':     '#aeafad',
                'editor.selectionBackground':  '#264f78',
                'editor.lineHighlightBackground': '#2a2d2e',
                'editorWidget.background':     '#252526',
                'editorSuggestWidget.background': '#252526',
                'editorSuggestWidget.border':  '#454545',
            },
        });

        this.#editor = monaco.editor.create(container, {
            theme:             store.get('editorTheme') || 'nullator-dark',
            fontSize:          store.get('editorFontSize') || 14,
            fontFamily:        store.get('editorFontFamily') || '"JetBrains Mono", "Cascadia Code", "Fira Code", Consolas, monospace',
            fontLigatures:     true,
            lineHeight:        22,
            letterSpacing:     0.2,
            minimap:           { enabled: true, scale: 1, renderCharacters: false },
            scrollBeyondLastLine: false,
            renderWhitespace: 'selection',
            smoothScrolling:   true,
            cursorBlinking:    'smooth',
            cursorSmoothCaretAnimation: 'on',
            tabSize:           4,
            insertSpaces:      true,
            wordWrap:          'off',
            rulers:            [80, 120],
            bracketPairColorization: { enabled: true },
            formatOnPaste:     true,
            formatOnType:      false,
            automaticLayout:   false,   // We call layout() manually
            suggest: {
                showKeywords:  true,
                showSnippets:  true,
            },
        });

        // Dynamic theme, font size, font family updates
        store.subscribe('editorTheme', (theme) => {
            if (this.#editor && theme) monaco.editor.setTheme(theme);
        });
        store.subscribe('editorFontFamily', (font) => {
            if (this.#editor && font) this.#editor.updateOptions({ fontFamily: font });
        });
        store.subscribe('editorFontSize', (size) => {
            if (this.#editor && size) this.#editor.updateOptions({ fontSize: Number(size) });
        });

        // Cursor position tracking
        this.#editor.onDidChangeCursorPosition((e) => {
            bus.emit('editor:cursor-change', { line: e.position.lineNumber, col: e.position.column });
        });

        // Selection tracking for awareness
        this.#editor.onDidChangeCursorSelection((e) => {
            bus.emit('editor:selection-change', {
                startLine: e.selection.startLineNumber, startCol: e.selection.startColumn,
                endLine:   e.selection.endLineNumber,   endCol:   e.selection.endColumn,
            });
        });

        // Ctrl+S → save
        this.#editor.addCommand(
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
            () => this._saveActive(),
        );

        // Ctrl+P → command palette stub
        this.#editor.addCommand(
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP,
            () => bus.emit('toast:info', { msg: 'Command Palette coming soon…' }),
        );

        bus.emit('editor:monaco-ready', { editor: this.#editor });

        // If there's already an active file, load it
        const activeFileId = store.get('activeFileId');
        if (activeFileId) this._switchModel(activeFileId);

        // Responsive resize observer
        const ro = new ResizeObserver(() => this.#editor?.layout());
        ro.observe(container);
    }

    // ── Model management ──────────────────────────────────────────────────────

    _openModel(fileId, filename, content) {
        if (this.#models.has(fileId)) {
            this._switchModel(fileId);
            return;
        }

        const lang  = _detectLang(filename);
        const uri   = monaco.Uri.parse(`file:///${fileId}/${filename}`);
        const model = monaco.editor.createModel(content, lang, uri);

        // Auto-save on content change
        model.onDidChangeContent(() => {
            store.markDirty(fileId, true);
            clearTimeout(this.#saveTimers.get(fileId));
            this.#saveTimers.set(fileId, setTimeout(() => this._saveFile(fileId), SAVE_DEBOUNCE_MS));
        });

        this.#models.set(fileId, model);
        collabAdapter.bindModel(fileId, model);

        store.set('language', lang);
        bus.emit('editor:language-change', { language: lang });

        this._switchModel(fileId);
    }

    _switchModel(fileId) {
        if (!this.#editor || !fileId) return;

        const model = this.#models.get(fileId);
        if (!model) return;

        this.#editor.setModel(model);
        this.#editor.focus();
        collabAdapter.bindModel(fileId, model);

        const lang = model.getLanguageId();
        store.set('language', lang);
        bus.emit('editor:language-change', { language: lang });
        bus.emit('editor:cursor-change', {
            line: this.#editor.getPosition()?.lineNumber ?? 1,
            col:  this.#editor.getPosition()?.column ?? 1,
        });
    }

    _destroyModel(fileId) {
        const model = this.#models.get(fileId);
        model?.dispose();
        this.#models.delete(fileId);
        clearTimeout(this.#saveTimers.get(fileId));
        this.#saveTimers.delete(fileId);
    }

    // ── Save ──────────────────────────────────────────────────────────────────

    _saveActive() {
        const fileId = store.get('activeFileId');
        if (fileId) this._saveFile(fileId);
    }

    _saveFile(fileId) {
        const model = this.#models.get(fileId);
        if (!model) return;

        const content = model.getValue();
        socketClient.emit('file:write', { fileId, content });
        store.markDirty(fileId, false);
        bus.emit('toast:success', { msg: 'File saved', duration: 1500 });
    }
}

function _detectLang(filename = '') {
    const ext = filename.split('.').pop().toLowerCase();
    return LANG_MAP[ext] || 'plaintext';
}

export const editorManager = new EditorManager();
