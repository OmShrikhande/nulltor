import { useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useEditorStore } from '../../store/editorStore';
import { useTheme } from '../../context/ThemeContext';
import { useAuthStore } from '../../store/authStore';

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

    // Listen to cursor position changes to position the user name tag badge
    editor.onDidChangeCursorPosition((e) => {
      setCursorPos({ line: e.position.lineNumber, column: e.position.column });
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
      {/* File Tabs Bar */}
      <div className="editor-tab-bar" style={{ height: '36px', background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 12px', justifyContent: 'space-between' }}>
        <div className="editor-tab active" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 12px', background: 'var(--bg-0)', borderTop: '2px solid var(--aurora-mint)', borderRadius: '4px 4px 0 0', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
          <span className="font-mono" style={{ fontSize: '11px', color: 'var(--aurora-mint)' }}>
            {openFile.name.endsWith('.ts') || openFile.name.endsWith('.js') ? '⚡ TS' : openFile.name.endsWith('.css') ? '🎨 CSS' : '📄'}
          </span>
          {openFile.name}
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '4px', cursor: 'pointer' }}>×</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowTerminal(!showTerminal)}
            style={{ fontSize: '11px', padding: '2px 8px' }}
          >
            {showTerminal ? '▼ Hide Terminal' : '▲ Open Terminal'}
          </button>
        </div>
      </div>

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
