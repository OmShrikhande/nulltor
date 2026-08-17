import { useState } from 'react';
import { type DirectoryNode, directoriesApi } from '../../api/directories';
import { useEditorStore } from '../../store/editorStore';
import { toast } from '../shared/Toast';
import { Modal } from '../shared/Modal';
<<<<<<< Updated upstream
=======
import {
  File, Code2, RefreshCw, FolderOpen, Image as ImageIcon, Folder,
  FileJson, FileText, FileCode2, Terminal, Database, FileSpreadsheet,
  Pencil, Trash2, FilePlus, FolderPlus, ChevronRight, ChevronDown, Check, X,
} from 'lucide-react';
>>>>>>> Stashed changes

interface FileTreeProps {
  tree: DirectoryNode[];
  loading: boolean;
  projectId: string;
  branchId: string | null;
  onRefresh: () => void;
  onClose?: () => void;
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

export function FileTree({ tree, loading, projectId, branchId, onRefresh, onClose }: FileTreeProps) {
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
    <div className="file-tree-container" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
          {onClose && (
            <button
              className="btn-icon"
              style={{ width: 22, height: 22, fontSize: 12, color: 'var(--text-secondary)', marginLeft: '4px' }}
              title="Close Explorer"
              onClick={onClose}
            >
              <X size={14} />
            </button>
          )}
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
<<<<<<< Updated upstream
    </>
=======

      {/* Delete Confirmation */}
      {deleteNode && (
        <Modal
          title={`Delete ${deleteNode.type === 'dir' ? 'Folder' : 'File'}`}
          onClose={() => setDeleteNode(null)}
          footer={
            <>
              <button className="btn" style={{ background: 'rgba(13,148,136,0.15)', border: '1px solid #0d9488', color: '#14b8a6' }} onClick={() => setDeleteNode(null)}>Cancel</button>
              <button className="btn" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#ef4444', fontWeight: 700 }} onClick={handleDelete} disabled={deleteLoading}>
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        >
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Are you sure you want to delete <strong style={{ color: 'var(--text-primary)' }}>"{deleteNode.name}"</strong>?
            {deleteNode.type === 'dir' && ' This will delete all files inside it.'} This cannot be undone.
          </p>
        </Modal>
      )}
    </div>
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
  const isSelected = selectedId === node.id;
=======
  const isFileActive = !isDir && selectedId === node.id;
  const isRenaming = renameNode?.id === node.id;
  const [isHovered, setIsHovered] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const fileErrors = useEditorStore((s) => s.fileErrors);
  const hasError = !isDir && (fileErrors[node.id] || 0) > 0;

  useEffect(() => {
    if (isRenaming) renameInputRef.current?.select();
  }, [isRenaming]);
>>>>>>> Stashed changes

  return (
    <>
      <div
        className={`tree-node${isFileActive ? ' selected' : ''}`}
        style={{
<<<<<<< Updated upstream
          paddingLeft: `${12 + depth * 16}px`,
          paddingRight: '12px',
=======
          paddingLeft: `${10 + depth * 14}px`,
          paddingRight: '8px',
>>>>>>> Stashed changes
          height: '28px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12.5px',
          cursor: 'pointer',
          borderRadius: '4px',
          margin: '1px 4px',
          position: 'relative',
<<<<<<< Updated upstream
          background: isSelected ? 'rgba(1, 239, 172, 0.12)' : 'transparent',
          borderLeft: isSelected ? '3px solid var(--aurora-mint)' : '3px solid transparent',
          color: isSelected ? 'var(--aurora-mint)' : 'var(--text-primary)',
          fontWeight: isSelected ? 700 : 400,
=======
          background: isFileActive ? 'rgba(255, 255, 255, 0.08)' : (isHovered ? 'var(--bg-2)' : 'transparent'),
          borderLeft: isFileActive ? '2px solid rgba(255, 255, 255, 0.35)' : '2px solid transparent',
          color: hasError ? '#f87171' : (isFileActive ? '#ffffff' : 'var(--text-primary)'),
          fontWeight: isFileActive ? 600 : 400,
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
        {/* File / Folder Name */}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginLeft: '2px' }}>
          {node.name}
        </span>
=======
        {/* File / Folder Name or Inline Rename Input */}
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={onRenameCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameCommit();
              if (e.key === 'Escape') { setRenameValue(node.name); onRenameCommit(); }
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1, background: 'var(--bg-0)', border: '1px solid var(--accent-secondary)',
              borderRadius: 3, color: 'var(--text-primary)', padding: '1px 4px',
              fontSize: '12px', outline: 'none',
            }}
            autoFocus
          />
        ) : (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginLeft: '2px', color: hasError ? '#f87171' : undefined }}>
            {node.name}
          </span>
        )}

        {hasError && !isRenaming && (
          <span
            style={{
              fontSize: '10px',
              color: '#f87171',
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: '3px',
              background: 'rgba(239, 68, 68, 0.15)',
              marginLeft: '4px',
            }}
            title="Syntax / Lint error detected in file"
          >
            ● Error
          </span>
        )}

        {/* Quick Action Icons on Folder Hover (like VS Code) */}
        {isDir && isHovered && !isRenaming && (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '2px', marginLeft: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="btn-icon"
              style={{ width: 20, height: 20, padding: 0, color: 'var(--text-secondary)', background: 'transparent' }}
              title={`New File inside ${node.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onCreateIn(node.id, 'file');
              }}
            >
              <FilePlus size={13} />
            </button>
            <button
              className="btn-icon"
              style={{ width: 20, height: 20, padding: 0, color: 'var(--text-secondary)', background: 'transparent' }}
              title={`New Folder inside ${node.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onCreateIn(node.id, 'dir');
              }}
            >
              <FolderPlus size={13} />
            </button>
          </div>
        )}
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
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
=======
          <button className="btn btn-ghost" onClick={onClose}>
