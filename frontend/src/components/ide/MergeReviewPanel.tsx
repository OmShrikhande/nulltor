import { useState, useEffect } from 'react';
import { mergesApi, type MergeRequestRead } from '../../api/merges';
import { type BranchRead } from '../../api/branches';
import { useCrypto } from '../../hooks/useCrypto';
import { toast } from '../shared/Toast';
import { CheckCircle, XCircle, GitMerge, Clock, ChevronDown, ChevronRight, FileCode2 } from 'lucide-react';
import { DiffViewerModal } from './DiffViewerModal';

interface MergeReviewPanelProps {
  projectId: string;
  branches: BranchRead[];
  canReview: boolean; // true if admin/lead/superadmin
  passphrase: string;
  onClose: () => void;
  onMerged?: () => void;
}

const SALT = 'nulltor-static-salt-v1';

const STATUS_COLORS: Record<string, string> = {
  pending: '#fbbf24',
  approved: '#22c55e',
  rejected: '#ef4444',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock size={14} style={{ color: '#fbbf24' }} />,
  approved: <CheckCircle size={14} style={{ color: '#22c55e' }} />,
  rejected: <XCircle size={14} style={{ color: '#ef4444' }} />,
};

export function MergeReviewPanel({ projectId, branches, canReview, passphrase, onClose, onMerged }: MergeReviewPanelProps) {
  const [merges, setMerges] = useState<MergeRequestRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { decrypt } = useCrypto(passphrase, SALT);

  const [diffMr, setDiffMr] = useState<MergeRequestRead | null>(null);
  const [diffOriginal, setDiffOriginal] = useState<string | null>(null);
  const [diffModified, setDiffModified] = useState<string | null>(null);

  const branchMap = Object.fromEntries(branches.map((b) => [b.id, b.name]));

  useEffect(() => {
    loadMerges();
  }, []);

  async function loadMerges() {
    setLoading(true);
    try {
      const data = await mergesApi.list(projectId);
      setMerges(data);
    } catch {
      toast('Failed to load merge requests', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(mergeId: string, decision: 'approved' | 'rejected') {
    setActionLoading(mergeId + decision);
    try {
      const updated = await mergesApi.review(projectId, mergeId, decision);
      setMerges((prev) => prev.map((m) => (m.id === mergeId ? updated : m)));
      toast(`Merge request ${decision}`, decision === 'approved' ? 'success' : 'error');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Action failed', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleConfirm(mr: MergeRequestRead) {
    setActionLoading(mr.id + 'confirm');
    try {
      // Fetch the snapshot since it is intentionally omitted from the list API response
      const snapData = await mergesApi.getSnapshots(projectId, mr.id);
      
      if (!snapData.pre_merge_snapshot) {
        toast('No snapshot to merge. The source branch may not have any saved content yet.', 'error');
        return;
      }
      
      // Conflict detection: warn if target file was modified after MR was submitted
      if (snapData.target_updated_at && mr.created_at) {
        const targetUpdated = new Date(snapData.target_updated_at).getTime();
        const mrCreated = new Date(mr.created_at).getTime();
        if (targetUpdated > mrCreated) {
          const proceed = confirm(
            `⚠️ Conflict Warning\n\nThe target file was modified AFTER this merge request was submitted (${new Date(snapData.target_updated_at).toLocaleString()}).\n\nApplying this merge may overwrite newer changes.\n\nProceed anyway?`
          );
          if (!proceed) {
            setActionLoading(null);
            return;
          }
        }
      }
      
      await mergesApi.confirm(projectId, mr.id, snapData.pre_merge_snapshot);
      setMerges((prev) => prev.map((m) => (m.id === mr.id ? { ...m, status: 'approved' as const } : m)));
      toast('Merge confirmed — snapshot written to target branch!', 'success');
      loadMerges();
      if (onMerged) {
        onMerged();
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Confirm failed', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReviewCode(mr: MergeRequestRead) {
    setActionLoading(mr.id + 'diff');
    try {
      const snapData = await mergesApi.getSnapshots(projectId, mr.id);
      if (!snapData.pre_merge_snapshot) {
        toast('No snapshot available in the source branch.', 'error');
        return;
      }
      
      const modifiedBase64 = decrypt(snapData.pre_merge_snapshot);
      const originalBase64 = snapData.target_snapshot ? decrypt(snapData.target_snapshot) : null;
      
      console.log('DEBUG: decrypted pre_merge_snapshot:', modifiedBase64);
      console.log('DEBUG: decrypted target_snapshot:', originalBase64);
      
      setDiffOriginal(originalBase64);
      setDiffModified(modifiedBase64);
      setDiffMr(mr);
    } catch (e) {
      console.error(e);
      toast(e instanceof Error ? e.message : 'Failed to load code diff', 'error');
      alert(`Debug Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActionLoading(null);
    }
  }

  const pending = merges.filter((m) => m.status === 'pending');
  const rest = merges.filter((m) => m.status !== 'pending');

  return (
    <>
      <div className="sidebar-transparent-backdrop" onClick={onClose} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 400, background: 'var(--bg-1)',
        borderLeft: '1px solid var(--border)', zIndex: 200, display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.4)'
      }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GitMerge size={18} style={{ color: 'var(--aurora-mint)' }} />
          <span style={{ fontWeight: 800, fontSize: 15 }}>Merge Requests</span>
          {pending.length > 0 && (
            <span style={{ background: '#fbbf24', color: '#000', fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 99 }}>
              {pending.length} pending
            </span>
          )}
        </div>
        <button className="btn-icon" style={{ width: 28, height: 28 }} onClick={onClose}>×</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32, fontSize: 13 }}>Loading…</div>
        ) : merges.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32, fontSize: 13 }}>
            <GitMerge size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <div>No merge requests yet.</div>
          </div>
        ) : (
          <>
            {pending.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#fbbf24', marginBottom: 10 }}>
                  ● Awaiting Review
                </div>
                {pending.map((mr) => <MergeCard key={mr.id} mr={mr} branchMap={branchMap} canReview={canReview} expanded={expandedId === mr.id} onToggle={() => setExpandedId(expandedId === mr.id ? null : mr.id)} onReview={handleReview} onConfirm={handleConfirm} onReviewCode={handleReviewCode} actionLoading={actionLoading} />)}
              </div>
            )}
            {rest.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 10 }}>
                  History
                </div>
                {rest.map((mr) => <MergeCard key={mr.id} mr={mr} branchMap={branchMap} canReview={canReview} expanded={expandedId === mr.id} onToggle={() => setExpandedId(expandedId === mr.id ? null : mr.id)} onReview={handleReview} onConfirm={handleConfirm} onReviewCode={handleReviewCode} actionLoading={actionLoading} />)}
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-ghost btn-sm btn-full" onClick={loadMerges}>↻ Refresh</button>
      </div>

      {diffMr && (
        <DiffViewerModal
          fileName={diffMr.detail?.file_name as string ?? 'Code Diff'}
          originalSnapshotBase64={diffOriginal}
          modifiedSnapshotBase64={diffModified}
          onClose={() => setDiffMr(null)}
          onConfirm={() => {
            setDiffMr(null);
            handleConfirm(diffMr);
          }}
          confirmLoading={actionLoading === diffMr.id + 'confirm'}
        />
      )}
    </div>
    </>
  );
}

function MergeCard({
  mr, branchMap, canReview, expanded, onToggle, onReview, onConfirm, onReviewCode, actionLoading
}: {
  mr: MergeRequestRead;
  branchMap: Record<string, string>;
  canReview: boolean;
  expanded: boolean;
  onToggle: () => void;
  onReview: (id: string, decision: 'approved' | 'rejected') => void;
  onConfirm: (mr: MergeRequestRead) => void;
  onReviewCode: (mr: MergeRequestRead) => void;
  actionLoading: string | null;
}) {
  const detail = mr.detail as Record<string, string>;
  const sourceName = detail.source_branch_name ?? branchMap[mr.source_branch_id] ?? mr.source_branch_id.slice(0, 8);
  const targetName = detail.target_branch_name ?? branchMap[mr.target_branch_id] ?? mr.target_branch_id.slice(0, 8);
  const fileName = detail.file_name ?? mr.file_id.slice(0, 12);
  const prTitle = detail.pr_title ?? fileName;
  const prDescription = detail.pr_description ?? '';

  return (
    <div style={{ marginBottom: 10, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <div
        onClick={onToggle}
        style={{ padding: '10px 14px', background: 'var(--bg-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
      >
        {STATUS_ICONS[mr.status]}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {prTitle}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {fileName} • {sourceName} → {targetName}
            </div>
          </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLORS[mr.status], textTransform: 'uppercase' }}>{mr.status}</span>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </div>

      {expanded && (
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg-0)' }}>
          {prDescription && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, padding: '8px 10px', background: 'var(--bg-2)', borderRadius: 6, borderLeft: '3px solid var(--aurora-blue)' }}>
              {prDescription}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
            Requested: {new Date(mr.created_at).toLocaleString()}
          </div>

          {mr.status !== 'rejected' && !mr.detail?.is_merged && canReview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 700 }}
                  onClick={() => onConfirm(mr)}
                  disabled={actionLoading === mr.id + 'confirm'}
                >
                  <GitMerge size={14} />
                  {actionLoading === mr.id + 'confirm' ? 'Merging…' : 'Confirm & Merge'}
                </button>
                <button
                  className="btn btn-sm"
                  style={{ flex: 1, background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#ef4444', fontWeight: 700 }}
                  onClick={() => onReview(mr.id, 'rejected')}
                  disabled={actionLoading === mr.id + 'rejected'}
                >
                  <XCircle size={12} /> Reject
                </button>
              </div>

              <button
                className="btn btn-sm btn-full"
                style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontWeight: 600 }}
                onClick={() => onReviewCode(mr)}
                disabled={actionLoading === mr.id + 'diff'}
              >
                <FileCode2 size={13} style={{ marginRight: 6 }} /> 
                {actionLoading === mr.id + 'diff' ? 'Loading Diff...' : 'Review Code Diff'}
              </button>
            </div>
          )}

          {Boolean(mr.detail?.is_merged) && (
            <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <CheckCircle size={14} /> Merged & Applied to Target Branch
            </div>
          )}

          {mr.status === 'rejected' && (
            <div style={{ fontSize: 12, color: 'var(--danger)', fontStyle: 'italic' }}>This merge request was rejected.</div>
          )}
        </div>
      )}
    </div>
  );
}
