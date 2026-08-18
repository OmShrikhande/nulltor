import { useState, useEffect, useRef, useCallback } from 'react';
import { type DirectoryNode, directoriesApi } from '../../api/directories';
import { useEditorStore } from '../../store/editorStore';
import { toast } from '../shared/Toast';
import { Modal } from '../shared/Modal';
import {
  File, Code2, RefreshCw, FolderOpen, Image as ImageIcon, Folder,
  FileJson, FileText, FileCode2, Terminal, Database, FileSpreadsheet,
  Pencil, Trash2, FilePlus, FolderPlus, ChevronRight, X,
} from 'lucide-react';

interface FileTreeProps {
  tree: DirectoryNode[];
  loading: boolean;
  projectId: string;
  branchId: string | null;
  onRefresh: () => void;
  onClose?: () => void;
}

// ─── Context Menu State ───────────────────────────────────────────────────────
interface ContextMenuState {
  node: DirectoryNode | null;
  x: number;
  y: number;
}

interface FolderOption {
  id: string | null;
  path: string;
}

function getAllFolders(nodes: DirectoryNode[], parentPath = ''): FolderOption[] {
  let list: FolderOption[] = [];
  for (const n of nodes) {
    if (n.type === 'dir') {
      const fullPath = parentPath ? `${parentPath}/${n.name}` : `${n.name}`;
      list.push({ id: n.id, path: fullPath });
      if (n.children && n.children.length > 0) {
        list = list.concat(getAllFolders(n.children, fullPath));
      }
    }
  }
  return list;
}

// ─── VS Code Style File Type Icon Resolver ─────────────────────────────────
function getVSCodeFileIcon(fileName: string, isDir: boolean, isOpen: boolean) {
  if (isDir) {
    return (
      <span style={{ color: '#dcb67a', display: 'inline-flex', alignItems: 'center' }}>
        {isOpen ? <FolderOpen size={15} fill="#dcb67a" /> : <Folder size={15} fill="#dcb67a" />}
      </span>
    );
  }
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'js':
    case 'jsx':
      return <span style={{ color: '#f7df1e' }}><FileCode2 size={15} /></span>;
    case 'ts':
    case 'tsx':
      return <span style={{ color: '#3178c6' }}><FileCode2 size={15} /></span>;
    case 'json':
      return <span style={{ color: '#fbbf24' }}><FileJson size={15} /></span>;
    case 'html':
      return <span style={{ color: '#ea580c' }}><Code2 size={15} /></span>;
    case 'css':
    case 'scss':
      return <span style={{ color: '#38bdf8' }}><FileCode2 size={15} /></span>;
    case 'py':
      return (
        <svg viewBox="0 0 128 128" width="15" height="15" fill="none">
          <path fill="#3776AB" d="M64.66 11.23C32.17 11.23 27 25.1 27 25.1v17.5h38.25v5.33H19.7c-21.75 0-22.37 32-15 45.47 4.12 7.42 16.27 10.9 16.27 10.9v-15.6s.1-12.7 12.82-12.7h29c13.76 0 14.54-9.33 14.54-9.33v-38c0-12.8-13.6-17.44-32.67-17.44zm-14 10.45c4 0 7.25 3.2 7.25 7.1s-3.26 7.1-7.25 7.1c-4.02 0-7.27-3.2-7.27-7.1 0-3.9 3.25-7.1 7.27-7.1z" />
          <path fill="#FFD43B" d="M63.34 116.77c32.5 0 37.67-13.87 37.67-13.87v-17.5H62.75v-5.33h45.6c21.75 0 22.37-32 15-45.47-4.13-7.42-16.28-10.9-16.28-10.9v15.6s-.1 12.7-12.83 12.7h-29c-13.76 0-14.54 9.33-14.54 9.33v38c0 12.8 13.6 17.44 32.67 17.44zm14-10.45c-4 0-7.25-3.2-7.25-7.1s3.26-7.1 7.25-7.1c4.02 0 7.27-3.2 7.27-7.1 0-3.9 3.25-7.1 7.27-7.1z" />
        </svg>
      );
    case 'md':
      return <span style={{ color: '#818cf8' }}><FileText size={15} /></span>;
    case 'svg':
    case 'png':
    case 'jpg':
    case 'jpeg':
      return <span style={{ color: '#c084fc' }}><ImageIcon size={15} /></span>;
    case 'sql':
      return <span style={{ color: '#f59e0b' }}><Database size={15} /></span>;
    case 'csv':
      return <span style={{ color: '#10b981' }}><FileSpreadsheet size={15} /></span>;
    case 'sh':
    case 'bat':
      return <span style={{ color: '#a855f7' }}><Terminal size={15} /></span>;
    default:
      return <span style={{ color: 'var(--text-muted)' }}><File size={15} /></span>;
  }
}

