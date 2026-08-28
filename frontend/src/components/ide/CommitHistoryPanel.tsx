import { useState, useEffect } from 'react';
import { commitsApi, type CommitResponse } from '../../api/commits';
import { History, GitCommit, Undo2, FileText } from 'lucide-react';
import { DiffViewerModal } from './DiffViewerModal';
import { toast } from '../shared/Toast';
import * as Y from 'yjs';

interface CommitHistoryPanelProps {
  projectId: string;
  branchId: string;
  fileId: string;
  fileName: string;
  getCurrentSnapshot: () => string | null;
  decryptSnapshot: (snapshotBase64: string) => string;
  onRevert: (snapshotBase64: string) => void;
  onClose: () => void;
}

export function CommitHistoryPanel({
  projectId,
  branchId,
  fileId,
  fileName,
  getCurrentSnapshot,
  decryptSnapshot,
  onRevert,
  onClose,
}: CommitHistoryPanelProps) {
  const [commits, setCommits] = useState<CommitResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [diffCommit, setDiffCommit] = useState<CommitResponse | null>(null);

  useEffect(() => {
    loadCommits();
  }, [fileId, branchId]);

  async function loadCommits() {
    setLoading(true);
    try {
      const data = await commitsApi.getCommits(projectId, fileId);
      setCommits(data);
    } catch (e) {
      toast('Failed to load commit history', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 340, background: 'var(--bg-1)',
      borderLeft: '1px solid var(--border)', zIndex: 150, display: 'flex', flexDirection: 'column',
      boxShadow: '-8px 0 40px rgba(0,0,0,0.4)'
    }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <History size={18} style={{ color: 'var(--aurora-blue)' }} />
          <span style={{ fontWeight: 800, fontSize: 15 }}>File History</span>
        </div>
        <button className="btn-icon" style={{ width: 28, height: 28 }} onClick={onClose}>×</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)', fontSize: 12, fontFamily: 'monospace' }}>
        <FileText size={14} style={{ color: 'var(--text-secondary)' }} />
        <span>{fileName}</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32, fontSize: 13 }}>Loading…</div>
        ) : commits.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32, fontSize: 13 }}>
            <History size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <div>No commits found for this file.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {commits.map((commit, i) => (
              <div key={commit.id} style={{ 
                position: 'relative', 
                paddingLeft: 20,
              }}>
                {/* Timeline connector line */}
                {i !== commits.length - 1 && (
                  <div style={{ position: 'absolute', left: 5, top: 18, bottom: -24, width: 2, background: 'var(--border)' }} />
                )}
                
                <div style={{ 
                  position: 'absolute', left: 0, top: 6, width: 12, height: 12, 
                  borderRadius: '50%', background: 'var(--bg-2)', border: '2px solid var(--aurora-blue)' 
                }} />

                <div 
                  style={{ 
                    border: '1px solid var(--border)', borderRadius: 'var(--radius)', 
                    background: 'var(--bg-0)', overflow: 'hidden',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{commit.message}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{commit.username || 'System'}</span>
                      <span>{new Date(commit.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                  
                  <div style={{ padding: '8px 10px', background: 'var(--bg-2)', display: 'flex', gap: 8 }}>
                    <button 
                      className="btn btn-sm btn-ghost" 
                      style={{ flex: 1, fontSize: 11 }}
                      onClick={() => setDiffCommit(commit)}
                    >
                      <GitCommit size={12} style={{ marginRight: 6 }} /> View Diff
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {diffCommit && (
        <DiffViewerModal
          fileName={fileName}
          title="Time Machine Revert"
          subtitle="Current Code (Left) → Past Commit to Revert (Right)"
          leftLabel="Current Working Code (Left)"
          rightLabel="Past Commit Target (Right)"
          originalSnapshotBase64={getCurrentSnapshot()}
          modifiedSnapshotBase64={decryptSnapshot(diffCommit.snapshot || '')}
          confirmLabel="Revert to this version"
          onClose={() => setDiffCommit(null)}
          onConfirm={() => {
            onRevert(decryptSnapshot(diffCommit.snapshot || ''));
            setDiffCommit(null);
            onClose();
            toast('File reverted successfully', 'success');
          }}
        />
      )}
    </div>
  );
}
