import { useState, useCallback } from 'react';
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

export function FileTree({ tree, loading, projectId, branchId, onRefresh }: FileTreeProps) {
  const setOpenFile = useEditorStore((s) => s.setOpenFile);
  const openFile = useEditorStore((s) => s.openFile);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);

  const toggleDir = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (loading) {
    return (
      <div className="file-tree-body" style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <>
      <div className="file-tree-header">
        <span>Explorer</span>
        <button
          className="btn btn-icon btn-ghost btn-sm"
          title="New file"
          onClick={() => { setCreateParentId(null); setShowCreate(true); }}
        >+</button>
      </div>
      <div className="file-tree-body">
        {tree.length === 0 && (
          <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 12 }}>
            No files yet. Create one with +.
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
            onCreateIn={(id) => { setCreateParentId(id); setShowCreate(true); }}
          />
        ))}
      </div>
      {showCreate && (
        <CreateNodeModal
          projectId={projectId}
          branchId={branchId}
          parentId={createParentId}
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
  onCreateIn: (id: string) => void;
}

function TreeNodeRow({ node, depth, expanded, onToggle, onSelect, selectedId, onCreateIn }: TreeNodeRowProps) {
  const isDir = node.type === 'dir';
  const isOpen = expanded.has(node.id);
  const isSelected = selectedId === node.id;

  return (
    <>
      <div
        className={`tree-node${isSelected ? ' selected' : ''}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => {
          if (isDir) onToggle(node.id);
          else onSelect(node);
        }}
        onContextMenu={(e) => { e.preventDefault(); if (isDir) onCreateIn(node.id); }}
        title={isDir ? 'Click to expand/collapse, right-click to create inside' : node.name}
      >
        {isDir ? (
          <svg viewBox="0 0 16 16" fill="currentColor" style={{ color: '#f59e0b' }}>
            {isOpen
              ? <path d="M.513 1.513A1.75 1.75 0 0 1 1.75 1h3.5c.55 0 1.07.26 1.4.7l.9 1.2a.25.25 0 0 0 .2.1H13.25c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 14H1.75A1.75 1.75 0 0 1 0 12.25V2.75c0-.464.184-.91.513-1.237Z"/>
              : <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/>
            }
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" fill="currentColor" style={{ color: 'var(--text-muted)' }}>
            <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Z"/>
          </svg>
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
      </div>
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

function CreateNodeModal({ projectId, branchId, parentId, onClose, onCreated }: {
  projectId: string;
  branchId: string | null;
  parentId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'file' | 'dir'>('file');
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
      toast(`"${name}" created`, 'success');
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={`New ${type === 'dir' ? 'Folder' : 'File'}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={loading || !name.trim()}>
            {loading ? 'Creating…' : 'Create'}
          </button>
        </>
      }
    >
      <div className="form-field">
        <label>Type</label>
        <select value={type} onChange={(e) => setType(e.target.value as 'file' | 'dir')}>
          <option value="file">File</option>
          <option value="dir">Folder</option>
        </select>
      </div>
      <div className="form-field">
        <label>Name</label>
        <input
          type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder={type === 'dir' ? 'my-folder' : 'main.py'}
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
      </div>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
