import { useState } from 'react';
import { type BranchRead, type BranchType, branchesApi } from '../../api/branches';
import { useProjectStore } from '../../store/projectStore';
import { Modal } from '../shared/Modal';
import { toast } from '../shared/Toast';

interface BranchSelectorProps {
  branches: BranchRead[];
  currentBranch: BranchRead | null;
  projectId: string;
  onBranchChange: (branch: BranchRead) => void;
  onRefresh: () => void;
}

const BRANCH_ICONS: Record<BranchType, string> = {
  main: '🌿',
  subroom: '🔀',
  private: '🔒',
};

export function BranchSelector({ branches, currentBranch, projectId, onBranchChange, onRefresh }: BranchSelectorProps) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="branch-selector">
      <span style={{ color: 'var(--text-muted)' }}>
        {BRANCH_ICONS[currentBranch?.type ?? 'main']}
      </span>
      <select
        className="branch-select"
        value={currentBranch?.id ?? ''}
        onChange={(e) => {
          const b = branches.find((br) => br.id === e.target.value);
          if (b) onBranchChange(b);
        }}
      >
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {BRANCH_ICONS[b.type]} {b.name} ({b.type})
          </option>
        ))}
      </select>
      <button
        className="btn btn-ghost btn-sm"
        title="Create new branch"
        onClick={() => setShowCreate(true)}
      >+ Branch</button>

      {showCreate && (
        <CreateBranchModal
          projectId={projectId}
          branches={branches}
          onClose={() => setShowCreate(false)}
          onCreated={(b) => { onRefresh(); onBranchChange(b); setShowCreate(false); }}
        />
      )}
    </div>
  );
}

export function CreateBranchModal({ projectId, branches, onClose, onCreated }: {
  projectId: string;
  branches: BranchRead[];
  onClose: () => void;
  onCreated: (b: BranchRead) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<BranchType>('subroom');
  const [parentId, setParentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const mainBranch = branches.find((b) => b.type === 'main');

  async function handleCreate() {
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const b = await branchesApi.create(projectId, {
        name: name.trim(),
        type,
        parent_branch_id: parentId || mainBranch?.id || undefined,
      });
      toast(`Branch "${b.name}" created`, 'success');
      onCreated(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create branch');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="New Branch"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={loading || !name.trim()}>
            {loading ? 'Creating…' : 'Create Branch'}
          </button>
        </>
      }
    >
      <div className="form-field">
        <label>Branch Name</label>
        <input
          type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="feature/my-feature"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
      </div>
      <div className="form-field">
        <label>Type</label>
        <select value={type} onChange={(e) => setType(e.target.value as BranchType)}>
          <option value="subroom">🔀 Subroom — collaborative feature branch</option>
          <option value="private">🔒 Private — personal fork (only you)</option>
        </select>
      </div>
      <div className="form-field">
        <label>Branch off</label>
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {BRANCH_ICONS[b.type]} {b.name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
