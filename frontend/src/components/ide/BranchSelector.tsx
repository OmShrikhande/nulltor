import React, { useState, useRef, useEffect } from 'react';
import { type BranchRead, type BranchType, branchesApi } from '../../api/branches';
import { Modal } from '../shared/Modal';
import { toast } from '../shared/Toast';
import { GitMerge, Lock, GitBranch, ChevronDown, Check, Plus, Search } from 'lucide-react';

interface BranchSelectorProps {
  branches: BranchRead[];
  currentBranch: BranchRead | null;
  projectId: string;
  onBranchChange: (branch: BranchRead) => void;
  onRefresh: () => void;
}

const BRANCH_ICONS: Record<BranchType, React.ReactNode> = {
  main: <GitBranch size={13} />,
  subroom: <GitMerge size={13} />,
  private: <Lock size={13} />,
};

const BRANCH_COLORS: Record<BranchType, { bg: string; text: string; border: string }> = {
  main: { bg: 'rgba(1, 239, 172, 0.12)', text: '#01efac', border: 'rgba(1, 239, 172, 0.3)' },
  subroom: { bg: 'rgba(56, 189, 248, 0.12)', text: '#38bdf8', border: 'rgba(56, 189, 248, 0.3)' },
  private: { bg: 'rgba(192, 132, 252, 0.12)', text: '#c084fc', border: 'rgba(192, 132, 252, 0.3)' },
};

const BRANCH_LABELS: Record<BranchType, string> = {
  main: 'Main Room',
  subroom: 'Parallel Subroom',
  private: 'Private Vault',
};

export function BranchSelector({ branches, currentBranch, projectId, onBranchChange, onRefresh }: BranchSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const branchType = currentBranch?.type ?? 'main';
  const colorStyle = BRANCH_COLORS[branchType] || BRANCH_COLORS.main;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const filteredBranches = branches.filter(b => 
    b.name.toLowerCase().includes(search.toLowerCase()) || 
    BRANCH_LABELS[b.type].toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="branch-selector" ref={dropdownRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      
      {/* Custom Modern Trigger Pill */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 12px',
          borderRadius: '20px',
          background: colorStyle.bg,
          border: `1px solid ${colorStyle.border}`,
          color: colorStyle.text,
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          boxShadow: isOpen ? `0 0 12px ${colorStyle.border}` : 'none',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center' }}>
          {BRANCH_ICONS[branchType]}
        </span>
        <span style={{ textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.04em', opacity: 0.8 }}>
          {BRANCH_LABELS[branchType]}:
        </span>
        <span style={{ fontWeight: 800, color: '#ffffff', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {currentBranch?.name || 'main'}
        </span>
        <ChevronDown size={13} style={{ opacity: 0.7, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {/* Floating Popover Dropdown */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            width: '280px',
            background: 'var(--bg-1)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)',
            zIndex: 999,
            overflow: 'hidden',
            animation: 'fadeIn 0.15s ease',
          }}
        >
          {/* Header & Search */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-0)', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
              <Search size={13} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Switch or search subroom..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                  width: '100%',
                }}
                autoFocus
              />
            </div>
          </div>

          {/* Subroom List */}
          <div style={{ maxHeight: '220px', overflowY: 'auto', padding: '4px' }}>
            {filteredBranches.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                No subrooms found.
              </div>
            ) : (
              filteredBranches.map((b) => {
                const isSelected = b.id === currentBranch?.id;
                const bStyle = BRANCH_COLORS[b.type] || BRANCH_COLORS.main;
                return (
                  <div
                    key={b.id}
                    onClick={() => {
                      onBranchChange(b);
                      setIsOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(1, 239, 172, 0.08)' : 'transparent',
                      transition: 'background 0.1s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'var(--bg-2)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span style={{ color: bStyle.text, display: 'flex' }}>
                        {BRANCH_ICONS[b.type]}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '12.5px', fontWeight: isSelected ? 700 : 500, color: isSelected ? '#01efac' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.name}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {BRANCH_LABELS[b.type]}
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <Check size={14} style={{ color: '#01efac', flexShrink: 0 }} />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Action */}
          <div style={{ padding: '8px', borderTop: '1px solid var(--border)', background: 'var(--bg-0)' }}>
            <button
              className="btn btn-sm"
              onClick={() => {
                setIsOpen(false);
                setShowCreate(true);
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                background: 'rgba(1, 239, 172, 0.12)',
                border: '1px solid rgba(1, 239, 172, 0.3)',
                color: '#01efac',
                fontWeight: 700,
                fontSize: '11.5px',
                padding: '6px 12px',
                borderRadius: '6px',
              }}
            >
              <Plus size={13} /> Create Subroom
            </button>
          </div>
        </div>
      )}

      {/* Create Modal */}
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
          placeholder="e.g. feature-auth or mesh-optimizer"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
      </div>

      <div className="form-field">
        <label style={{ color: '#0d9488', fontWeight: 700 }}>Subroom Architecture Type</label>
        <select value={type} onChange={(e) => setType(e.target.value as BranchType)}>
          <option value="subroom">Parallel Subroom — Multi-developer collaborative branch</option>
          <option value="private">Private Subroom — Zero-Knowledge isolated personal room</option>
        </select>
      </div>

      <div className="form-field">
        <label style={{ color: '#0d9488', fontWeight: 700 }}>Base Parent Subroom</label>
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({BRANCH_LABELS[b.type] || b.type})
            </option>
          ))}
        </select>
      </div>

      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
