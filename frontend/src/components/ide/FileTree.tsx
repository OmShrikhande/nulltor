import { useState } from 'react';
import { type DirectoryNode, directoriesApi } from '../../api/directories';
import { useEditorStore } from '../../store/editorStore';
import { toast } from '../shared/Toast';
import { Modal } from '../shared/Modal';

interface FileTreeProps {
  tree: DirectoryNode[];
  loading: boolean;
  projectId: string;
  branchId: string | null;
  onRefresh: () => void;
}

// ─── VS Code Style File Type Icon Resolver ─────────────────────────────────
function getVSCodeFileIcon(fileName: string, isDir: boolean, isOpen: boolean) {
  if (isDir) {
    return (
      <span style={{ color: '#f59e0b', fontSize: '15px', display: 'inline-flex', alignItems: 'center' }}>
        {isOpen ? '📂' : '📁'}
      </span>
    );
  }

  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

  switch (ext) {
    case 'js':
    case 'jsx':
      return <span style={{ color: '#f7df1e', fontWeight: 800, fontSize: '11px', fontFamily: 'var(--font-mono)' }}>JS</span>;
    case 'ts':
    case 'tsx':
      return <span style={{ color: '#3178c6', fontWeight: 800, fontSize: '11px', fontFamily: 'var(--font-mono)' }}>TS</span>;
    case 'json':
      return <span style={{ color: '#fbbf24', fontSize: '13px' }}>{'{ }'}</span>;
    case 'html':
      return <span style={{ color: '#ea580c', fontWeight: 700, fontSize: '11px' }}>HTML</span>;
    case 'css':
    case 'scss':
      return <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: '11px' }}>#</span>;
    case 'py':
      return <span style={{ color: '#38bdf8', fontSize: '13px' }}>🐍</span>;
    case 'md':
      return <span style={{ color: '#818cf8', fontWeight: 700, fontSize: '11px' }}>M↓</span>;
    case 'svg':
    case 'png':
    case 'jpg':
    case 'jpeg':
      return <span style={{ color: '#c084fc', fontSize: '13px' }}>🖼️</span>;
    default:
      return (
        <svg viewBox="0 0 16 16" fill="currentColor" width={14} height={14} style={{ color: 'var(--text-muted)' }}>
          <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Z" />
        </svg>
      );
  }
}

export function FileTree({ tree, loading, projectId, branchId, onRefresh }: FileTreeProps) {
  const setOpenFile = useEditorStore((s) => s.setOpenFile);
  const openFile = useEditorStore((s) => s.openFile);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState<'file' | 'dir'>('file');
  const [createParentId, setCreateParentId] = useState<string | null>(null);

  const toggleDir = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const collapseAll = () => setExpanded(new Set());

  if (loading) {
    return (
      <div className="file-tree-body" style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <>
      {/* VS Code Style Header */}
      <div className="file-tree-header" style={{ height: '36px', padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)' }}>
        <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>
          Explorer
        </span>

        {/* Quick Action Icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            className="btn-icon"
            style={{ width: 22, height: 22, fontSize: 12, color: 'var(--text-secondary)' }}
            title="New File"
            onClick={() => { setCreateType('file'); setCreateParentId(null); setShowCreate(true); }}
          >
            📄+
          </button>
          <button
            className="btn-icon"
            style={{ width: 22, height: 22, fontSize: 12, color: 'var(--text-secondary)' }}
            title="New Folder"
            onClick={() => { setCreateType('dir'); setCreateParentId(null); setShowCreate(true); }}
          >
            📁+
          </button>
          <button
            className="btn-icon"
            style={{ width: 22, height: 22, fontSize: 12, color: 'var(--text-secondary)' }}
            title="Refresh Explorer"
            onClick={onRefresh}
          >
            🔄
          </button>
          <button
            className="btn-icon"
            style={{ width: 22, height: 22, fontSize: 12, color: 'var(--text-secondary)' }}
            title="Collapse All Folders"
            onClick={collapseAll}
          >
            📂
          </button>
        </div>
      </div>

      {/* File Tree List */}
      <div className="file-tree-body" style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {tree.length === 0 && (
          <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            No files in workspace.<br />Click 📄+ to create a file.
          </div>
        )}
        {tree.map((node) => (
          <TreeNodeRow
            key={node.id}
            node={node}
            depth={0}
            expanded={expanded}
            onToggle={toggleDir}
            onSelect={setOpenFile}
            selectedId={openFile?.id ?? null}
            onCreateIn={(id, type) => { setCreateType(type); setCreateParentId(id); setShowCreate(true); }}
          />
        ))}
      </div>

      {showCreate && (
        <CreateNodeModal
          projectId={projectId}
          branchId={branchId}
          parentId={createParentId}
          initialType={createType}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); onRefresh(); }}
        />
      )}
    </>
  );
}