export function FileTree({ tree, loading, projectId, branchId, onRefresh, onClose }: FileTreeProps) {
  const setOpenFile = useEditorStore((s) => s.setOpenFile);
  const openFile = useEditorStore((s) => s.openFile);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState<'file' | 'dir'>('file');
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renameNode, setRenameNode] = useState<DirectoryNode | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteNode, setDeleteNode] = useState<DirectoryNode | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const toggleDir = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const collapseAll = () => setExpanded(new Set());

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: DirectoryNode | null) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ node, x: e.clientX, y: e.clientY });
  }, []);

  async function handleRename() {
    if (!renameNode || !renameValue.trim() || renameValue === renameNode.name) {
      setRenameNode(null);
      return;
    }
    try {
      await directoriesApi.rename(projectId, renameNode.id, { name: renameValue.trim() });
      toast(`Renamed to "${renameValue.trim()}"`, 'success');
      onRefresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Rename failed', 'error');
    } finally {
      setRenameNode(null);
    }
  }

  async function handleDelete() {
    if (!deleteNode) return;
    setDeleteLoading(true);
    try {
      await directoriesApi.delete(projectId, deleteNode.id);
      toast(`"${deleteNode.name}" deleted`, 'success');
      if (openFile?.id === deleteNode.id) setOpenFile(null);
      onRefresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Delete failed', 'error');
    } finally {
      setDeleteLoading(false);
      setDeleteNode(null);
    }
  }

  const allFolders = getAllFolders(tree);

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
      <div
        className="file-tree-header"
        style={{
          height: '36px',
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-1)',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>
          Explorer
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          <button
            className="btn-icon"
            style={{ width: 22, height: 22, fontSize: 12, color: 'var(--text-secondary)' }}
            title={selectedFolderId ? 'New File in Selected Folder' : 'New File at Root'}
            onClick={() => {
              setCreateType('file');
              setCreateParentId(selectedFolderId);
              setShowCreate(true);
            }}
          >
            <FilePlus size={14} />
          </button>
          <button
            className="btn-icon"
            style={{ width: 22, height: 22, fontSize: 12, color: 'var(--text-secondary)' }}
            title={selectedFolderId ? 'New Folder in Selected Folder' : 'New Folder at Root'}
            onClick={() => {
              setCreateType('dir');
              setCreateParentId(selectedFolderId);
              setShowCreate(true);
            }}
          >
            <FolderPlus size={14} />
          </button>
          <button className="btn-icon" style={{ width: 22, height: 22, fontSize: 12, color: 'var(--text-secondary)' }} title="Refresh Explorer" onClick={onRefresh}>
            <RefreshCw size={14} />
          </button>
          <button className="btn-icon" style={{ width: 22, height: 22, fontSize: 12, color: 'var(--text-secondary)' }} title="Collapse All Folders" onClick={collapseAll}>
            <FolderOpen size={14} />
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
      <div
        className="file-tree-body"
        style={{ flex: 1, overflowY: 'auto', padding: '6px 0', minHeight: '120px' }}
        onContextMenu={(e) => handleContextMenu(e, null)}
        onClick={() => setSelectedFolderId(null)}
      >
        {tree.length === 0 && (
          <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            No files in workspace.<br />
            <button
              className="btn btn-sm"
              style={{ marginTop: 10, background: 'rgba(1,239,172,0.15)', border: '1px solid rgba(1,239,172,0.4)', color: 'var(--aurora-mint)', fontSize: 11 }}
              onClick={() => { setCreateType('file'); setCreateParentId(null); setShowCreate(true); }}
            >
              <FilePlus size={13} style={{ marginRight: 4 }} /> Create File
            </button>
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
            selectedFolderId={selectedFolderId}
            onSelectFolder={(id) => setSelectedFolderId(id)}
            onCreateIn={(id, type) => {
              setCreateType(type);
              setCreateParentId(id);
              setShowCreate(true);
            }}
            onContextMenu={handleContextMenu}
            renameNode={renameNode}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            onRenameCommit={handleRename}
          />
        ))}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 9999,
            background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 180, overflow: 'hidden',
            animation: 'fadeIn 0.1s ease',
          }}
        >
          {contextMenu.node ? (
            <>
              {contextMenu.node.type === 'dir' && (
                <>
                  <ContextItem
                    icon={<FilePlus size={13} />}
                    label={`New File in "${contextMenu.node.name}"`}
                    onClick={() => {
                      setCreateType('file');
                      setCreateParentId(contextMenu.node!.id);
                      setShowCreate(true);
                      setContextMenu(null);
                    }}
                  />
                  <ContextItem
                    icon={<FolderPlus size={13} />}
                    label={`New Folder in "${contextMenu.node.name}"`}
                    onClick={() => {
                      setCreateType('dir');
                      setCreateParentId(contextMenu.node!.id);
                      setShowCreate(true);
                      setContextMenu(null);
                    }}
                  />
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                </>
              )}
              <ContextItem icon={<Pencil size={13} />} label="Rename" onClick={() => { setRenameNode(contextMenu.node); setRenameValue(contextMenu.node!.name); setContextMenu(null); }} />
              <ContextItem icon={<Trash2 size={13} />} label="Delete" danger onClick={() => { setDeleteNode(contextMenu.node); setContextMenu(null); }} />
            </>
          ) : (
            <>
              <ContextItem
                icon={<FilePlus size={13} />}
                label="New File (Root)"
                onClick={() => {
                  setCreateType('file');
                  setCreateParentId(null);
                  setShowCreate(true);
                  setContextMenu(null);
                }}
              />
              <ContextItem
                icon={<FolderPlus size={13} />}
                label="New Folder (Root)"
                onClick={() => {
                  setCreateType('dir');
                  setCreateParentId(null);
                  setShowCreate(true);
                  setContextMenu(null);
                }}
              />
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              <ContextItem icon={<RefreshCw size={13} />} label="Refresh" onClick={() => { onRefresh(); setContextMenu(null); }} />
            </>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateNodeModal
          projectId={projectId}
          branchId={branchId}
          parentId={createParentId}
          folders={allFolders}
          initialType={createType}
          onClose={() => setShowCreate(false)}
          onCreated={(newNode) => {
            setShowCreate(false);
            if (createParentId) {
              setExpanded((prev) => new Set(prev).add(createParentId));
            }
            onRefresh();
            if (newNode && newNode.type === 'file') {
              setOpenFile(newNode);
            }
          }}
        />
      )}

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
  );
}

function ContextItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
        fontSize: 12.5, cursor: 'pointer', color: danger ? '#ef4444' : 'var(--text-primary)',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.1)' : 'var(--bg-2)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {icon}{label}
    </div>
  );
}

interface TreeNodeRowProps {
  node: DirectoryNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (node: DirectoryNode) => void;
  selectedId: string | null;
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onCreateIn: (id: string, type: 'file' | 'dir') => void;
  onContextMenu: (e: React.MouseEvent, node: DirectoryNode) => void;
  renameNode: DirectoryNode | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onRenameCommit: () => void;
}

function TreeNodeRow({
  node, depth, expanded, onToggle, onSelect, selectedId, selectedFolderId, onSelectFolder, onCreateIn,
  onContextMenu, renameNode, renameValue, setRenameValue, onRenameCommit,
}: TreeNodeRowProps) {
  const isDir = node.type === 'dir';
  const isOpen = expanded.has(node.id);
  const isFileActive = !isDir && selectedId === node.id;
  const isRenaming = renameNode?.id === node.id;
  const [isHovered, setIsHovered] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const fileErrors = useEditorStore((s) => s.fileErrors);
  const hasError = !isDir && (fileErrors[node.id] || 0) > 0;

  useEffect(() => {
    if (isRenaming) renameInputRef.current?.select();
  }, [isRenaming]);

  return (
    <>
      <div
        className={`tree-node${isFileActive ? ' selected' : ''}`}
        style={{
          paddingLeft: `${10 + depth * 14}px`,
          paddingRight: '8px',
          height: '28px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '12.5px',
          cursor: 'pointer',
          borderRadius: '4px',
          margin: '1px 4px',
          position: 'relative',
          background: isFileActive ? 'rgba(255, 255, 255, 0.08)' : (isHovered ? 'var(--bg-2)' : 'transparent'),
          borderLeft: isFileActive ? '2px solid rgba(255, 255, 255, 0.35)' : '2px solid transparent',
          color: hasError ? '#f87171' : (isFileActive ? '#ffffff' : 'var(--text-primary)'),
          fontWeight: isFileActive ? 600 : 400,
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          if (isRenaming) return;
          if (isDir) {
            onToggle(node.id);
            onSelectFolder(node.id);
          } else {
            onSelect(node);
            onSelectFolder(node.parent_id ?? null);
          }
        }}
        onContextMenu={(e) => onContextMenu(e, node)}
        title={isDir ? `${node.name} (Click to expand, right-click for options)` : node.name}
      >
        {/* Chevron Arrow for Folders */}
        {isDir ? (
          <span
            style={{
              color: 'var(--text-secondary)',
              width: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'transform 0.15s ease',
              transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)'
            }}
          >
            <ChevronRight size={12} />
          </span>
        ) : (
          <span style={{ width: '12px' }} />
        )}

        {/* Icon */}
        {getVSCodeFileIcon(node.name, isDir, isOpen)}

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
          selectedFolderId={selectedFolderId}
          onSelectFolder={onSelectFolder}
          onCreateIn={onCreateIn}
          onContextMenu={onContextMenu}
          renameNode={renameNode}
          renameValue={renameValue}
          setRenameValue={setRenameValue}
          onRenameCommit={onRenameCommit}
        />
      ))}
    </>
  );
}

