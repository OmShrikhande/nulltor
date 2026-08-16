import { useState, useEffect } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import * as Y from 'yjs';
import { X, Check } from 'lucide-react';

interface DiffViewerModalProps {
  fileName: string;
  originalSnapshotBase64: string | null;
  modifiedSnapshotBase64: string | null;
  title?: string;
  subtitle?: string;
  leftLabel?: string;
  rightLabel?: string;
  onClose: () => void;
  onConfirm?: () => void;
  confirmLoading?: boolean;
  confirmLabel?: string;
}

export function extractTextFromYjsSnapshot(snapshotBase64: string | null): string {
  if (!snapshotBase64) return '';
  try {
    const doc = new Y.Doc();
    const uint8Array = new Uint8Array(atob(snapshotBase64).split('').map(c => c.charCodeAt(0)));
    Y.applyUpdate(doc, uint8Array);
    
    // Try 'content' first, fallback to 'monaco' or any text key
    let result = '';
    if (doc.getText('content').length > 0) result = doc.getText('content').toString();
    else if (doc.getText('monaco').length > 0) result = doc.getText('monaco').toString();
    else {
      for (const key of doc.share.keys()) {
        const type = doc.get(key);
        if (type instanceof Y.Text && type.length > 0) {
          result = type.toString();
          break;
        }
      }
    }
    return result;
  } catch (e) {
    console.error('Failed to extract text from Yjs snapshot', e);
    return '';
  }
}

export function DiffViewerModal({
  fileName,
  originalSnapshotBase64,
  modifiedSnapshotBase64,
  title = "Code Review",
  subtitle = "Current Code (Left) → Target Version (Right)",
  leftLabel = "Current Working Code (Left)",
  rightLabel = "Target Version / Past Commit (Right)",
  onClose,
  onConfirm,
  confirmLoading,
  confirmLabel = "Confirm & Apply Merge"
}: DiffViewerModalProps) {
  const [originalCode, setOriginalCode] = useState('');
  const [modifiedCode, setModifiedCode] = useState('');

  useEffect(() => {
    setOriginalCode(extractTextFromYjsSnapshot(originalSnapshotBase64));
    setModifiedCode(extractTextFromYjsSnapshot(modifiedSnapshotBase64));
  }, [originalSnapshotBase64, modifiedSnapshotBase64]);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)',
      zIndex: 2000, display: 'flex', flexDirection: 'column',
      padding: '2rem'
    }}>
      <div style={{
        flex: 1, background: 'var(--bg-1)', borderRadius: 12, border: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginBottom: 4 }}>
              {title}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>{fileName}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--aurora-mint)', background: 'rgba(1, 239, 172, 0.1)', border: '1px solid rgba(1, 239, 172, 0.3)', padding: '2px 8px', borderRadius: 4 }}>
                {subtitle}
              </span>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Column Headers for Crystal-Clear Diff Understanding */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          background: 'var(--bg-0)', borderBottom: '1px solid var(--border)',
          fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em'
        }}>
          <div style={{ padding: '8px 16px', color: '#f87171', borderRight: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>●</span> {leftLabel}
          </div>
          <div style={{ padding: '8px 16px', color: '#4ade80', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>●</span> {rightLabel}
          </div>
        </div>

        {/* Diff Editor */}
        <div style={{ flex: 1, position: 'relative' }}>
          <DiffEditor
            original={originalCode}
            modified={modifiedCode}
            language={fileName.split('.').pop() === 'py' ? 'python' : fileName.split('.').pop() === 'ts' || fileName.split('.').pop() === 'tsx' ? 'typescript' : 'javascript'}
            theme="vs-dark"
            options={{
              readOnly: true,
              renderSideBySide: true,
              minimap: { enabled: false },
              padding: { top: 12 },
              scrollBeyondLastLine: false,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            }}
          />
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg-2)',
          display: 'flex', justifyContent: 'flex-end', gap: 12
        }}>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          {onConfirm && (
            <button 
              className="btn btn-primary" 
              onClick={onConfirm}
              disabled={confirmLoading}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {confirmLoading ? (
                <span style={{ opacity: 0.7 }}>Processing...</span>
              ) : (
                <>
                  <Check size={16} />
                  {confirmLabel}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
