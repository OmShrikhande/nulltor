import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useEditorStore } from '../../store/editorStore';
import { useTheme } from '../../context/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { type RemoteCursor, uint8ArrayToBase64 } from '../../hooks/useYjsDoc';
import { Edit2, File, Palette, User, History, Bot, RefreshCw, X, Save, Folder, Sparkles, Trash2, Plus, Terminal as TermIcon, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { CommitHistoryPanel } from './CommitHistoryPanel';
import { extractTextFromYjsSnapshot } from './DiffViewerModal';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import * as Y from 'yjs';
import { aiApi } from '../../api/ai';
import { lspApi, type DiagnosticItem } from '../../api/lsp';
import { formatCode } from '../../utils/formatter';
import { toast } from '../shared/Toast';
import { loadExecSettings } from '../../pages/SettingsPage';
import type { DirectoryNode } from '../../api/directories';
import { getVSCodeFileIcon } from './FileTree';

interface EditorPaneProps {
  value: string;
  onChange: (val: string) => void;
  readOnly?: boolean;
  isSharedModeActive?: boolean;
  onBranchPrompt?: () => void;
  onJoinSharedRoom?: () => void;
  peers?: Array<{ id: string; name: string; color: string }>;
  cursors?: RemoteCursor[];
  onCursorChange?: (line: number, column: number) => void;
  runTrigger?: number;
  onRunStateChange?: (running: boolean) => void;
  onCommitRequest?: () => void;
  projectId?: string;
  projectName?: string;
  branchId?: string;
  fileId?: string;
  tree?: DirectoryNode[];
  getDoc?: () => any;
  decrypt?: (cipherText: string) => string;
  onSave?: () => void;
  isSaving?: boolean;
}

function getXtermTheme(isDark: boolean) {
  if (isDark) {
    return {
      background: '#0c0d10',
      foreground: '#e0e6ed',
      cursor: '#01EFAC',
      cursorAccent: '#0c0d10',
      selectionBackground: 'rgba(33, 105, 218, 0.4)',
      black: '#151518',
      red: '#ef4444',
      green: '#10b981',
      yellow: '#f59e0b',
      blue: '#3b82f6',
      magenta: '#c084fc',
      cyan: '#06b6d4',
      white: '#f8fafc',
      brightBlack: '#64748b',
      brightRed: '#f87171',
      brightGreen: '#34d399',
      brightYellow: '#fbbf24',
      brightBlue: '#60a5fa',
      brightMagenta: '#e879f9',
      brightCyan: '#22d3ee',
      brightWhite: '#ffffff',
    };
  }
  return {
    background: '#ffffff',
    foreground: '#0f172a',
    cursor: '#2563eb',
    cursorAccent: '#ffffff',
    selectionBackground: 'rgba(37, 99, 235, 0.25)',
    black: '#0f172a',
    red: '#dc2626',
    green: '#16a34a',
    yellow: '#d97706',
    blue: '#2563eb',
    magenta: '#9333ea',
    cyan: '#0284c7',
    white: '#334155', // High-contrast readable slate in light mode (replaces invisible #ffffff)
    brightBlack: '#64748b',
    brightRed: '#ef4444',
    brightGreen: '#22c55e',
    brightYellow: '#b45309',
    brightBlue: '#1d4ed8',
    brightMagenta: '#7c3aed',
    brightCyan: '#0369a1',
    brightWhite: '#0f172a',
  };
}

export function EditorPane({ value, onChange, readOnly, isSharedModeActive, onBranchPrompt, onJoinSharedRoom, peers = [], cursors = [], onCursorChange, runTrigger = 0, onRunStateChange, onCommitRequest, projectId, projectName, branchId, fileId, tree = [], getDoc, decrypt, onSave, isSaving }: EditorPaneProps) {
  const { openFile, openTabs, language, isDirty, setDirty, setOpenFile, closeTab } = useEditorStore();
  const { theme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const isRemoteApplyingRef = useRef(false);

  // Observe Y.Text for remote changes and apply them directly to Monaco without cursor jumps or React re-renders
  useEffect(() => {
    const yDoc = getDoc ? getDoc() : null;
    if (!yDoc) return;
    const yText = yDoc.getText('content');

    const observer = (event: Y.YTextEvent) => {
      // Ignore our own local keystrokes originating from Monaco
      if (event.transaction.origin === 'local-monaco') return;

      const editor = editorRef.current;
      if (!editor) return;
      const model = editor.getModel();
      if (!model) return;

      const newContent = yText.toString();
      if (model.getValue() === newContent) return;

      isRemoteApplyingRef.current = true;
      try {
        editor.executeEdits('yjs-remote', [
          {
            range: model.getFullModelRange(),
            text: newContent,
            forceMoveMarkers: true,
          },
        ]);
      } finally {
        isRemoteApplyingRef.current = false;
      }
    };

    yText.observe(observer);
    return () => {
      yText.unobserve(observer);
    };
  }, [getDoc, fileId]);

  // Terminal State
  const [showTerminal, setShowTerminal] = useState(true);
  const [terminalTab, setTerminalTab] = useState<'terminal' | 'problems' | 'output'>('terminal');
  const [terminalHeight, setTerminalHeight] = useState(250);
  const isDraggingRef = useRef(false);

  const [terminalTabs, setTerminalTabs] = useState<{ id: string; name: string }[]>([
    { id: '1', name: 'Terminal 1' },
  ]);
  const [activeTermId, setActiveTermId] = useState('1');

  const terminalSessionsRef = useRef<Map<string, {
    id: string;
    term: Terminal;
    fitAddon: FitAddon;
    ws: WebSocket | null;
  }>>(new Map());
  const terminalContainersRef = useRef<Map<string, HTMLDivElement>>(new Map());

  const monacoRef = useRef<typeof Monaco | null>(null);
  const [lspDiagnostics, setLspDiagnostics] = useState<DiagnosticItem[]>([]);

  const [showHistory, setShowHistory] = useState(false);
  const [showCopilot, setShowCopilot] = useState(false);
  const [copilotPrompt, setCopilotPrompt] = useState('');
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [showAiBadge, setShowAiBadge] = useState(false);
  const aiDecorationsRef = useRef<string[]>([]);

  const handleFormat = useCallback(() => {
    if (!editorRef.current || readOnly) return;
    const currentCode = editorRef.current.getValue();
    const formatted = formatCode(currentCode, language);
    if (formatted !== currentCode) {
      editorRef.current.setValue(formatted);
      onChange(formatted);
      setDirty(true);
      toast('✓ Formatted document with Prettier engine', 'success');
    } else {
      toast('Document is already formatted', 'info');
    }
  }, [language, onChange, readOnly]);

  // Real-time LSP diagnostics synchronization
  useEffect(() => {
    if (!value || !language || !editorRef.current) return;
    const timer = setTimeout(async () => {
      try {
        const res = await lspApi.analyze(value, language, openFile?.name);
        setLspDiagnostics(res.diagnostics);
        const errors = res.diagnostics.filter(d => d.severity === 'error').length;
        const warnings = res.diagnostics.filter(d => d.severity === 'warning').length;
        useEditorStore.getState().setDiagnosticCounts({ errors, warnings });
        if (monacoRef.current && editorRef.current?.getModel()) {
          const model = editorRef.current.getModel()!;
          const markers: Monaco.editor.IMarkerData[] = res.diagnostics.map((d) => ({
            startLineNumber: d.line,
            startColumn: d.column,
            endLineNumber: d.end_line,
            endColumn: d.end_column,
            message: d.message,
            severity: d.severity === 'error' ? monacoRef.current!.MarkerSeverity.Error : monacoRef.current!.MarkerSeverity.Warning,
          }));
          monacoRef.current.editor.setModelMarkers(model, 'nulltor-lsp', markers);
        }
      } catch {}
    }, 600);
    return () => clearTimeout(timer);
  }, [value, language, openFile?.name]);

  // Function to highlight lines modified by AI with a fading shimmer
  const highlightAiChanges = useCallback((startLine = 1, endLine = 100) => {
    if (!editorRef.current) return;
    const editor = editorRef.current;

    const decorations: Monaco.editor.IModelDeltaDecoration[] = [];
    for (let l = Math.max(1, startLine); l <= endLine; l++) {
      decorations.push({
        range: {
          startLineNumber: l,
          startColumn: 1,
          endLineNumber: l,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: 'ai-inserted-line-glow',
          linesDecorationsClassName: 'ai-inserted-gutter',
        },
      });
    }

    aiDecorationsRef.current = editor.deltaDecorations(aiDecorationsRef.current, decorations);
    setShowAiBadge(true);

    setTimeout(() => {
      if (editorRef.current) {
        aiDecorationsRef.current = editorRef.current.deltaDecorations(aiDecorationsRef.current, []);
      }
      setShowAiBadge(false);
    }, 3200);
  }, []);

  // Handle Cmd+K / Ctrl+K keyboard shortcut for AI Copilot and Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCopilot((prev) => !prev);
      }
      if (e.key === 'Escape' || e.key === 'Esc') {
        setShowCopilot(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  async function handleCopilotGenerate() {
    if (!copilotPrompt.trim() || !openFile) return;
    setCopilotLoading(true);
    try {
      const res = await aiApi.generate({
        prompt: copilotPrompt.trim(),
        file_name: openFile.name,
        file_content: value,
        language: language,
        action: 'generate',
      });

      if (res.code) {
        const yDoc = getDoc ? getDoc() : null;
        if (yDoc) {
          // Always write to Yjs regardless of current length — this persists
          // the snapshot so code survives a hard refresh.
          let yText = yDoc.getText('content');
          if (!yText || yText.length === 0) yText = yDoc.getText('monaco');
          yDoc.transact(() => {
            if (yText.length > 0) yText.delete(0, yText.length);
            yText.insert(0, res.code);
          }, 'local');
        }
        onChange(res.code);
        toast(`✦ AI generated code applied to ${openFile.name}`, 'success');
        setShowCopilot(false);
        setCopilotPrompt('');

        const lineCount = res.code.split('\n').length;
        highlightAiChanges(1, Math.min(lineCount, 500));
      }
    } catch (e: any) {
      toast(e.message || 'AI generation failed', 'error');
    } finally {
      setCopilotLoading(false);
    }
  }

  const startResize = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true;
    const startY = e.clientY;
    const startHeight = terminalHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaY = startY - moveEvent.clientY;
      const newHeight = Math.max(100, Math.min(window.innerHeight * 0.8, startHeight + deltaY));
      setTerminalHeight(newHeight);
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [terminalHeight]);

  // Tab Session Initializer
  const initTabSession = useCallback((tabId: string, container: HTMLDivElement, isShell = false) => {
    if (terminalSessionsRef.current.has(tabId)) {
      const existing = terminalSessionsRef.current.get(tabId)!;
      try {
        existing.fitAddon.fit();
      } catch {}
      return existing;
    }

    const isDark = theme === 'dark';
    const term = new Terminal({
      theme: getXtermTheme(isDark),
      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
      fontSize: 13,
      cursorStyle: 'block',
      cursorBlink: true,
      convertEol: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);

    const doFit = () => {
      try {
        fitAddon.fit();
        term.refresh(0, Math.max(0, term.rows - 1));
      } catch {}
    };
    requestAnimationFrame(doFit);
    setTimeout(doFit, 60);

    // Handle Copy/Paste via keyboard shortcuts
    term.attachCustomKeyEventHandler((e) => {
      if (e.type === 'keydown') {
        if (e.ctrlKey && e.code === 'KeyC' && term.hasSelection()) {
          navigator.clipboard.writeText(term.getSelection());
          term.clearSelection();
          return false;
        }
        if (e.ctrlKey && e.code === 'KeyV') {
          navigator.clipboard.readText().then((text) => {
            const s = terminalSessionsRef.current.get(tabId);
            if (s?.ws && s.ws.readyState === WebSocket.OPEN) {
              s.ws.send(text);
            }
          }).catch(() => {});
          return false;
        }
      }
      return true;
    });

    let ws: WebSocket | null = null;

    if (isShell) {
      const token = localStorage.getItem('nulltor_token') || '';
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/terminal?token=${encodeURIComponent(token)}${projectId ? `&project_id=${projectId}` : ''}`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        const safeCols = Math.max(40, term.cols || 80);
        const safeRows = Math.max(10, term.rows || 24);
        ws!.send(JSON.stringify({
          token,
          mode: 'shell',
          cols: safeCols,
          rows: safeRows,
          timeout_seconds: 3600,
        }));
      };

      ws.onmessage = (e) => {
        term.write(e.data);
        try {
          fitAddon.fit();
          term.refresh(0, Math.max(0, term.rows - 1));
        } catch {}
      };

      ws.onerror = () => {
        term.writeln('\r\n\x1b[31m[WebSocket Error] Shell connection failed.\x1b[0m\r\n');
      };

      ws.onclose = () => {
        term.writeln('\r\n\x1b[33m[Shell process exited]\x1b[0m\r\n');
      };

      term.onData((data) => {
        const s = terminalSessionsRef.current.get(tabId);
        if (s?.ws && s.ws.readyState === WebSocket.OPEN) {
          s.ws.send(data);
        }
      });
    } else {
      term.writeln('\x1b[36mReady. Press "Run" to execute code or "+" for an interactive shell.\x1b[0m');
      term.onData((data) => {
        const s = terminalSessionsRef.current.get(tabId);
        if (s?.ws && s.ws.readyState === WebSocket.OPEN) {
          s.ws.send(data);
        }
      });
    }

    const session = { id: tabId, term, fitAddon, ws };
    terminalSessionsRef.current.set(tabId, session);
    return session;
  }, [theme, projectId]);

  // Synchronize xterm theme across all sessions
  useEffect(() => {
    const isDark = theme === 'dark';
    for (const session of terminalSessionsRef.current.values()) {
      session.term.options.theme = getXtermTheme(isDark);
      try {
        session.fitAddon.fit();
        session.term.refresh(0, Math.max(0, session.term.rows - 1));
      } catch {}
    }
  }, [theme]);

  // Handle Resize fitting across sessions
  useEffect(() => {
    for (const [id, session] of terminalSessionsRef.current.entries()) {
      try {
        session.fitAddon.fit();
        session.term.refresh(0, Math.max(0, session.term.rows - 1));
        if (session.ws && session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(JSON.stringify({ type: 'resize', cols: session.term.cols, rows: session.term.rows }));
        }
      } catch {}
    }
  }, [terminalHeight, showTerminal, activeTermId]);

  // Focus and fit active tab session when switching tabs
  useEffect(() => {
    if (showTerminal && terminalTab === 'terminal') {
      const session = terminalSessionsRef.current.get(activeTermId);
      if (session) {
        setTimeout(() => {
          try {
            session.fitAddon.fit();
            session.term.focus();
          } catch {}
        }, 30);
      }
    }
  }, [activeTermId, showTerminal, terminalTab]);

  // Run Trigger
  useEffect(() => {
    if (runTrigger > 0) {
      setShowTerminal(true);
      setTerminalTab('terminal');
      handleRun();
    }
    // eslint-disable-next-line
  }, [runTrigger]);

  function handleRun() {
    setShowTerminal(true);
    setTerminalTab('terminal');

    // Give React 50ms to mount and layout the terminal container if it was hidden
    setTimeout(() => {
      let targetTabId = activeTermId;
      let session = terminalSessionsRef.current.get(targetTabId);
      if (!session) {
        targetTabId = '1';
        setActiveTermId('1');
        const container = terminalContainersRef.current.get('1');
        if (container) {
          session = initTabSession('1', container, false);
        }
      }

      if (!session) return;
      const term = session.term;

      if (session.ws) {
        try {
          session.ws.onclose = null;
          session.ws.onerror = null;
          session.ws.close();
        } catch {}
        session.ws = null;
      }

      // Reset the terminal and ensure theme & layout coordinate system match perfectly
      term.reset();
      term.options.theme = getXtermTheme(theme === 'dark');
      try {
        session.fitAddon.fit();
        term.refresh(0, Math.max(0, term.rows - 1));
        term.focus();
      } catch {}
      onRunStateChange?.(true);

      const fileName = openFile?.name || 'script.py';

      const activeCode = editorRef.current?.getValue() || value || '';
      const activeLang = openFile?.name?.endsWith('.py')
        ? 'python'
        : openFile?.name?.endsWith('.js')
        ? 'javascript'
        : openFile?.name?.endsWith('.ts')
        ? 'typescript'
        : (language || 'python');

      // Connect to WebSocket using same host but ws protocol with authenticated JWT
      const token = localStorage.getItem('nulltor_token') || '';
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/terminal?token=${encodeURIComponent(token)}${projectId ? `&project_id=${projectId}` : ''}`;
      const ws = new WebSocket(wsUrl);
      session.ws = ws;

      const safetyTimer = setTimeout(() => {
        onRunStateChange?.(false);
      }, 8000);

      ws.onopen = () => {
        const execSettings = loadExecSettings();
        const safeCols = Math.max(40, term.cols || 80);
        const safeRows = Math.max(10, term.rows || 24);

        ws.send(JSON.stringify({
          token,
          mode: 'exec',
          code: activeCode,
          language: activeLang,
          cols: safeCols,
          rows: safeRows,
          use_docker: execSettings.dockerSandbox,
          timeout_seconds: execSettings.timeoutSeconds,
          filename: fileName,
        }));
      };

      ws.onmessage = (e) => {
        term.write(e.data);
        try {
          session.fitAddon.fit();
          term.refresh(0, Math.max(0, term.rows - 1));
        } catch {}
        onRunStateChange?.(false);
        clearTimeout(safetyTimer);
      };

      ws.onerror = () => {
        term.writeln('\r\n\x1b[31m[Error] WebSocket terminal connection failed.\x1b[0m\r\n');
        onRunStateChange?.(false);
        clearTimeout(safetyTimer);
      };

      ws.onclose = () => {
        onRunStateChange?.(false);
        clearTimeout(safetyTimer);
      };
    }, 50);
  }

  // Live cursor position state for showing user name badge
  const [cursorPos, setCursorPos] = useState<{ line: number; column: number }>({ line: 1, column: 1 });

  const decorationsRef = useRef<string[]>([]);

  function handleMount(editor: Monaco.editor.IStandaloneCodeEditor, monacoInstance: typeof Monaco) {
    monacoRef.current = monacoInstance;
    editorRef.current = editor;
    editor.focus();

    // Register Format Document Shortcut (Shift+Alt+F)
    editor.addCommand(monacoInstance.KeyMod.Shift | monacoInstance.KeyMod.Alt | monacoInstance.KeyCode.KeyF, () => {
      handleFormat();
    });

    // Define sleek custom developer dark theme with Sapphire Blue primary
    monacoInstance.editor.defineTheme('nulltor-dark-pro', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
        { token: 'keyword', foreground: '60a5fa', fontStyle: 'bold' },
        { token: 'string', foreground: '93c5fd' },
        { token: 'number', foreground: 'f59e0b' },
        { token: 'type', foreground: 'a5b4fc' },
        { token: 'function', foreground: '38bdf8' },
        { token: 'variable', foreground: 'f8fafc' },
      ],
      colors: {
        'editor.background': '#1a1a1a',
        'editor.foreground': '#f8fafc',
        'editorCursor.foreground': '#3b82f6',
        'editor.lineHighlightBackground': '#242424',
        'editorLineNumber.foreground': '#334155',
        'editorLineNumber.activeForeground': '#3b82f6',
        'editor.selectionBackground': '#1e3a8a',
        'editor.inactiveSelectionBackground': '#172554',
        'editorIndentGuide.background': '#151b2a',
        'editorIndentGuide.activeBackground': '#2a3650',
      },
    });

    if (theme === 'dark') {
      monacoInstance.editor.setTheme('nulltor-dark-pro');
    }

    // Listen to cursor position changes to broadcast + show user badge
    editor.onDidChangeCursorPosition((e) => {
      const { lineNumber, column } = e.position;
      setCursorPos({ line: lineNumber, column });
      useEditorStore.getState().setCursorPos({ line: lineNumber, column });
      onCursorChange?.(lineNumber, column);
    });

    // Register Save command (Ctrl+S / Cmd+S)
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
      onSave?.();
    });

    // ── Inline AI Autocomplete (ghost-text, Copilot-style) ────────────────
    // Only activates when a Groq/OpenAI API key is stored in localStorage.
    const getStoredApiKey = () =>
      localStorage.getItem('nulltor_ai_api_key') || '';

    let completionDebounce: ReturnType<typeof setTimeout> | null = null;

    const inlineProvider = monacoInstance.languages.registerInlineCompletionsProvider('*', {
      provideInlineCompletions: async (model, position) => {
        const apiKey = getStoredApiKey();
        if (!apiKey) return { items: [] };

        // Cancel any previous debounce
        if (completionDebounce) clearTimeout(completionDebounce);

        // Return a promise that resolves after 650ms debounce
        return new Promise((resolve) => {
          completionDebounce = setTimeout(async () => {
            try {
              const prefix = model.getValueInRange({
                startLineNumber: Math.max(1, position.lineNumber - 50),
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              });
              const suffix = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: Math.min(model.getLineCount(), position.lineNumber + 5),
                endColumn: model.getLineMaxColumn(Math.min(model.getLineCount(), position.lineNumber + 5)),
              });

              const lang = model.getLanguageId();
              const result = await aiApi.complete({
                prefix,
                suffix,
                language: lang,
                api_key: apiKey,
              });

              if (result.suggestion && result.suggestion.trim()) {
                resolve({
                  items: [{
                    insertText: result.suggestion,
                    range: {
                      startLineNumber: position.lineNumber,
                      startColumn: position.column,
                      endLineNumber: position.lineNumber,
                      endColumn: position.column,
                    },
                  }],
                  enableForwardStability: true,
                });
              } else {
                resolve({ items: [] });
              }
            } catch {
              resolve({ items: [] });
            }
          }, 650);
        });
      },
      // Required by this Monaco version — called to release individual completion items
      disposeInlineCompletions: () => { /* no-op */ },
    });

    // ── Incremental Monaco -> Yjs delta synchronization ────────────────
    const contentDisposable = editor.onDidChangeModelContent((event) => {
      if (isRemoteApplyingRef.current || readOnly) return;
      const yDoc = getDoc ? getDoc() : null;
      if (!yDoc) return;
      const yText = yDoc.getText('content');

      yDoc.transact(() => {
        for (const change of event.changes) {
          if (change.rangeLength > 0) {
            yText.delete(change.rangeOffset, change.rangeLength);
          }
          if (change.text.length > 0) {
            yText.insert(change.rangeOffset, change.text);
          }
        }
      }, 'local-monaco');

      setDirty(true);
    });

    // Store disposable on the editor model for cleanup
    editor.onDidDispose(() => {
      inlineProvider.dispose();
      contentDisposable.dispose();
      if (completionDebounce) clearTimeout(completionDebounce);
    });
  }

  function handleChange(val: string | undefined) {
    if (readOnly) return;
    onChange(val ?? '');
    setDirty(true);
  }

  if (!openFile) {
    return (
      <div className="editor-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
        <div className="empty-icon" style={{ fontSize: '48px', marginBottom: '12px', background: 'linear-gradient(135deg, var(--aurora-mint), var(--aurora-purple))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          ◈
        </div>
        <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>No Active File</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Select or create a file from the explorer to begin real-time editing.</p>
      </div>
    );
  }

  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'vs';
  const currentUserDisplayName = user?.username || 'Architect';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* File Tabs Bar — Multi-Tab */}
      <div className="editor-tab-bar" style={{ height: '36px', background: 'var(--bg-1)', display: 'flex', alignItems: 'center', padding: '0', justifyContent: 'space-between', overflow: 'hidden' }}>
        <div style={{ display: 'flex', height: '100%', overflowX: 'auto', flex: 1 }}>
          {openTabs.map((tab) => {
            const isActive = tab.id === openFile.id;
            const isTabDirty = isActive && isDirty;
            const tabIcon = getVSCodeFileIcon(tab.name, false, false, 13);
            return (
              <div
                key={tab.id}
                className={`editor-tab${isActive ? ' active' : ''}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '0 10px 0 12px', whiteSpace: 'nowrap', cursor: 'pointer',
                  background: isActive ? 'var(--bg-0)' : 'transparent',
                  borderTop: isActive ? '2px solid #3b82f6' : '2px solid transparent',
                  fontSize: '12.5px', fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  borderRight: '1px solid var(--border)', height: '100%',
                  flexShrink: 0,
                }}
                onClick={() => {
                  if (isDirty && tab.id !== openFile.id) {
                    onSave?.();
                  }
                  setOpenFile(tab);
                }}
              >
                {tabIcon}
                <span>{tab.name}</span>
                {isTabDirty && (
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#38bdf8',
                      boxShadow: '0 0 6px #38bdf8',
                      display: 'inline-block',
                      marginLeft: '2px',
                    }}
                    title="Unsaved changes (Ctrl+S)"
                  />
                )}
                <span
                  style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: 4, opacity: 0.7, lineHeight: 1 }}
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  title={`Close ${tab.name}`}
                >
                  ×
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '12px' }}>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => setShowCopilot(!showCopilot)}
            style={{
              fontSize: '11px',
              padding: '2px 10px',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              borderRadius: '4px',
            }}
            title="Agent Prompt Bar (Ctrl+K)"
          >
            <Bot size={13} /> Agent
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleFormat}
            disabled={readOnly}
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              color: 'var(--text-secondary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="Format Document with Prettier (Shift+Alt+F)"
          >
            <Sparkles size={11} style={{ color: '#f59e0b' }} />
            <span>Format</span>
          </button>
          {onSave && !readOnly && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={onSave}
              disabled={isSaving}
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                color: isSaving ? '#38bdf8' : 'var(--text-secondary)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Save File (Ctrl+S)"
            >
              {isSaving ? <RefreshCw size={11} className="spin" /> : <Save size={11} />}
              <span>{isSaving ? 'Saving...' : 'Save'}</span>
            </button>
          )}
          {onCommitRequest && !readOnly && (
            <button
              className="btn btn-primary btn-sm"
              onClick={onCommitRequest}
              style={{ fontSize: '11px', padding: '2px 8px', background: 'var(--aurora-purple)', borderColor: 'var(--aurora-purple)', color: '#fff' }}
              title="Save Revision / Commit"
            >
              Commit
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowHistory(!showHistory)}
            style={{ fontSize: '11px', padding: '2px 8px', color: 'var(--text-secondary)' }}
            title="View File History"
          >
            <History size={12} style={{ marginRight: 4 }} /> History
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowTerminal(!showTerminal)}
            style={{ fontSize: '11px', padding: '2px 8px' }}
          >
            {showTerminal ? '▼ Hide Terminal' : '▲ Open Terminal'}
          </button>
        </div>
      </div>

      {/* Sub-Header: Encrypted Scope Badge (Left) <--> Breadcrumbs (Right) */}
      <div style={{
        height: '32px',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '12px',
        background: 'var(--bg-1)',
        borderBottom: '1px solid var(--border)',
      }}>
        {/* Left: Compact E2EE / Shared Status Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 600 }}>
          <span style={{ fontSize: '12px' }}>🔒</span>
          <span style={{ color: 'var(--text-secondary)' }}>
            {isSharedModeActive ? 'Shared main branch' : 'main'} · <strong style={{ color: '#10b981', fontWeight: 600 }}>encrypted</strong>
          </span>
        </div>

        {/* Right: Real Dynamic Workspace Breadcrumbs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-muted)', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {projectName && (
            <>
              <span style={{ color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <Folder size={11} /> {projectName}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>/</span>
            </>
          )}
          {(() => {
            // Traverse tree to get true path
            const findPath = (nodes: DirectoryNode[], cur: string[]): string[] | null => {
              for (const n of nodes) {
                if (n.id === openFile.id) return [...cur, n.name];
                if (n.children && n.children.length > 0) {
                  const found = findPath(n.children, [...cur, n.name]);
                  if (found) return found;
                }
              }
              return null;
            };
            const pathSegments = (tree && tree.length > 0 ? findPath(tree, []) : null) || [openFile.name];

            return pathSegments.map((segment, idx) => {
              const isLast = idx === pathSegments.length - 1;
              return (
                <React.Fragment key={idx}>
                  {idx > 0 && <span style={{ color: 'var(--text-muted)' }}>/</span>}
                  <span style={{ color: isLast ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: isLast ? 600 : 400 }}>
                    {segment}
                  </span>
                </React.Fragment>
              );
            });
          })()}
        </div>
      </div>

      {/* Floating Inline AI Copilot Prompt Bar (Ctrl+K) */}
      {showCopilot && (
        <div style={{
          position: 'absolute',
          top: '44px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '580px',
          maxWidth: '92%',
          zIndex: 100,
          background: 'var(--bg-1)',
          border: '1px solid var(--sapphire-light)',
          borderRadius: '12px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 25px rgba(37, 99, 235, 0.25)',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          animation: 'modalEnter 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          backdropFilter: 'blur(16px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--sapphire-light)' }}>
              <Bot size={15} /> Agent Spotlight
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Target: <strong style={{ color: 'var(--text-primary)' }}>{openFile.name}</strong> • Press <code onClick={() => setShowCopilot(false)} style={{ background: 'var(--bg-3)', padding: '1px 5px', borderRadius: '3px', cursor: 'pointer' }} title="Click or press Esc to close">Esc</code> to close
              </span>
              <button
                type="button"
                onClick={() => setShowCopilot(false)}
                style={{
                  width: '20px',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  padding: 0,
                }}
                title="Close Spotlight (Esc)"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="e.g. Write a function to calculate checksums, add unit tests, or refactor..."
              value={copilotPrompt}
              onChange={(e) => setCopilotPrompt(e.target.value)}
              disabled={copilotLoading}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCopilotGenerate();
                if (e.key === 'Escape' || e.key === 'Esc') {
                  e.stopPropagation();
                  setShowCopilot(false);
                }
              }}
              style={{
                flex: 1,
                padding: '9px 12px',
                fontSize: '13px',
                background: 'var(--bg-0)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={copilotLoading || !copilotPrompt.trim()}
              onClick={handleCopilotGenerate}
              style={{ padding: '0 18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {copilotLoading ? <RefreshCw size={13} className="spin" /> : <Bot size={14} />}
              {copilotLoading ? 'Generating…' : 'Generate'}
            </button>
          </div>

          {/* Quick AI Suggestion Chips */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
            {[
              { label: '⚡ Refactor for Speed', prompt: 'Refactor this code for optimal performance and cleaner structure.' },
              { label: '🧪 Add Unit Tests', prompt: 'Write comprehensive unit tests with edge cases for this file.' },
              { label: '🐛 Fix Bugs & Security', prompt: 'Analyze this code for bugs, race conditions, and security vulnerabilities, then fix them.' },
              { label: '📝 Add Docstrings', prompt: 'Add detailed documentation, comments, and type hints to all functions.' },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                className="btn btn-xs"
                onClick={() => {
                  setCopilotPrompt(chip.prompt);
                }}
                style={{
                  fontSize: '11px',
                  padding: '3px 8px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  borderRadius: '12px',
                  transition: 'all 0.15s ease',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--sapphire-light)';
                  e.currentTarget.style.color = 'var(--sapphire-light)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {copilotLoading && (
            <div style={{ fontSize: '11px', color: 'var(--sapphire-light)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <RefreshCw size={12} className="spin" /> Streaming response from Groq Llama-3.3-70B model…
            </div>
          )}
        </div>
      )}

      {readOnly && (
        <div style={{ padding: '8px 16px', background: 'var(--branch-sub-bg)', color: 'var(--branch-sub-text)', borderBottom: '1px solid var(--branch-sub-border)', fontSize: '12.5px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span><strong>Read-only mode.</strong> You are viewing the canonical main branch.</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {onJoinSharedRoom && (
              <button className="btn btn-sm btn-ghost" style={{ border: '1px solid var(--border)', padding: '4px 10px' }} onClick={onJoinSharedRoom}>
                Join Shared Room
              </button>
            )}
            <button className="btn btn-sm btn-primary" style={{ padding: '4px 10px' }} onClick={onBranchPrompt}>
              Join Subroom or Create Fork
            </button>
          </div>
        </div>
      )}

      {/* Editor Main Canvas */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {showAiBadge && (
            <div className="ai-floating-badge">
              <Bot size={14} />
              <span>✦ AI Generated Changes Applied</span>
            </div>
          )}

          <Editor
            height="100%"
            language={language}
            value={value}
            onChange={handleChange}
            onMount={handleMount}
            theme={theme === 'dark' ? 'nulltor-dark-pro' : 'vs'}
            options={{
              readOnly,
              fontSize: 13.5,
              fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
              fontLigatures: true,
              minimap: { enabled: true, renderCharacters: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
              renderWhitespace: 'selection',
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              renderLineHighlight: 'all',
              renderLineHighlightOnlyWhenFocus: true,
              roundedSelection: true,
              bracketPairColorization: { enabled: true },
              padding: { top: 10, bottom: 10 },
            }}
          />
          {/* Remote cursor line indicators overlay (using CSS absolute positioning via Monaco decorations) */}
          <RemoteCursorOverlay cursors={cursors} editor={editorRef.current} />
        </div>
      </div>

      {/* IDE Bottom Terminal Panel */}
      {showTerminal && (
        <div className="ide-terminal-panel" style={{ height: `${terminalHeight}px`, flexShrink: 0 }}>
          {/* Resize Handle */}
          <div
            onMouseDown={startResize}
            style={{
              height: '4px',
              width: '100%',
              background: 'transparent',
              cursor: 'row-resize',
              position: 'absolute',
              top: '-2px',
              zIndex: 10,
            }}
          />
          <div className="ide-terminal-header">
            <div style={{ display: 'flex', gap: '16px', paddingLeft: '8px', alignItems: 'center' }}>
              <button
                style={{
                  background: 'none', border: 'none', outline: 'none',
                  color: terminalTab === 'terminal' ? 'var(--text-primary)' : 'var(--text-muted)',
                  borderBottom: terminalTab === 'terminal' ? '2px solid var(--aurora-cyan)' : '2px solid transparent',
                  padding: '8px 4px', fontSize: '11px', fontWeight: terminalTab === 'terminal' ? 700 : 500,
                  cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em',
                  display: 'flex', alignItems: 'center', gap: '5px',
                }}
                onClick={() => setTerminalTab('terminal')}
              >
                <TermIcon size={12} />
                <span>TERMINAL</span>
              </button>
              <button
                style={{
                  background: 'none', border: 'none', outline: 'none',
                  color: terminalTab === 'problems' ? 'var(--text-primary)' : 'var(--text-muted)',
                  borderBottom: terminalTab === 'problems' ? '2px solid var(--aurora-cyan)' : '2px solid transparent',
                  padding: '8px 4px', fontSize: '11px', fontWeight: terminalTab === 'problems' ? 700 : 500,
                  cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em',
                  display: 'flex', alignItems: 'center', gap: '5px',
                }}
                onClick={() => setTerminalTab('problems')}
              >
                {lspDiagnostics.length > 0 ? (
                  <AlertCircle size={12} style={{ color: '#ef4444' }} />
                ) : (
                  <CheckCircle2 size={12} style={{ color: '#10b981' }} />
                )}
                <span>PROBLEMS ({lspDiagnostics.length})</span>
              </button>
              <button
                style={{
                  background: 'none', border: 'none', outline: 'none',
                  color: terminalTab === 'output' ? 'var(--text-primary)' : 'var(--text-muted)',
                  borderBottom: terminalTab === 'output' ? '2px solid var(--aurora-cyan)' : '2px solid transparent',
                  padding: '8px 4px', fontSize: '11px', fontWeight: terminalTab === 'output' ? 700 : 500,
                  cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em'
                }}
                onClick={() => setTerminalTab('output')}
              >
                OUTPUT
              </button>
            </div>

            {/* Right Controls: Multi-Tab Selector + Clear + Close */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '6px' }}>
              {terminalTab === 'terminal' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {terminalTabs.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setActiveTermId(t.id)}
                      style={{
                        padding: '2px 8px',
                        fontSize: '11px',
                        borderRadius: '4px',
                        background: activeTermId === t.id ? 'var(--bg-2)' : 'transparent',
                        border: `1px solid ${activeTermId === t.id ? 'var(--border)' : 'transparent'}`,
                        color: activeTermId === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontWeight: activeTermId === t.id ? 600 : 400,
                      }}
                    >
                      {t.name}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      const nextNum = terminalTabs.length + 1;
                      const nextId = String(Date.now());
                      setTerminalTabs((prev) => [...prev, { id: nextId, name: `Terminal ${nextNum}` }]);
                      setActiveTermId(nextId);
                    }}
                    style={{
                      padding: '2px 6px',
                      fontSize: '11px',
                      borderRadius: '4px',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title="New Interactive Terminal"
                  >
                    <Plus size={11} />
                  </button>
                  <button
                    onClick={() => {
                      if (terminalTabs.length > 1) {
                        const session = terminalSessionsRef.current.get(activeTermId);
                        if (session) {
                          try {
                            session.ws?.close();
                            session.term.dispose();
                          } catch {}
                          terminalSessionsRef.current.delete(activeTermId);
                        }
                        const remaining = terminalTabs.filter((t) => t.id !== activeTermId);
                        setTerminalTabs(remaining);
                        setActiveTermId(remaining[remaining.length - 1].id);
                      } else {
                        const session = terminalSessionsRef.current.get(activeTermId);
                        session?.term.clear();
                      }
                    }}
                    style={{
                      padding: '2px 6px',
                      fontSize: '11px',
                      borderRadius: '4px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                    title={terminalTabs.length > 1 ? 'Close Active Terminal' : 'Clear Terminal Output'}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              )}
              <button className="btn-icon" style={{ width: '22px', height: '22px' }} onClick={() => setShowTerminal(false)}>
                ×
              </button>
            </div>
          </div>

          <div className="ide-terminal-body" style={{ padding: 0, overflow: 'hidden', height: '100%', background: 'var(--bg-0)', position: 'relative' }}>
            {terminalTabs.map((t) => (
              <div
                key={t.id}
                ref={(el) => {
                  if (el) {
                    terminalContainersRef.current.set(t.id, el);
                    initTabSession(t.id, el, t.id !== '1');
                  } else {
                    terminalContainersRef.current.delete(t.id);
                  }
                }}
                style={{
                  height: '100%',
                  width: '100%',
                  background: 'var(--bg-0)',
                  display: terminalTab === 'terminal' && activeTermId === t.id ? 'block' : 'none',
                }}
              />
            ))}
            {terminalTab === 'problems' && (
              <div style={{ height: '100%', overflowY: 'auto', padding: '8px 12px' }}>
                {lspDiagnostics.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontSize: '12px', padding: '12px 0' }}>
                    <CheckCircle2 size={15} />
                    <span>No syntax or lint issues detected in {openFile.name}.</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {lspDiagnostics.map((d, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          if (editorRef.current) {
                            editorRef.current.revealPositionInCenter({ lineNumber: d.line, column: d.column });
                            editorRef.current.setPosition({ lineNumber: d.line, column: d.column });
                            editorRef.current.focus();
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          background: 'var(--bg-1)',
                          border: '1px solid var(--border)',
                          cursor: 'pointer',
                          fontSize: '12px',
                          transition: 'background 0.15s ease',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-2)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-1)'}
                      >
                        {d.severity === 'error' ? (
                          <AlertCircle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
                        ) : (
                          <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
                        )}
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          Line {d.line}:{d.column}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.message}
                        </span>
                        <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{openFile.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {terminalTab === 'output' && (
              <div style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '12px', fontFamily: 'monospace' }}>
                <div>[Nulltor Language Server] Multi-Language LSP Active.</div>
                <div>[Nulltor Compiler Sandbox] Output & PTY channels ready.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {showHistory && projectId && branchId && openFile && (
        <CommitHistoryPanel
          projectId={projectId}
          branchId={branchId}
          fileId={openFile.id}
          fileName={openFile.name}
          getCurrentSnapshot={() => {
            const doc = getDoc?.();
            if (!doc) return null;
            return uint8ArrayToBase64(Y.encodeStateAsUpdate(doc));
          }}
          decryptSnapshot={(snapshotEncrypted) => {
            return decrypt ? decrypt(snapshotEncrypted) : snapshotEncrypted;
          }}
          onRevert={(snapshotBase64) => {
            const doc = getDoc?.();
            const textToRevert = extractTextFromYjsSnapshot(snapshotBase64);
            if (doc) {
              const ytext = doc.getText('content').length > 0 ? doc.getText('content') : doc.getText('monaco');
              doc.transact(() => {
                ytext.delete(0, ytext.length);
                ytext.insert(0, textToRevert);
              });
            }
            if (editorRef.current) {
              editorRef.current.setValue(textToRevert);
            }
            onChange(textToRevert);
            setDirty(true);
          }}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}

function RemoteCursorOverlay({ cursors, editor }: { cursors: RemoteCursor[]; editor: Monaco.editor.IStandaloneCodeEditor | null }) {
  const decorationsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!editor) return;

    const newDecorations = cursors.map((c) => ({
      range: { startLineNumber: c.line, startColumn: c.column, endLineNumber: c.line, endColumn: c.column },
      options: {
        className: `remote-cursor-${c.socketId.replace(/[^a-zA-Z0-9-]/g, '')}`,
        hoverMessage: { value: c.name },
        beforeContentClassName: `remote-cursor-flag-${c.socketId.replace(/[^a-zA-Z0-9-]/g, '')}`,
        stickiness: 1 // TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
      }
    }));

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);

    let styleEl = document.getElementById('remote-cursors-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'remote-cursors-styles';
      document.head.appendChild(styleEl);
    }

    const css = cursors.map(c => {
      const safeId = c.socketId.replace(/[^a-zA-Z0-9-]/g, '');
      const color = c.color || '#01EFAC';
      return `
      .remote-cursor-${safeId} {
        border-left: 2px solid ${color};
        position: relative;
        z-index: 10;
        margin-left: -1px;
      }
      .remote-cursor-flag-${safeId}::before {
        content: '${c.name.replace(/'/g, "\\'")}';
        position: absolute;
        top: -16px;
        left: -1px;
        background: ${color};
        color: #0b0e15;
        font-size: 9px;
        padding: 0 4px;
        border-radius: 2px 2px 2px 0;
        white-space: nowrap;
        pointer-events: none;
        z-index: 100;
        font-family: sans-serif;
        font-weight: 800;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      }
      `;
    }).join('\n');

    styleEl.innerHTML = css;

  }, [cursors, editor]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (editor && decorationsRef.current.length > 0) {
        editor.deltaDecorations(decorationsRef.current, []);
      }
      const styleEl = document.getElementById('remote-cursors-styles');
      if (styleEl) styleEl.remove();
    };
  }, [editor]);

  return null;
}

