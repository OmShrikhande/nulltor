import { useState, useEffect } from 'react';
import { mergesApi } from '../../api/merges';
import { branchesApi, type BranchRead, type BranchCompareResponse } from '../../api/branches';
import { commitsApi, type CommitResponse } from '../../api/commits';
import { Modal } from '../shared/Modal';
import { toast } from '../shared/Toast';
import { DiffViewerModal } from './DiffViewerModal';
import { GitMerge, AlertTriangle, FileText, FileCode2, Clock, GitCommit, Layers } from 'lucide-react';

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
  const [mergeScope, setMergeScope] = useState<'room' | 'file'>('room');
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
    if (mergeScope === 'file' && !currentFileId) {
      setError('Please open a file in the editor or select "Entire Room".');
      return;
    }
    if (!targetBranchId) {
      setError('Select a target branch.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const isRoomMerge = mergeScope === 'room';
      const snapshot = isRoomMerge ? undefined : (getCurrentSnapshot() ?? undefined);
      const targetBranchName = targetBranches.find((b) => b.id === targetBranchId)?.name ?? targetBranchId;

      await mergesApi.create(projectId, {
        source_branch_id: sourceBranch.id,
        target_branch_id: targetBranchId,
        file_id: isRoomMerge ? '__all__' : currentFileId!,
        pre_merge_snapshot: snapshot,
        detail: {
          source_branch_name: sourceBranch.name,
          target_branch_name: targetBranchName,
          file_name: isRoomMerge ? 'Entire Workspace / All Files' : (currentFileName ?? currentFileId),
          pr_title: prTitle.trim() || `Merge ${sourceBranch.name} → ${targetBranchName}`,
          pr_description: prDescription.trim(),
          is_room_merge: isRoomMerge,
        },
      });
      toast(`Merge request for ${isRoomMerge ? 'entire room' : 'file'} submitted — awaiting review`, 'success');
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
              disabled={loading || !targetBranchId || (mergeScope === 'file' && !currentFileId)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
            >
              {loading ? 'Submitting…' : <><GitMerge size={14} /> Submit Merge Request</>}
            </button>
          </>
        }
      >
        {/* Flow diagram */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'rgba(37, 99, 235, 0.08)', border: '1px solid rgba(37, 99, 235, 0.25)', borderRadius: 'var(--radius)', marginBottom: 16 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Source Branch</div>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--accent-secondary)' }}>{sourceBranch.name}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 2 }}>{sourceBranch.type}</div>
          </div>
          <GitMerge size={24} style={{ color: 'var(--accent-secondary)', flexShrink: 0 }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Target Branch</div>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>{targetBranch?.name ?? '—'}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 2 }}>{targetBranch?.type}</div>
          </div>
        </div>

        {/* Merge Scope Selector */}
        <div className="form-field">
          <label style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-primary)', marginBottom: 8, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Merge Scope
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              onClick={() => setMergeScope('room')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 8,
                background: mergeScope === 'room' ? 'rgba(37, 99, 235, 0.12)' : 'var(--bg-surface)',
                border: mergeScope === 'room' ? '1.5px solid var(--accent-secondary)' : '1px solid var(--border)',
                color: mergeScope === 'room' ? 'var(--accent-secondary)' : 'var(--text-primary)',
                fontWeight: mergeScope === 'room' ? 700 : 600,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <Layers size={16} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Entire Room</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>All workspace files & folders</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMergeScope('file')}
              disabled={!currentFileId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 8,
                background: mergeScope === 'file' ? 'rgba(37, 99, 235, 0.12)' : 'var(--bg-surface)',
                border: mergeScope === 'file' ? '1.5px solid var(--accent-secondary)' : '1px solid var(--border)',
                color: mergeScope === 'file' ? 'var(--accent-secondary)' : 'var(--text-primary)',
                fontWeight: mergeScope === 'file' ? 700 : 600,
                cursor: currentFileId ? 'pointer' : 'not-allowed',
                opacity: currentFileId ? 1 : 0.6,
                textAlign: 'left',
              }}
            >
              <FileCode2 size={16} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Active File Only</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>
                  {currentFileName ? currentFileName : 'No file open'}
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Commits picker (GitHub style) */}
        {commits.length > 0 && (
          <div className="form-field" style={{ marginTop: 12 }}>
            <label style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <GitCommit size={14} /> Recent Commits on {sourceBranch.name} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'none' }}>(click to use as PR title)</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {commits.slice(0, 4).map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => {
                    setPrTitle(c.message);
                    setPrDescription(`Associated with commit: ${c.message}\nDate: ${new Date(c.created_at).toLocaleString()}`);
                  }}
                  className="btn btn-sm btn-ghost"
                  style={{ fontSize: 11, padding: '4px 10px', border: '1px solid var(--border)', background: prTitle === c.message ? 'rgba(37, 99, 235, 0.15)' : 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 600 }}
                >
                  <Clock size={11} style={{ marginRight: 4 }} /> {c.message}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PR Title */}
        <div className="form-field" style={{ marginTop: 14 }}>
          <label style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>PR Title</label>
          <input
            type="text"
            value={prTitle}
            onChange={(e) => setPrTitle(e.target.value)}
            placeholder={`Merge ${sourceBranch.name} → ${targetBranch?.name ?? 'target'}`}
            style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-popover)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}
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

        {/* Preview Diff Button for single file */}
        {mergeScope === 'file' && decryptSnapshot && compareData && (
          <div style={{ marginTop: 14 }}>
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
          A project lead or reviewer can inspect and confirm this merge request into {targetBranch?.name}.
        </div>

        {error && <p className="form-error" style={{ marginTop: 12, color: '#ef4444' }}>{error}</p>}
      </Modal>
    </>
  );
}