>>>>>>> Stashed changes
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={loading || !name.trim()}>
            {loading ? 'Creating…' : 'Create'}
          </button>
        </>
      }
    >
<<<<<<< Updated upstream
      <div className="form-field">
        <label style={{ color: '#0d9488', fontWeight: 700 }}>Item Type</label>
        <select value={type} onChange={(e) => setType(e.target.value as 'file' | 'dir')}>
          <option value="file">📄 File</option>
          <option value="dir">📁 Folder</option>
        </select>
      </div>

      <div className="form-field">
        <label style={{ color: '#0d9488', fontWeight: 700 }}>Name</label>
=======
      <div className="form-field" style={{ marginBottom: 12 }}>
        <label style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 12 }}>Item Type</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            type="button"
            className="btn btn-sm"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              background: type === 'file' ? 'var(--accent-primary)' : 'var(--bg-2)',
              border: type === 'file' ? '1px solid var(--accent-primary)' : '1px solid var(--border)',
              color: type === 'file' ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: 600,
              padding: '6px 12px',
            }}
            onClick={() => setType('file')}
          >
            <FileText size={14} /> File
          </button>
          <button
            type="button"
            className="btn btn-sm"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              background: type === 'dir' ? 'var(--accent-primary)' : 'var(--bg-2)',
              border: type === 'dir' ? '1px solid var(--accent-primary)' : '1px solid var(--border)',
              color: type === 'dir' ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: 600,
              padding: '6px 12px',
            }}
            onClick={() => setType('dir')}
          >
            <Folder size={14} /> Folder
          </button>
        </div>
      </div>

      <div className="form-field" style={{ marginBottom: 12 }}>
        <label style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 12 }}>Destination Folder</label>
        <select
          value={targetParentId ?? ''}
          onChange={(e) => setTargetParentId(e.target.value || null)}
          style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border)', padding: '6px 10px', borderRadius: '4px', color: 'var(--text-primary)' }}
        >
          <option value="">/ (Root Workspace)</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id!}>
              /{f.path}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field" style={{ marginBottom: 8 }}>
        <label style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 12 }}>
          {type === 'dir' ? 'Folder Name' : 'File Name'}
        </label>
>>>>>>> Stashed changes
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={type === 'dir' ? 'src' : 'main.ts'}
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
      </div>

<<<<<<< Updated upstream
=======
      {activeFolderName && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, background: 'var(--bg-2)', padding: '4px 8px', borderRadius: 4 }}>
          Will be created inside: <strong style={{ color: 'var(--accent-secondary)' }}>/{activeFolderName}</strong>
        </div>
      )}

>>>>>>> Stashed changes
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
