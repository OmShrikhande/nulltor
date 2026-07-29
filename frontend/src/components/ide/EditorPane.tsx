import { useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useEditorStore } from '../../store/editorStore';

interface EditorPaneProps {
  value: string;
  onChange: (val: string) => void;
  readOnly?: boolean;
  onBranchPrompt?: () => void;
}

export function EditorPane({ value, onChange, readOnly, onBranchPrompt }: EditorPaneProps) {
  const { openFile, language, setDirty } = useEditorStore();
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  function handleMount(editor: Monaco.editor.IStandaloneCodeEditor) {
    editorRef.current = editor;
    // Focus editor when file opens
    editor.focus();
  }

  function handleChange(val: string | undefined) {
    if (readOnly) return;
    onChange(val ?? '');
    setDirty(true);
  }

  if (!openFile) {
    return (
      <div className="editor-empty">
        <div className="empty-icon">◈</div>
        <h3>No file open</h3>
        <p>Select a file from the explorer to start editing.</p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden' }}>
      <div className="editor-tab-bar">
        <div className="editor-tab active">
          <svg viewBox="0 0 16 16" fill="currentColor" width={13} height={13} style={{ color: 'var(--text-muted)' }}>
            <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Z"/>
          </svg>
          {openFile.name}
        </div>
      </div>
      {readOnly && (
        <div style={{ padding: '8px 16px', background: 'var(--warning)', color: '#000', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span><strong>Read-only mode.</strong> You are viewing the main branch.</span>
          <button className="btn btn-sm" style={{ background: '#000', color: '#fff', border: 'none' }} onClick={onBranchPrompt}>
            Join Subroom or Create Fork
          </button>
        </div>
      )}
      <Editor
        height={readOnly ? "calc(100% - 35px - 44px)" : "calc(100% - 35px)"}
        language={language}
        value={value}
        onChange={handleChange}
        onMount={handleMount}
        theme="vs-dark"
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
  );
}