interface TreeNodeRowProps {
  node: DirectoryNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (node: DirectoryNode) => void;
  selectedId: string | null;
  onCreateIn: (id: string, type: 'file' | 'dir') => void;
}

function TreeNodeRow({ node, depth, expanded, onToggle, onSelect, selectedId, onCreateIn }: TreeNodeRowProps) {
  const isDir = node.type === 'dir';
  const isOpen = expanded.has(node.id);
  const isSelected = selectedId === node.id;

  return (
    <>
      <div
        className={`tree-node${isSelected ? ' selected' : ''}`}
        style={{
          paddingLeft: `${12 + depth * 16}px`,
          paddingRight: '12px',
          height: '28px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12.5px',
          cursor: 'pointer',
          borderRadius: 'var(--radius-xs)',
          margin: '1px 4px',
          position: 'relative',
          background: isSelected ? 'rgba(1, 239, 172, 0.12)' : 'transparent',
          borderLeft: isSelected ? '3px solid var(--aurora-mint)' : '3px solid transparent',
          color: isSelected ? 'var(--aurora-mint)' : 'var(--text-primary)',
          fontWeight: isSelected ? 700 : 400,
        }}
        onClick={() => {
          if (isDir) onToggle(node.id);
          else onSelect(node);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (isDir) onCreateIn(node.id, 'file');
        }}
        title={isDir ? `${node.name} (Folder - Click to toggle)` : node.name}
      >
        {/* Chevron Arrow for Folders */}
        {isDir ? (
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', width: '10px', display: 'inline-block', transition: 'transform 0.15s ease', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
            ▶
          </span>
        ) : (
          <span style={{ width: '10px' }} />
        )}

        {/* Icon */}
        {getVSCodeFileIcon(node.name, isDir, isOpen)}

        {/* File / Folder Name */}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginLeft: '2px' }}>
          {node.name}
        </span>
      </div>

      {/* Indented Children */}
      {isDir && isOpen && node.children?.map((child) => (
        <TreeNodeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          onSelect={onSelect}
          selectedId={selectedId}
          onCreateIn={onCreateIn}
        />
      ))}
    </>
  );
}

function CreateNodeModal({
  projectId,
  branchId,
  parentId,
  initialType,
  onClose,
  onCreated,
}: {
  projectId: string;
  branchId: string | null;
  parentId: string | null;
  initialType: 'file' | 'dir';
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'file' | 'dir'>(initialType);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      await directoriesApi.create(
        projectId,
        { name: name.trim(), type, parent_id: parentId ?? undefined },
        branchId ?? undefined
      );
      toast(`"${name}" created successfully`, 'success');
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={`Create New ${type === 'dir' ? 'Folder' : 'File'}`}
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
          <button className="btn btn-primary" onClick={handleCreate} disabled={loading || !name.trim()}>
            {loading ? 'Creating…' : 'Create'}
          </button>
        </>
      }
    >
      <div className="form-field">
        <label style={{ color: '#0d9488', fontWeight: 700 }}>Item Type</label>
        <select value={type} onChange={(e) => setType(e.target.value as 'file' | 'dir')}>
          <option value="file">📄 File</option>
          <option value="dir">📁 Folder</option>
        </select>
      </div>

      <div className="form-field">
        <label style={{ color: '#0d9488', fontWeight: 700 }}>Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={type === 'dir' ? 'src' : 'main.ts'}
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
      </div>

      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
