import { useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useEditorStore } from '../../store/editorStore';
import { useTheme } from '../../context/ThemeContext';
import { useAuthStore } from '../../store/authStore';
<<<<<<< Updated upstream
=======
import { Edit2, File, Palette, User, History, Bot, RefreshCw, X, Save, Terminal as TerminalIcon } from 'lucide-react';
import { type RemoteCursor } from '../../hooks/useYjsDoc';
import { CommitHistoryPanel } from './CommitHistoryPanel';
import { extractTextFromYjsSnapshot } from './DiffViewerModal';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import * as Y from 'yjs';
import { aiApi } from '../../api/ai';
import { toast } from '../shared/Toast';
>>>>>>> Stashed changes

interface EditorPaneProps {
  value: string;
  onChange: (val: string) => void;
  readOnly?: boolean;
  onBranchPrompt?: () => void;
  peers?: Array<{ id: string; name: string; color: string }>;
  onExecuteCode?: () => void;
}

export function EditorPane({ value, onChange, readOnly, onBranchPrompt, peers = [] }: EditorPaneProps) {
  const { openFile, language, setDirty } = useEditorStore();
  const { theme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  // Terminal state
  const [showTerminal, setShowTerminal] = useState(true);
  const [terminalTab, setTerminalTab] = useState<'terminal' | 'problems' | 'output'>('terminal');

  // Live cursor position state for showing user name badge
  const [cursorPos, setCursorPos] = useState<{ line: number; column: number }>({ line: 1, column: 1 });

  function handleMount(editor: Monaco.editor.IStandaloneCodeEditor) {
    editorRef.current = editor;
    editor.focus();

<<<<<<< Updated upstream
    // Listen to cursor position changes to position the user name tag badge
=======
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
>>>>>>> Stashed changes
    editor.onDidChangeCursorPosition((e) => {
      setCursorPos({ line: e.position.lineNumber, column: e.position.column });
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

  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'vs';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* File Tabs Bar */}
      <div className="editor-tab-bar" style={{ height: '36px', background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 12px', justifyContent: 'space-between' }}>
        <div className="editor-tab active" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 12px', background: 'var(--bg-0)', borderTop: '2px solid var(--aurora-mint)', borderRadius: '4px 4px 0 0', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
          <span className="font-mono" style={{ fontSize: '11px', color: 'var(--aurora-mint)' }}>
            {openFile.name.endsWith('.ts') || openFile.name.endsWith('.js') ? '⚡ TS' : openFile.name.endsWith('.css') ? '🎨 CSS' : '📄'}
          </span>
          {openFile.name}
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '4px', cursor: 'pointer' }}>×</span>
        </div>

<<<<<<< Updated upstream
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
=======
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
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
      {readOnly && (
        <div style={{ padding: '8px 16px', background: 'var(--branch-sub-bg)', color: 'var(--branch-sub-text)', borderBottom: '1px solid var(--branch-sub-border)', fontSize: '12.5px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span><strong>Read-only mode.</strong> You are viewing the canonical main branch.</span>
          <button className="btn btn-sm btn-primary" onClick={onBranchPrompt}>
            Join Subroom or Create Fork
          </button>
        </div>
      )}

      {/* Editor Main Canvas with Live Remote Cursor User Name Badge */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Floating User Name Cursor Badge displaying current user position */}
        <div
          className="monaco-user-cursor-tag"
          style={{
            top: `${Math.min(Math.max((cursorPos.line - 1) * 19 + 6, 6), 400)}px`,
            left: `${Math.min(cursorPos.column * 8 + 48, 600)}px`,
          }}
        >
          <span className="cursor-name-badge" style={{ background: 'linear-gradient(135deg, var(--aurora-mint), var(--aurora-violet))', color: '#0b0e15' }}>
            ✏️ {currentUserDisplayName} is editing (L:{cursorPos.line}, C:{cursorPos.column})
          </span>
        </div>

        {/* Remote Peers Cursors */}
        {peers.map((peer, i) => (
          <div
            key={peer.id || i}
            className="monaco-user-cursor-tag"
            style={{
              top: `${(i + 2) * 24}px`,
              left: `${180 + i * 40}px`,
            }}
          >
            <span className="cursor-name-badge" style={{ background: peer.color || '#01EFAC', color: '#0b0e15' }}>
              👤 {peer.name} is typing…
            </span>
          </div>
        ))}

        <Editor
          height="100%"
          language={language}
          value={value}
          onChange={handleChange}
          onMount={handleMount}
          theme={monacoTheme}
          options={{
            readOnly,
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontLigatures: true,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            renderWhitespace: 'selection',
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            bracketPairColorization: { enabled: true },
          }}
        />
=======
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
>>>>>>> Stashed changes
      </div>

      {/* IDE Bottom Terminal Panel */}
      {showTerminal && (
        <div className="ide-terminal-panel">
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

          <div className="ide-terminal-body">
            {terminalTab === 'terminal' && (
              <div>
                <div style={{ color: '#01EFAC', marginBottom: '4px' }}>nulltor-dev-server: listening on port 3000</div>
                <div style={{ color: 'var(--text-secondary)', marginBottom: '6px' }}>Compiled successfully in 342ms. Zero-knowledge E2EE active.</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--aurora-mint)' }}>
                  <span>$</span>
                  <span className="font-mono" style={{ color: 'var(--text-primary)' }}>nulltor run --branch {openFile ? openFile.name : 'main'}</span>
                  <span className="status-dot" style={{ background: '#01EFAC', marginLeft: '4px' }} />
                </div>
              </div>
            )}
            {terminalTab === 'problems' && (
              <div style={{ color: 'var(--text-secondary)' }}>No lint errors or syntax issues detected.</div>
            )}
            {terminalTab === 'output' && (
              <div style={{ color: 'var(--text-secondary)' }}>[Nulltor Build Engine] Standalone bundle ready in public_react.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
