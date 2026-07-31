import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsApi, type ProjectRead, type ProjectStatus } from '../../api/projects';
import { useProjectStore } from '../../store/projectStore';
import { Modal } from '../shared/Modal';
import { MembersModal } from './MembersModal';
import { toast } from '../shared/Toast';

interface ProjectCardProps {
  project: ProjectRead;
  branchCount?: number;
  myRole?: string;
  currentUserId?: string;
  onDeleted?: () => void;
  onUpdated?: () => void;
}

export function ProjectCard({ project, branchCount = 0, myRole, currentUserId, onDeleted, onUpdated }: ProjectCardProps) {
  const navigate = useNavigate();
  const [showMembers, setShowMembers] = useState(false);
  const [status, setStatus] = useState<ProjectStatus>((project.status as ProjectStatus) || 'live');
  const [loadingStatus, setLoadingStatus] = useState(false);
  const setProject = useProjectStore((s) => s.setProject);

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    e.stopPropagation();
    const newStatus = e.target.value as ProjectStatus;
    setStatus(newStatus);
    setLoadingStatus(true);
    try {
      await projectsApi.update(project.id, { status: newStatus });
      toast(`Project status updated to ${newStatus}`, 'success');
      if (onUpdated) onUpdated();
    } catch {
      toast('Failed to update status', 'error');
    } finally {
      setLoadingStatus(false);
    }
  }

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

  const isOwner = project.owner_id === currentUserId || myRole === 'superadmin' || myRole === 'lead';

  return (
    <>
      <div
        className="project-card-small"
        onClick={open}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && open()}
      >
        <div className="project-card-top">
          <div className="project-folder-icon">📁</div>

          <div onClick={(e) => e.stopPropagation()}>
            <span className={`status-pill ${status}`}>
              ●
              <select
                value={status}
                disabled={loadingStatus}
                onChange={handleStatusChange}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  fontWeight: 600,
                  fontSize: '11px',
                  cursor: 'pointer',
                  outline: 'none',
                  textTransform: 'capitalize',
                }}
              >
                <option value="live" style={{ background: 'var(--bg-1)', color: 'var(--text-primary)' }}>Live</option>
                <option value="offline" style={{ background: 'var(--bg-1)', color: 'var(--text-primary)' }}>Offline</option>
                <option value="completed" style={{ background: 'var(--bg-1)', color: 'var(--text-primary)' }}>Completed</option>
              </select>
            </span>
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{project.name}</span>
            {myRole && <span className="branch-pill main" style={{ fontSize: '10px', padding: '1px 6px' }}>{myRole}</span>}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '36px' }}>
            {project.description || 'No description provided'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid var(--border)', fontSize: '11.5px', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🌿 {branchCount} branch{branchCount !== 1 ? 'es' : ''}</span>
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: '2px 6px', fontSize: '11px' }}
              onClick={(e) => { e.stopPropagation(); setShowMembers(true); }}
            >
              👥 Members
            </button>
          </div>

          {isOwner && (
            <button
              className="btn-icon"
              style={{ width: '22px', height: '22px', color: 'var(--danger)' }}
              onClick={handleDelete}
              title="Delete Project"
            >
              🗑
            </button>
          )}
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

export function CreateProjectModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (p: ProjectRead) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('live');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const p = await projectsApi.create(name.trim(), description.trim() || undefined, status);
      toast(`Project "${p.name}" created`, 'success');
      onCreated(p);
    } catch (e: any) {
      setError(e.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Create New Project Workspace"
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
            {loading ? 'Creating…' : 'Create Workspace'}
          </button>
        </>
      }
    >
      <div className="form-field">
        <label style={{ color: '#0d9488', fontWeight: 700 }}>Project Folder Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-awesome-app"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
      </div>

      <div className="form-field">
        <label style={{ color: '#0d9488', fontWeight: 700 }}>Description (Optional)</label>
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief summary of the codebase…"
        />
      </div>

      <div className="form-field">
        <label style={{ color: '#0d9488', fontWeight: 700 }}>Initial Status Option</label>
        <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
          <option value="live">🟢 Live — active development & real-time collaboration</option>
          <option value="offline">⚪ Offline — local storage only</option>
        </select>
      </div>

      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
