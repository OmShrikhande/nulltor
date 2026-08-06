import { useState } from 'react';
import { type BranchRead, type BranchType, branchesApi } from '../../api/branches';
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

const BRANCH_LABELS: Record<BranchType, string> = {
  main: 'Main Room',
  subroom: 'Parallel Subroom',
  private: 'Private Vault',
};

export function BranchSelector({ branches, currentBranch, projectId, onBranchChange, onRefresh }: BranchSelectorProps) {
  const [showCreate, setShowCreate] = useState(false);
  const branchType = currentBranch?.type ?? 'main';

  return (
    <div className="branch-selector" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
      {/* Active Subroom Pill */}
      <div className={`branch-pill ${branchType}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: 'var(--radius-full)' }}>
        <span style={{ fontSize: '14px' }}>{BRANCH_ICONS[branchType]}</span>
        <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.8, fontWeight: 700 }}>
          {BRANCH_LABELS[branchType]}:
        </span>
        <select
          value={currentBranch?.id ?? ''}
          onChange={(e) => {
            const b = branches.find((br) => br.id === e.target.value);
            if (b) onBranchChange(b);
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            fontWeight: 800,
            fontSize: '12.5px',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id} style={{ background: 'var(--bg-1)', color: 'var(--text-primary)' }}>
              {BRANCH_ICONS[b.type]} {b.name} ({BRANCH_LABELS[b.type]})
            </option>
          ))}
        </select>
      </div>

      {/* Create Subroom Button */}
      <button
        className="btn btn-sm"
        title="Create a new parallel subroom or private branch"
        onClick={() => setShowCreate(true)}
        style={{
          background: 'rgba(13, 148, 136, 0.15)',
          border: '1px solid #0d9488',
          color: '#14b8a6',
          fontWeight: 700,
          fontSize: '11.5px',
          borderRadius: 'var(--radius-full)',
          padding: '4px 12px',
        }}
      >
        + Create Subroom
      </button>

      {showCreate && (
        <CreateBranchModal
          projectId={projectId}
          branches={branches}
          onClose={() => setShowCreate(false)}
          onCreated={(b) => {
            onRefresh();
            onBranchChange(b);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

export function CreateBranchModal({
  projectId,
  branches,
  onClose,
  onCreated,
}: {
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
      toast(`Subroom "${b.name}" initialized successfully`, 'success');
      onCreated(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create subroom');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Create New Subroom Workspace"
      onClose={onClose}
      footer={
        <>
          <button
            className="btn"
            style={{
              background: 'rgba(13, 148, 136, 0.15)',
              border: '1px solid #0d9488',
              color: '#14b8a6',
              fontWeight: 600,
            }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={loading || !name.trim()}
          >
            {loading ? 'Creating Subroom…' : 'Create Subroom'}
          </button>
        </>
      }
    >
      <div className="form-field">
        <label style={{ color: '#0d9488', fontWeight: 700 }}>Subroom Identifier / Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. subroom-auth-api or feature/quantum-mesh"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
      </div>

      <div className="form-field">
        <label style={{ color: '#0d9488', fontWeight: 700 }}>Subroom Architecture Type</label>
        <select value={type} onChange={(e) => setType(e.target.value as BranchType)}>
          <option value="subroom">🔀 Parallel Subroom — Multi-developer collaborative branch</option>
          <option value="private">🔒 Private Subroom — Zero-Knowledge isolated personal room</option>
        </select>
      </div>

      <div className="form-field">
        <label style={{ color: '#0d9488', fontWeight: 700 }}>Base Parent Subroom</label>
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {BRANCH_ICONS[b.type]} {b.name} ({b.type})
            </option>
          ))}
        </select>
      </div>

      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