function CreateNodeModal({
  projectId, branchId, parentId, folders, initialType, onClose, onCreated,
}: {
  projectId: string;
  branchId: string | null;
  parentId: string | null;
  folders: FolderOption[];
  initialType: 'file' | 'dir';
  onClose: () => void;
  onCreated: (node?: DirectoryNode) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'file' | 'dir'>(initialType);
  const [targetParentId, setTargetParentId] = useState<string | null>(parentId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const newNode = await directoriesApi.create(
        projectId,
        { name: name.trim(), type, parent_id: targetParentId ?? undefined },
        branchId ?? undefined
      );
      toast(`"${name}" created successfully`, 'success');
      onCreated(newNode);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setLoading(false);
    }
  }

  const activeFolderName = folders.find((f) => f.id === targetParentId)?.path;

  return (
    <Modal
      title={`Create New ${type === 'dir' ? 'Folder' : 'File'}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={loading || !name.trim()}>
            {loading ? 'Creating…' : 'Create'}
          </button>
        </>
      }
    >
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
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={type === 'dir' ? 'components' : 'index.ts'}
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
      </div>

      {activeFolderName && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, background: 'var(--bg-2)', padding: '4px 8px', borderRadius: 4 }}>
          Will be created inside: <strong style={{ color: 'var(--accent-secondary)' }}>/{activeFolderName}</strong>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
