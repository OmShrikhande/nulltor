import { useEffect, useState } from 'react';
import { commitsApi, type CommitResponse } from '../../api/commits';
import { DiffViewerModal } from './DiffViewerModal';
import { useCrypto } from '../../hooks/useCrypto';
import { X, FileText } from 'lucide-react';

// Must match IDEPage salt
const SALT = 'nulltor-static-salt-v1';

interface TimelinePanelProps {
  projectId: string;
  branchId: string;
  fileId: string;
  fileName: string;
  passphrase: string;
  getCurrentSnapshot: () => string | null;
  onRestore: (snapshotBase64: string) => void;
  onClose: () => void;
}

export function TimelinePanel({
  projectId,
  branchId,
  fileId,
  fileName,
  passphrase,
  getCurrentSnapshot,
  onRestore,
  onClose,
}: TimelinePanelProps) {
  const [commits, setCommits] = useState<CommitResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [diffOriginal, setDiffOriginal] = useState<string | null>(null);
  const [diffModified, setDiffModified] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [diffCommitTime, setDiffCommitTime] = useState('');

  const { decrypt } = useCrypto(passphrase, SALT);

  useEffect(() => {
    loadCommits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, branchId, fileId]);

  async function loadCommits() {
    setLoading(true);
    setError(null);
    try {
      const data = await commitsApi.getCommits(projectId, fileId, branchId);
      setCommits(data);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  }

  function handleViewDiff(commit: CommitResponse) {
    try {
      const currentEncrypted = getCurrentSnapshot();
      if (!currentEncrypted) {
        alert('Could not capture current editor state.');
        return;
      }

      const originalDecrypted = decrypt(commit.snapshot);
      const modifiedDecrypted = decrypt(currentEncrypted);

      setDiffOriginal(originalDecrypted);
      setDiffModified(modifiedDecrypted);
      setDiffCommitTime(new Date(commit.created_at).toLocaleString());
      setShowDiff(true);
    } catch (err) {
      console.error('Failed to decrypt snapshots for diff', err);
      alert('Decryption failed. Please ensure passphrase is correct.');
    }
  }

  function handleRestore(commit: CommitResponse) {
    if (!window.confirm(`Are you sure you want to restore to the commit from ${new Date(commit.created_at).toLocaleString()}? This will overwrite the current active file for everyone.`)) return;
    try {
      const pastBase64 = decrypt(commit.snapshot);
      onRestore(pastBase64);
    } catch (e) {
      console.error(e);
      alert('Failed to decrypt snapshot.');
    }
  }

  return (
    <>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-1)',
        overflow: 'hidden',
        width: '320px',
        borderLeft: '1px solid var(--border-color)',
      }}>
        {/* Matching VS Code tree-header */}
        <div
          className="tree-header"
          style={{
            height: '36px',
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-1)',
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>
            Timeline / Commits
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <button
              className="btn-icon"
              style={{ width: 22, height: 22, fontSize: 12, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Close Timeline"
              onClick={onClose}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'var(--bg-2)', borderBottom: '1px solid var(--border-color)', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
          <FileText size={13} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {loading ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Loading timeline...</div>
          ) : error ? (
            <div style={{ color: '#ef4444', fontSize: '13px' }}>{error}</div>
          ) : commits.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No commits for this file on branch.</div>
          ) : (
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute',
                left: '11px',
                top: 0,
                bottom: 0,
                width: '2px',
                background: 'var(--border-color)'
              }} />

              {commits.map((commit, i) => (
                <div key={commit.id} style={{ position: 'relative', paddingLeft: '32px', marginBottom: '24px' }}>
                  <div style={{
                    position: 'absolute',
                    left: '8px',
                    top: '4px',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: i === 0 ? 'var(--aurora-mint)' : 'var(--text-secondary)',
                    border: '2px solid var(--bg-1)',
                    boxShadow: i === 0 ? '0 0 0 2px rgba(1,239,172,0.2)' : 'none'
                  }} />
                  
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    {new Date(commit.created_at).toLocaleString()} • {commit.username ?? 'System'}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, marginBottom: '8px' }}>
                    {commit.message}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleViewDiff(commit)}
                      style={{
                        padding: '4px 10px',
                        background: 'var(--bg-2)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        color: 'var(--text-primary)',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                    >
                      Compare
                    </button>
                    <button
                      onClick={() => handleRestore(commit)}
                      style={{
                        padding: '4px 10px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '4px',
                        color: '#ef4444',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                    >
                      Restore
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showDiff && diffOriginal !== null && diffModified !== null && (
        <DiffViewerModal
          originalSnapshotBase64={diffOriginal}
          modifiedSnapshotBase64={diffModified}
          fileName={fileName}
          title="Commit Diff"
          subtitle="Current Editor (Left) → Historical Commit (Right)"
          leftLabel="Current Editor (Left)"
          rightLabel={`Historical Commit: ${diffCommitTime} (Right)`}
          onClose={() => setShowDiff(false)}
        />
      )}
    </>
  );
}
