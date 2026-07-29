import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsApi, type ProjectRead } from '../../api/projects';
import { branchesApi } from '../../api/branches';
import { useProjectStore } from '../../store/projectStore';
import { Modal } from '../shared/Modal';
import { MembersModal } from './MembersModal';
import { toast } from '../shared/Toast';
import { ApiError } from '../../api/client';

interface ProjectCardProps {
  project: ProjectRead;
  branchCount?: number;
  myRole?: string;
  currentUserId?: string;
  onDeleted?: () => void;
}

export function ProjectCard({ project, branchCount = 0, myRole, currentUserId, onDeleted }: ProjectCardProps) {
  const navigate = useNavigate();
  const [showMembers, setShowMembers] = useState(false);
  const setProject = useProjectStore((s) => s.setProject);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to completely delete "${project.name}"?`)) return;
    try {
      await projectsApi.delete(project.id);
      toast('Project deleted', 'success');
      if (onDeleted) onDeleted();
    } catch (e: any) {
      toast(e.message || 'Failed to delete project', 'error');
    }
  }

  function open() {
    setProject(project);
    navigate(`/ide/${project.id}`);
  }

  const updatedAt = new Date(project.updated_at).toLocaleDateString();

  return (
    <>
      <div className="project-card" onClick={open} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && open()}>
      <div className="project-icon">📁</div>
      <div className="project-info">
        <div className="project-name">
          {project.name}
          {myRole && (
            <span className={`badge badge-role-${myRole}`}>{myRole}</span>
          )}
        </div>
        {project.description && (
          <div className="project-desc">{project.description}</div>
        )}
        <div className="project-card-actions" style={{ marginTop: 8, marginBottom: 8, display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setShowMembers(true); }}>
            👥 Manage Members
          </button>
          {(myRole === 'superadmin' || currentUserId === project.owner_id) && (
            <button className="btn btn-danger btn-sm" onClick={handleDelete}>
              Delete
            </button>
          )}
        </div>
        <div className="project-meta">
          <span className="project-meta-item">
            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Z"/></svg>
            {branchCount} branch{branchCount !== 1 ? 'es' : ''}
          </span>
          <span className="project-meta-item">
            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25v-8.5C0 2.784.784 2 1.75 2ZM1.5 12.251c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25Z"/></svg>
            Updated {updatedAt}
          </span>
        </div>
      </div>
      </div>
      {showMembers && (
        <MembersModal
          projectId={project.id}
          projectName={project.name}
          onClose={() => setShowMembers(false)}
        />
      )}
    </>
  );
}

export function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: ProjectRead) => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [roomKey, setRoomKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!name.trim() || !roomKey.trim()) return;
    setLoading(true);
    setError('');
    try {
      const p = await projectsApi.create(name.trim(), desc.trim() || undefined);
      sessionStorage.setItem(`roomkey-${p.id}`, roomKey.trim());
      toast(`Project "${p.name}" created`, 'success');
      onCreated(p);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to create project');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="New Project (Room)"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={loading || !name.trim() || !roomKey.trim()}>
            {loading ? 'Creating…' : 'Create Project'}
          </button>
        </>
      }
    >
      <div className="form-field">
        <label>Project Name</label>
        <input
          type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="my-awesome-project" autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
      </div>
      <div className="form-field">
        <label>Room Key (End-to-End Encryption)</label>
        <input
          type="password" value={roomKey} onChange={(e) => setRoomKey(e.target.value)}
          placeholder="Secret Passphrase"
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>This key is never sent to the server. You must share it with your team.</span>
      </div>
      <div className="form-field">
        <label>Description (optional)</label>
        <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What is this project about?" />
      </div>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
