import { useState, useEffect } from 'react';
import { branchesApi, type BranchRead, type BranchCompareResponse } from '../../api/branches';
import { Modal } from '../shared/Modal';
import { toast } from '../shared/Toast';
import { DiffViewerModal } from './DiffViewerModal';
import { ArrowDownCircle, GitBranch, FileCode2, RefreshCw } from 'lucide-react';

interface PullSyncModalProps {
  projectId: string;
  currentBranch: BranchRead;
  branches: BranchRead[];
  currentFileId: string | null;
  currentFileName: string | null;
  getCurrentSnapshot: () => string | null;
  decryptSnapshot: (base64: string | null) => string | null;
  onClose: () => void;
  onSyncComplete: (newSnapshotBase64?: string | null) => void;
}

export function PullSyncModal({
  projectId,
  currentBranch,
  branches,
  currentFileId,
  currentFileName,
  getCurrentSnapshot,
  decryptSnapshot,
  onClose,
  onSyncComplete,
}: PullSyncModalProps) {
  const otherBranches = branches.filter((b) => b.id !== currentBranch.id);
  const defaultSource = otherBranches.find((b) => b.type === 'main') ?? otherBranches[0];
  const [sourceBranchId, setSourceBranchId] = useState(defaultSource?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [compareData, setCompareData] = useState<BranchCompareResponse | null>(null);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [error, setError] = useState('');

  const sourceBranch = branches.find((b) => b.id === sourceBranchId);

  // Load comparison data on source branch change
  useEffect(() => {
    if (!sourceBranchId || !currentFileId) return;
    let isMounted = true;
    setComparing(true);
    setError('');

    branchesApi
      .compare(projectId, currentBranch.id, sourceBranchId, currentFileId)
      .then((data) => {
        if (isMounted) {
          setCompareData(data);
          setComparing(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error(err);
          setComparing(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [projectId, currentBranch.id, sourceBranchId, currentFileId]);

  async function handlePullSync() {
    if (!sourceBranchId) {
      setError('Please select a source branch to pull changes from.');
      return;
    }
    if (!currentFileId) {
      setError('Please open a file to sync.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await branchesApi.sync(projectId, currentBranch.id, {
        source_branch_id: sourceBranchId,
        file_id: currentFileId,
        sync_message: `⬇ Pulled latest updates from '${sourceBranch?.name ?? 'source'}'`,
      });

      toast(`Successfully pulled changes from ${sourceBranch?.name ?? 'branch'}!`, 'success');
      onSyncComplete(res.snapshot);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to pull changes from branch');
    } finally {
      setLoading(false);
    }
  }

  if (showDiffModal && compareData) {
    return (
      <DiffViewerModal
        fileName={currentFileName ?? 'File'}
        title={`Compare: ${sourceBranch?.name} vs ${currentBranch.name}`}
        subtitle={`Current ${currentBranch.name} (Left) → Incoming ${sourceBranch?.name} (Right)`}
        leftLabel={`Current Code on ${currentBranch.name} (Left)`}
        rightLabel={`Incoming Code from ${sourceBranch?.name} (Right)`}
        originalSnapshotBase64={decryptSnapshot(compareData.target_snapshot ?? getCurrentSnapshot())}
        modifiedSnapshotBase64={decryptSnapshot(compareData.source_snapshot)}
        confirmLabel="Pull & Apply This Code"
        onClose={() => setShowDiffModal(false)}
        onConfirm={() => {
          setShowDiffModal(false);
          handlePullSync();
        }}
      />
    );
  }

  return (
    <>
      <Modal
        title="Pull / Sync Changes From Branch"
        onClose={onClose}
        footer={
          <>
            <button className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handlePullSync}
              disabled={loading || !sourceBranchId || !currentFileId}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
            >
              {loading ? (
                <>
                  <RefreshCw size={14} className="spin" />
                  <span>Syncing…</span>
                </>
              ) : (
                <>
                  <ArrowDownCircle size={14} />
                  <span>Pull & Apply to {currentBranch.name}</span>
                </>
              )}
            </button>
          </>
        }
      >
        {/* Flow visual */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 16px',
            background: 'rgba(1, 239, 172, 0.05)',
            border: '1px solid rgba(1, 239, 172, 0.2)',
            borderRadius: 'var(--radius)',
            marginBottom: 20,
          }}
        >
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Pull From (Source)
            </div>
            <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--aurora-mint)' }}>
              {sourceBranch?.name ?? 'Select branch'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{sourceBranch?.type}</div>
          </div>

          <ArrowDownCircle size={22} style={{ color: 'var(--aurora-mint)', flexShrink: 0 }} />

          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Pull Into (Current)
            </div>
            <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--text-primary)' }}>
              {currentBranch.name}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{currentBranch.type}</div>
          </div>
        </div>

        {/* Source branch selection */}
        <div className="form-field">
          <label style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <GitBranch size={14} /> Source Branch to Pull From
          </label>
          <select
            className="input-select"
            value={sourceBranchId}
            onChange={(e) => setSourceBranchId(e.target.value)}
            disabled={loading}
            style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)' }}
          >
            {otherBranches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.type})
              </option>
            ))}
          </select>
        </div>

        {/* Active file */}
        <div className="form-field" style={{ marginTop: 12 }}>
          <label style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileCode2 size={14} /> File to Sync
          </label>
          <div
            style={{
              padding: '8px 12px',
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 13,
              fontFamily: 'monospace',
              color: 'var(--text-primary)',
            }}
          >
            {currentFileName ?? currentFileId ?? 'No file open'}
          </div>
        </div>

        {/* Diff preview button */}
        {compareData && (
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-sm btn-full"
              style={{
                background: 'var(--bg-2)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontWeight: 600,
              }}
              onClick={() => setShowDiffModal(true)}
              disabled={comparing}
            >
              <FileCode2 size={13} />
              <span>Preview Side-by-Side Diff with {sourceBranch?.name}</span>
            </button>
          </div>
        )}

        {/* Recent commits on source branch */}
        {compareData && compareData.source_commits.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Latest Commits on {sourceBranch?.name}:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
              {compareData.source_commits.slice(0, 3).map((c) => (
                <div key={c.id} style={{ padding: '6px 10px', background: 'var(--bg-2)', borderRadius: 4, fontSize: 12, border: '1px solid var(--border)' }}>
                  <span style={{ fontWeight: 600 }}>{c.message}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 8 }}>
                    {new Date(c.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 6, color: '#ef4444', fontSize: 12 }}>
            {error}
          </div>
        )}
      </Modal>
    </>
  );
}
