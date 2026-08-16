import { useState, useEffect } from 'react';
import { mergesApi } from '../../api/merges';
import { branchesApi, type BranchRead, type BranchCompareResponse } from '../../api/branches';
import { commitsApi, type CommitResponse } from '../../api/commits';
import { Modal } from '../shared/Modal';
import { toast } from '../shared/Toast';
import { DiffViewerModal } from './DiffViewerModal';
import { GitMerge, AlertTriangle, FileText, FileCode2, Clock, GitCommit } from 'lucide-react';

interface MergeRequestModalProps {
  projectId: string;
  sourceBranch: BranchRead;
  branches: BranchRead[];
  currentFileId: string | null;
  currentFileName: string | null;
  /** The encrypted snapshot of the current file at time of request */
  getCurrentSnapshot: () => string | null;
  decryptSnapshot?: (base64: string | null) => string | null;
  onClose: () => void;
  onCreated: () => void;
}

export function MergeRequestModal({
  projectId,
  sourceBranch,
  branches,
  currentFileId,
  currentFileName,
  getCurrentSnapshot,
  decryptSnapshot,
  onClose,
  onCreated,
}: MergeRequestModalProps) {
  const targetBranches = branches.filter((b) => b.id !== sourceBranch.id);
  const [targetBranchId, setTargetBranchId] = useState(
    targetBranches.find((b) => b.type === 'main')?.id ?? targetBranches[0]?.id ?? ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [prTitle, setPrTitle] = useState('');
  const [prDescription, setPrDescription] = useState('');
  const [commits, setCommits] = useState<CommitResponse[]>([]);
  const [compareData, setCompareData] = useState<BranchCompareResponse | null>(null);
  const [showDiffModal, setShowDiffModal] = useState(false);

  // Fetch recent commits on source branch to connect commits with PR
  useEffect(() => {
    if (!currentFileId) return;
    commitsApi
      .getCommits(projectId, currentFileId, sourceBranch.id)
      .then((data) => {
        setCommits(data);
        if (data.length > 0 && !prTitle) {
          setPrTitle(data[0].message);
        }
      })
      .catch((e) => console.error(e));
  }, [projectId, currentFileId, sourceBranch.id]);

  // Load comparison data for diff preview
  useEffect(() => {
    if (!targetBranchId || !currentFileId) return;
    branchesApi
      .compare(projectId, targetBranchId, sourceBranch.id, currentFileId)
      .then((data) => setCompareData(data))
      .catch((e) => console.error(e));
  }, [projectId, targetBranchId, sourceBranch.id, currentFileId]);

  async function handleSubmit() {
    if (!currentFileId) {
      setError('Please open a file in the editor before initiating a merge request.');
      return;
    }
    if (!targetBranchId) {
      setError('Select a target branch.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const snapshot = getCurrentSnapshot();
      await mergesApi.create(projectId, {
        source_branch_id: sourceBranch.id,
        target_branch_id: targetBranchId,
        file_id: currentFileId,
        pre_merge_snapshot: snapshot ?? undefined,
        detail: {
          source_branch_name: sourceBranch.name,
          target_branch_name: targetBranches.find((b) => b.id === targetBranchId)?.name ?? targetBranchId,
          file_name: currentFileName ?? currentFileId,
          pr_title: prTitle.trim() || `Merge ${sourceBranch.name} → target`,
          pr_description: prDescription.trim(),
        },
      });
      toast('Merge request submitted — awaiting review', 'success');
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create merge request');
    } finally {
      setLoading(false);
    }
  }

  const targetBranch = targetBranches.find((b) => b.id === targetBranchId);

  if (showDiffModal && compareData && decryptSnapshot) {
    return (
      <DiffViewerModal
        fileName={currentFileName ?? 'File'}
        title={`Merge Preview: ${sourceBranch.name} → ${targetBranch?.name}`}
        subtitle={`Target ${targetBranch?.name} (Left) ← Incoming ${sourceBranch.name} (Right)`}
        leftLabel={`Current Code on ${targetBranch?.name} (Left)`}
        rightLabel={`Incoming Code from ${sourceBranch.name} (Right)`}
        originalSnapshotBase64={decryptSnapshot(compareData.target_snapshot)}
        modifiedSnapshotBase64={decryptSnapshot(compareData.source_snapshot ?? getCurrentSnapshot())}
        onClose={() => setShowDiffModal(false)}
      />
    );
  }

  return (
    <>
      <Modal
        title="Initiate Merge / Pull Request"
        onClose={onClose}
        footer={
          <>
            <button className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={loading || !currentFileId || !targetBranchId}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
            >
              {loading ? 'Submitting…' : <><GitMerge size={14} /> Submit Merge Request</>}
            </button>
          </>
        }
      >
        {/* Flow diagram */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'rgba(1,239,172,0.06)', border: '1px solid rgba(1,239,172,0.18)', borderRadius: 'var(--radius)', marginBottom: 20 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Source Branch</div>
            <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--aurora-mint)' }}>{sourceBranch.name}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{sourceBranch.type}</div>
          </div>
          <GitMerge size={22} style={{ color: 'var(--aurora-mint)', flexShrink: 0 }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Target Branch</div>
            <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--text-primary)' }}>{targetBranch?.name ?? '—'}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{targetBranch?.type}</div>
          </div>
        </div>

        {/* File being merged */}
        <div className="form-field">
          <label style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>File Being Merged</label>
          {currentFileId ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', fontSize: 13, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
              <FileText size={14} style={{ color: 'var(--text-secondary)' }} />
              <span>{currentFileName ?? currentFileId}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '9px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-xs)', color: 'var(--danger)', fontSize: 12 }}>
              <AlertTriangle size={14} /> Open a file in the editor first
            </div>
          )}
        </div>

        {/* Commits picker (GitHub style) */}
        {commits.length > 0 && (
          <div className="form-field">
            <label style={{ color: 'var(--text-secondary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <GitCommit size={14} /> Recent Commits on {sourceBranch.name} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>(click to use as PR title)</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {commits.slice(0, 4).map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => {
                    setPrTitle(c.message);
                    setPrDescription(`Associated with commit: ${c.message}\nDate: ${new Date(c.created_at).toLocaleString()}`);
                  }}
                  className="btn btn-sm btn-ghost"
                  style={{ fontSize: 11, padding: '3px 8px', border: '1px solid var(--border)', background: prTitle === c.message ? 'rgba(1,239,172,0.1)' : 'var(--bg-2)' }}
                >
                  <Clock size={11} style={{ marginRight: 4 }} /> {c.message}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PR Title */}
        <div className="form-field" style={{ marginTop: 12 }}>
          <label style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>PR Title</label>
          <input
            type="text"
            value={prTitle}
            onChange={(e) => setPrTitle(e.target.value)}
            placeholder={`Merge ${sourceBranch.name} → ${targetBranch?.name ?? 'target'}`}
            style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)' }}
          />
        </div>

        {/* PR Description */}
        <div className="form-field" style={{ marginTop: 12 }}>
          <label style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>Description <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
          <textarea
            value={prDescription}
            onChange={(e) => setPrDescription(e.target.value)}
            placeholder="Describe what changed, linked commits, and why..."
            rows={3}
            style={{ resize: 'vertical', minHeight: 72, width: '100%', padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)' }}
          />
        </div>

        {/* Target branch selection */}
        <div className="form-field" style={{ marginTop: 12 }}>
          <label style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>Merge Into (Target Branch)</label>
          <select 
            value={targetBranchId} 
            onChange={(e) => setTargetBranchId(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)' }}
          >
            {targetBranches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.type})
              </option>
            ))}
          </select>
        </div>

        {/* Preview Diff Button */}
        {decryptSnapshot && compareData && (
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-sm btn-full"
              style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600 }}
              onClick={() => setShowDiffModal(true)}
            >
              <FileCode2 size={13} />
              <span>Review Code Diff ({sourceBranch.name} vs {targetBranch?.name})</span>
            </button>
          </div>
        )}

        <div style={{ marginTop: 16, padding: '10px 12px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 'var(--radius-xs)', fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertTriangle size={14} style={{ color: '#fbbf24', flexShrink: 0, marginTop: 1 }} />
          A project lead or admin will review and apply this merge request to {targetBranch?.name}.
        </div>

        {error && <p className="form-error" style={{ marginTop: 12, color: '#ef4444' }}>{error}</p>}
      </Modal>
    </>
  );
}
