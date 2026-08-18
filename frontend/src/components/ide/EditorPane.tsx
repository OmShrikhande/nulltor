import { useRef, useState, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useEditorStore } from '../../store/editorStore';
import { useTheme } from '../../context/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { Edit2, File, Palette, History, Bot, RefreshCw, X, Save, Terminal as TerminalIcon } from 'lucide-react';
import { type RemoteCursor } from '../../hooks/useYjsDoc';
import { CommitHistoryPanel } from './CommitHistoryPanel';
import { extractTextFromYjsSnapshot } from './DiffViewerModal';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import * as Y from 'yjs';
import { aiApi } from '../../api/ai';
import { toast } from '../shared/Toast';

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
  branchId?: string;
  fileId?: string;
  getDoc?: () => any;
  decrypt?: (cipherText: string) => string;
}

export function EditorPane({ value, onChange, readOnly, isSharedModeActive, onBranchPrompt, onJoinSharedRoom, cursors = [], onCursorChange, runTrigger = 0, onRunStateChange, onCommitRequest, projectId, branchId, getDoc, decrypt }: EditorPaneProps) {
  const { openFile, openTabs, language, setDirty, setOpenFile, closeTab } = useEditorStore();
  const { theme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);


  // Terminal State
  const [showTerminal, setShowTerminal] = useState(true);
  const [terminalTab, setTerminalTab] = useState<'terminal' | 'problems' | 'output'>('terminal');
  const [terminalHeight, setTerminalHeight] = useState(250);
  const isDraggingRef = useRef(false);

  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [showCopilot, setShowCopilot] = useState(false);
  const [copilotPrompt, setCopilotPrompt] = useState('');
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [, setShowAiBadge] = useState(false);
  const aiDecorationsRef = useRef<string[]>([]);

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
          const yText = yDoc.getText('monaco') || yDoc.getText('content');
          if (yText && yText.length > 0) {
            yText.delete(0, yText.length);
            yText.insert(0, res.code);
          }
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

  // Mount/Unmount xterm
  useEffect(() => {
    if (showTerminal && terminalTab === 'terminal' && terminalRef.current && !xtermRef.current) {
      const term = new Terminal({
        theme: { background: '#0b0e15', foreground: '#e0e6ed', cursor: '#01EFAC' },
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 13,
        cursorBlink: true,
        convertEol: true,
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current);
      
      // Delay fit to ensure font metrics are loaded
      setTimeout(() => {
        try { fitAddon.fit(); } catch(e) {}
      }, 50);

      term.writeln('\x1b[36mReady. Press "Execute" to run ' + (openFile ? openFile.name : 'code') + '.\x1b[0m');

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      // Handle terminal input
      term.onData(data => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(data);
        }
      });

      // Handle Copy/Paste via keyboard shortcuts
      term.attachCustomKeyEventHandler((e) => {
        if (e.type === 'keydown') {
          // Ctrl+C (Copy if text is selected)
          if (e.ctrlKey && e.code === 'KeyC' && term.hasSelection()) {
            navigator.clipboard.writeText(term.getSelection());
            term.clearSelection();
            return false;
          }
          // Ctrl+V (Paste)
          if (e.ctrlKey && e.code === 'KeyV') {
            navigator.clipboard.readText().then(text => {
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(text);
              }
            }).catch(() => {});
            return false;
          }
        }
        return true;
      });
    }

    return () => {
      // Don't dispose on every render, just keep it mounted or handle carefully
    };
  }, [showTerminal, terminalTab, openFile]);

  // Handle Resize fitting
  useEffect(() => {
    if (fitAddonRef.current && xtermRef.current) {
      fitAddonRef.current.fit();
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'resize', cols: xtermRef.current.cols, rows: xtermRef.current.rows }));
        } catch {}
      }
    }
  }, [terminalHeight, showTerminal]);

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
    if (!xtermRef.current) return;
    const term = xtermRef.current;
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Reset the terminal so winpty's coordinate system (1,1) perfectly matches xterm.js
    term.reset();
    onRunStateChange?.(true);

    const code = editorRef.current?.getValue() || '';
    
    // Connect to WebSocket using same host but ws protocol
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    const safetyTimer = setTimeout(() => {
      onRunStateChange?.(false);
    }, 6000);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        code,
        language,
        cols: term.cols,
        rows: term.rows
      }));
    };

    ws.onmessage = (e) => {
      term.write(e.data);
      onRunStateChange?.(false);
      clearTimeout(safetyTimer);
    };

    ws.onerror = () => {
      term.writeln('\r\n\x1b[31mWebSocket Connection Error\x1b[0m');
      onRunStateChange?.(false);
      clearTimeout(safetyTimer);
    };

    ws.onclose = () => {
      onRunStateChange?.(false);
      clearTimeout(safetyTimer);
    };
  }

  // Live cursor position state for showing user name badge
  const [cursorPos, setCursorPos] = useState<{ line: number; column: number }>({ line: 1, column: 1 });

  function handleMount(editor: Monaco.editor.IStandaloneCodeEditor, monacoInstance: typeof Monaco) {
    editorRef.current = editor;
    editor.focus();

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
        'editor.background': '#121212',
        'editor.foreground': '#f5f5f5',
        'editorCursor.foreground': '#3b82f6',
        'editor.lineHighlightBackground': '#1c1c1c',
        'editor.lineHighlightBorder': '#282828',
        'editorLineNumber.foreground': '#555555',
        'editorLineNumber.activeForeground': '#e5e5e5',
        'editor.selectionBackground': '#2d3748',
        'editor.inactiveSelectionBackground': '#202632',
        'editorIndentGuide.background': '#2d2d2d',
        'editorIndentGuide.activeBackground': '#555555',
        'editorBracketHighlight.foreground1': '#ffd700',
        'editorBracketHighlight.foreground2': '#da70d6',
        'editorBracketHighlight.foreground3': '#87ceeb',
        'editorBracketPairGuide.background1': 'rgba(255, 215, 0, 0.35)',
        'editorBracketPairGuide.background2': 'rgba(218, 112, 214, 0.35)',
        'editorBracketPairGuide.background3': 'rgba(135, 206, 235, 0.35)',
        'editorBracketPairGuide.activeBackground1': '#ffd700',
        'editorBracketPairGuide.activeBackground2': '#da70d6',
        'editorBracketPairGuide.activeBackground3': '#87ceeb',
      },
    });

    // Define sleek custom developer light theme with Blue and White
    monacoInstance.editor.defineTheme('nulltor-light-pro', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
        { token: 'keyword', foreground: '1d4ed8', fontStyle: 'bold' },
        { token: 'string', foreground: '0284c7' },
        { token: 'number', foreground: 'd97706' },
        { token: 'type', foreground: '7c3aed' },
        { token: 'function', foreground: '2563eb' },
        { token: 'variable', foreground: '0f172a' },
      ],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#0f172a',
        'editorCursor.foreground': '#2563eb',
        'editor.lineHighlightBackground': '#f0f6ff',
        'editor.lineHighlightBorder': '#bfdbfe',
        'editorLineNumber.foreground': '#94a3b8',
        'editorLineNumber.activeForeground': '#2563eb',
        'editor.selectionBackground': '#bfdbfe',
        'editor.inactiveSelectionBackground': '#dbeafe',
        'editorIndentGuide.background': '#e2e8f0',
        'editorIndentGuide.activeBackground': '#3b82f6',
      },
    });

    if (theme === 'dark') {
      monacoInstance.editor.setTheme('nulltor-dark-pro');
    } else {
      monacoInstance.editor.setTheme('nulltor-light-pro');
    }

    // Listen to cursor position changes to broadcast + show user badge
    editor.onDidChangeCursorPosition((e) => {
      const { lineNumber, column } = e.position;
      setCursorPos({ line: lineNumber, column });
      onCursorChange?.(lineNumber, column);
    });
  }

  const currentUserDisplayName = user?.username || 'Architect';
  const [typingMessage, setTypingMessage] = useState<string | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerTypingIndicator = useCallback((username: string) => {
    setTypingMessage(`${username} is typing...`);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      setTypingMessage(null);
    }, 2500);
  }, []);

  function handleChange(val: string | undefined) {
    if (readOnly) return;
    onChange(val ?? '');
    setDirty(true);
    triggerTypingIndicator(currentUserDisplayName);
  }

  useEffect(() => {
    if (cursors.length > 0) {
      const activeCursor = cursors[cursors.length - 1];
      if (activeCursor?.name) {
        triggerTypingIndicator(activeCursor.name);
      }
    }
  }, [cursors, triggerTypingIndicator]);

  if (!openFile) {
    return (
      <div className="editor-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
        <div className="empty-icon" style={{ fontSize: '48px', marginBottom: '12px', color: 'var(--accent-secondary)' }}>
          ◈
        </div>
        <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>No Active File</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Select or create a file from the explorer to begin real-time editing.</p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* File Tabs Bar — Multi-Tab */}
      <div className="editor-tab-bar" style={{ height: '36px', background: 'var(--bg-1)', display: 'flex', alignItems: 'center', padding: '0', justifyContent: 'space-between', overflow: 'hidden' }}>
        <div style={{ display: 'flex', height: '100%', overflowX: 'auto', flex: 1 }}>
          {openTabs.map((tab) => {
            const isActive = tab.id === openFile.id;
            const ext = tab.name.split('.').pop()?.toLowerCase() ?? '';
            const tabIcon = ['ts','tsx'].includes(ext) ? <span style={{ color: '#3178c6' }}><File size={13} /></span>
              : ['js','jsx'].includes(ext) ? <span style={{ color: '#f7df1e' }}><File size={13} /></span>
              : ext === 'py' ? <span style={{ color: '#3776AB' }}><File size={13} /></span>
              : ext === 'css' ? <span style={{ color: '#38bdf8' }}><Palette size={13} /></span>
              : <span style={{ color: 'var(--text-muted)' }}><File size={13} /></span>;
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
                onClick={() => setOpenFile(tab)}
              >
                {tabIcon}
                {tab.name}
                <span
                  style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: 2, opacity: 0.7, lineHeight: 1 }}
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  title={`Close ${tab.name}`}
                >
                  ×
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingRight: '12px' }}>
          {typingMessage && (
            <span className="typing-indicator-pill" title="User actively typing">
              <Edit2 size={11} /> {typingMessage}
            </span>
          )}
          <span className="cursor-coords-pill" title="Cursor Position (Line, Column)">
            <span className="coord-label">Ln</span>
            <strong className="coord-number">{cursorPos.line}</strong>,
            <span className="coord-label">Col</span>
            <strong className="coord-number">{cursorPos.column}</strong>
          </span>
          {onCommitRequest && !readOnly && (
            <button
              className="btn btn-primary btn-sm"
              onClick={onCommitRequest}
              style={{ padding: '4px 8px', background: '#2563eb', borderColor: '#1d4ed8', color: '#fff' }}
              title="Save Revision / Commit"
            >
              <Save size={14} />
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowHistory(!showHistory)}
            style={{ padding: '4px 8px', color: 'var(--text-secondary)' }}
            title="View File History"
          >
            <History size={14} />
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowTerminal(!showTerminal)}
            style={{ padding: '4px 8px', color: 'var(--text-secondary)' }}
            title={showTerminal ? 'Hide Terminal' : 'Open Terminal'}
          >
            <TerminalIcon size={14} />
          </button>
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

      {isSharedModeActive && (
        <div className="sharing-mode-ticker">
          <div className="sharing-mode-ticker-content">
            ✦ Sharing Mode Active: You are collaboratively editing the shared main branch.
          </div>
        </div>
      )}

      {/* Editor Main Canvas */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <Editor
            height="100%"
            language={language}
            value={value}
            onChange={handleChange}
            onMount={handleMount}
            theme={theme === 'dark' ? 'nulltor-dark-pro' : 'nulltor-light-pro'}
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
              guides: {
                indentation: true,
                bracketPairs: true,
                bracketPairsHorizontal: true,
                highlightActiveIndentation: true,
                highlightActiveBracketPair: true,
              },
              padding: { top: 10, bottom: 10 },
            }}
          />
          {/* Remote cursor line indicators overlay (using CSS absolute positioning via Monaco decorations) */}
          <RemoteCursorOverlay cursors={cursors} editor={editorRef.current} />

          {/* Floating Typing Indicator in Bottom-Right Corner of Coding Panel */}
          {typingMessage && (
            <div
              className="typing-floating-bottom-right"
              style={{
                position: 'absolute',
                bottom: '16px',
                right: '24px',
                zIndex: 40,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '8px',
                background: 'var(--typing-bg, rgba(234, 88, 12, 0.2))',
                border: '1px solid var(--typing-border, rgba(249, 115, 22, 0.5))',
                color: 'var(--typing-text, #fb923c)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                fontSize: '12px',
                fontWeight: 700,
                backdropFilter: 'blur(8px)',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#ea580c',
                  boxShadow: '0 0 6px #ea580c',
                }}
              />
              <Edit2 size={13} />
              <span>{typingMessage}</span>
            </div>
          )}
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
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className={`btn btn-sm ${terminalTab === 'terminal' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '2px 8px', fontSize: '11px' }}
                onClick={() => setTerminalTab('terminal')}
              >
                TERMINAL
              </button>
              <button
                className={`btn btn-sm ${terminalTab === 'problems' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '2px 8px', fontSize: '11px' }}
                onClick={() => setTerminalTab('problems')}
              >
                PROBLEMS (0)
              </button>
              <button
                className={`btn btn-sm ${terminalTab === 'output' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '2px 8px', fontSize: '11px' }}
                onClick={() => setTerminalTab('output')}
              >
                OUTPUT
              </button>
            </div>

            <button className="btn-icon" style={{ width: '22px', height: '22px' }} onClick={() => setShowTerminal(false)}>
              ×
            </button>
          </div>

          <div className="ide-terminal-body" style={{ padding: 0, overflow: 'hidden', height: '100%' }}>
            <div 
              ref={terminalRef} 
              style={{ 
                height: '100%', 
                width: '100%', 
                display: terminalTab === 'terminal' ? 'block' : 'none',
              }} 
            />
            {terminalTab === 'problems' && (
              <div style={{ padding: '12px', color: 'var(--text-secondary)' }}>No lint errors or syntax issues detected.</div>
            )}
            {terminalTab === 'output' && (
              <div style={{ padding: '12px', color: 'var(--text-secondary)' }}>[Nulltor Build Engine] Standalone bundle ready in public_react.</div>
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
            return btoa(String.fromCharCode.apply(null, Array.from(Y.encodeStateAsUpdate(doc))));
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

