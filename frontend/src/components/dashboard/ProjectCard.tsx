import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsApi, type ProjectRead, type ProjectStatus } from '../../api/projects';
import { useProjectStore } from '../../store/projectStore';
import { Modal } from '../shared/Modal';
import { MembersModal } from './MembersModal';
import { toast } from '../shared/Toast';
import { Folder, GitBranch, Users, Trash2, Key, Copy, RefreshCw, ShieldCheck, MoreVertical } from 'lucide-react';
import CryptoJS from 'crypto-js';

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
  const [showMenu, setShowMenu] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [currentCode, setCurrentCode] = useState(project.invite_code);
  const [regenLoading, setRegenLoading] = useState(false);
  const [status, setStatus] = useState<ProjectStatus>((project.status as ProjectStatus) || 'live');
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [showResetPassphrase, setShowResetPassphrase] = useState(false);
  const [resetMode, setResetMode] = useState<'migrate' | 'force'>('migrate');
  const [oldPassphrase, setOldPassphrase] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState('');
  const setProject = useProjectStore((s) => s.setProject);

  // Only the creator (owner), admins, and superadmins can see/manage the invite code
  const canSeeInviteCode = project.owner_id === currentUserId || myRole === 'superadmin' || myRole === 'admin';
  // Admin and superadmin can reset the passphrase
  const canResetPassphrase = myRole === 'superadmin' || myRole === 'admin';
  const isOwner = project.owner_id === currentUserId || myRole === 'superadmin' || myRole === 'lead';

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

  async function handleDelete(e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (!confirm(`Are you sure you want to completely delete "${project.name}"?`)) return;
    try {
      await projectsApi.delete(project.id);
      toast('Project deleted', 'success');
      if (onDeleted) onDeleted();
    } catch (e: any) {
      toast(e.message || 'Failed to delete project', 'error');
    }
  }

  async function handleRegenCode(e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (!confirm('Regenerate invite code? The old code will stop working immediately.')) return;
    setRegenLoading(true);
    try {
      const updated = await projectsApi.regenerateCode(project.id);
      setCurrentCode(updated.invite_code);
      toast('Invite code regenerated!', 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to regenerate code', 'error');
    } finally {
      setRegenLoading(false);
    }
  }

  async function handleResetPassphrase(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassphrase.trim()) return;
    if (resetMode === 'migrate' && !oldPassphrase.trim()) {
      toast('Old passphrase is required for migration', 'error');
      return;
    }
    
    setResetLoading(true);
    setMigrationStatus('');
    try {
      if (resetMode === 'force') {
        await projectsApi.resetPassphrase(project.id, newPassphrase.trim());
        Object.keys(sessionStorage)
          .filter(k => k === `roomkey-${project.id}`)
          .forEach(k => sessionStorage.removeItem(k));
        toast('Force reset complete. All data was wiped.', 'success');
      } else {
        setMigrationStatus('Fetching encrypted data...');
        const { snapshots, commits } = await projectsApi.getEncryptedData(project.id);
        
        setMigrationStatus('Re-encrypting snapshots...');
        const PBKDF2_ITERATIONS = 10000;
        const KEY_SIZE = 256 / 32;
        
        // Derive old and new keys
        const oldKey = CryptoJS.PBKDF2(oldPassphrase.trim(), 'nulltor-static-salt-v1', { keySize: KEY_SIZE, iterations: PBKDF2_ITERATIONS });
        const newKey = CryptoJS.PBKDF2(newPassphrase.trim(), 'nulltor-static-salt-v1', { keySize: KEY_SIZE, iterations: PBKDF2_ITERATIONS });
        
        const decrypt = (ciphertext: string) => {
          const [ivHex, data] = ciphertext.split(':');
          if (!ivHex || !data) throw new Error('Invalid ciphertext format');
          const iv = CryptoJS.enc.Hex.parse(ivHex);
          const decrypted = CryptoJS.AES.decrypt(data, oldKey, { iv });
          if (decrypted.sigBytes < 0) throw new Error('Decryption failed');
          return decrypted.toString(CryptoJS.enc.Utf8);
        };
        
        const encrypt = (plaintext: string) => {
          const iv = CryptoJS.lib.WordArray.random(128 / 8);
          const encrypted = CryptoJS.AES.encrypt(plaintext, newKey, { iv });
          return iv.toString() + ':' + encrypted.toString();
        };

        const new_snapshots = snapshots.map(s => ({
          ...s,
          data: encrypt(decrypt(s.data))
        }));
        
        setMigrationStatus('Re-encrypting commits...');
        const new_commits = commits.map(c => ({
          ...c,
          snapshot: encrypt(decrypt(c.snapshot))
        }));
        
        setMigrationStatus('Uploading migrated data...');
        await projectsApi.migratePassphrase(project.id, {
          old_passphrase: oldPassphrase.trim(),
          new_passphrase: newPassphrase.trim(),
          new_snapshots,
          new_commits
        });
        
        // Update local storage key so the user stays authenticated seamlessly
        sessionStorage.setItem(`roomkey-${project.id}`, newPassphrase.trim());
        toast('Room passphrase migrated successfully! Data was preserved.', 'success');
      }
      
      setShowResetPassphrase(false);
      setNewPassphrase('');
      setOldPassphrase('');
      setMigrationStatus('');
    } catch (err: any) {
      toast(err.message || (resetMode === 'migrate' ? 'Failed to migrate data. Is the old passphrase correct?' : 'Failed to reset passphrase'), 'error');
      setMigrationStatus('');
    } finally {
      setResetLoading(false);
    }
  }

  function open() {
    setProject(project);
    navigate(`/ide/${project.id}`);
  }

  return (
    <>
      <div
        className="project-card-small"
        onClick={open}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && open()}
        style={{
          background: '#15161a',
          border: '1px solid #22242c',
          borderRadius: '12px',
          padding: '16px 18px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '140px',
          position: 'relative'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontWeight: 800, fontSize: '15px', color: '#f8fafc', letterSpacing: '-0.01em' }}>
              {project.name}
            </span>
            <div onClick={(e) => e.stopPropagation()}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: status === 'live' ? '#10b981' : status === 'offline' ? '#94a3b8' : '#38bdf8',
                  background: status === 'live' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                  padding: '2px 8px',
                  borderRadius: '10px'
                }}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            </div>
          </div>

          <div style={{ fontSize: '12.5px', color: '#94a3b8', lineHeight: '1.45', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {project.description || 'No description provided'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', marginTop: '12px', borderTop: '1px solid #22242c', fontSize: '12px', color: '#94a3b8' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <GitBranch size={13} /> {branchCount} branch{branchCount !== 1 ? 'es' : ''}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: '2px 6px', fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '4px', color: '#cbd5e1' }}
              onClick={(e) => { e.stopPropagation(); setShowMembers(true); }}
            >
              <Users size={12} /> Members
            </button>
          </div>

          {(isOwner || canSeeInviteCode || canResetPassphrase) && (
            <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
              <button
                className="btn-icon"
                style={{ width: '24px', height: '24px', color: '#94a3b8' }}
                onClick={() => setShowMenu(!showMenu)}
                title="More actions"
              >
                <MoreVertical size={15} />
              </button>

              {showMenu && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    right: 0,
                    marginBottom: '6px',
                    background: '#18191e',
                    border: '1px solid #2a2d36',
                    borderRadius: '8px',
                    padding: '4px',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                    zIndex: 50,
                    minWidth: '155px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}
                  onMouseLeave={() => setShowMenu(false)}
                >
                  {canSeeInviteCode && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ width: '100%', justifyContent: 'flex-start', fontSize: '11.5px', padding: '6px 10px' }}
                      onClick={() => { setShowMenu(false); setShowCode(true); }}
                    >
                      <Key size={12} /> Show invite code
                    </button>
                  )}
                  {canResetPassphrase && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ width: '100%', justifyContent: 'flex-start', fontSize: '11.5px', padding: '6px 10px' }}
                      onClick={() => { setShowMenu(false); setShowResetPassphrase(true); }}
                    >
                      <ShieldCheck size={12} /> Project settings
                    </button>
                  )}
                  {isOwner && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ width: '100%', justifyContent: 'flex-start', fontSize: '11.5px', padding: '6px 10px', color: '#ef4444' }}
                      onClick={() => { setShowMenu(false); handleDelete(); }}
                    >
                      <Trash2 size={12} /> Delete workspace
                    </button>
                  )}
                </div>
              )}
            </div>
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

      {/* Project Settings Modal */}
      {showResetPassphrase && (
        <Modal
          title="⚙️ Project Settings"
          onClose={() => { setShowResetPassphrase(false); setNewPassphrase(''); setOldPassphrase(''); setMigrationStatus(''); setResetMode('migrate'); }}
          footer={
            <>
              <button className="btn" onClick={() => { setShowResetPassphrase(false); setNewPassphrase(''); setOldPassphrase(''); setMigrationStatus(''); setResetMode('migrate'); }}>Close</button>

              <button className={`btn ${resetMode === 'force' ? 'btn-danger' : 'btn-primary'}`} onClick={handleResetPassphrase as any} disabled={resetLoading || !newPassphrase.trim() || (resetMode === 'migrate' && !oldPassphrase.trim())}>
                {resetLoading ? 'Processing…' : (resetMode === 'force' ? 'Force Reset (Wipe Data)' : 'Migrate Data')}
              </button>
            </>
          }
        >
          <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
            <h4 style={{ color: 'var(--danger)', marginBottom: '12px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={14} /> Danger Zone: Manage Passphrase
            </h4>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button
                className={`btn btn-sm ${resetMode === 'migrate' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ flex: 1 }}
                onClick={() => setResetMode('migrate')}
                type="button"
              >
                Migrate (Preserve Data)
              </button>
              <button
                className={`btn btn-sm ${resetMode === 'force' ? 'btn-danger' : 'btn-ghost'}`}
                style={{ flex: 1 }}
                onClick={() => setResetMode('force')}
                type="button"
              >
                Force Reset (Wipe Data)
              </button>
            </div>
            
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px', lineHeight: 1.6 }}>
            {resetMode === 'migrate' ? (
              <>
                <strong style={{ color: '#10b981' }}>Migrate Data:</strong> Re-encrypts all files and commits using your old passphrase before applying the new one. <strong style={{ color: 'var(--text-primary)' }}>No data is lost.</strong>
              </>
            ) : (
              <>
                ⚠️ <strong style={{ color: '#f87171' }}>Force Reset:</strong> Immediately invalidates the current room passphrase. <strong style={{ color: '#f87171' }}>All encrypted files will be permanently wiped</strong> because they cannot be decrypted. Only use if the old passphrase is lost!
              </>
            )}
          </p>
          <form onSubmit={handleResetPassphrase}>
            {resetMode === 'migrate' && (
              <div className="form-field" style={{ marginBottom: '12px' }}>
                <label style={{ color: '#0d9488', fontWeight: 700 }}>Current Passphrase (Required)</label>
                <input
                  type="password"
                  value={oldPassphrase}
                  onChange={(e) => setOldPassphrase(e.target.value)}
                  placeholder="Enter the current passphrase…"
                  autoFocus
                  required
                  disabled={resetLoading}
                />
              </div>
            )}
            <div className="form-field">
              <label style={{ color: resetMode === 'force' ? '#f87171' : '#0d9488', fontWeight: 700 }}>New Room Passphrase</label>
              <input
                type="password"
                value={newPassphrase}
                onChange={(e) => setNewPassphrase(e.target.value)}
                placeholder="Enter a strong new passphrase…"
                autoFocus={resetMode === 'force'}
                required
                disabled={resetLoading}
              />
            </div>
            {migrationStatus && (
              <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--aurora-mint)', textAlign: 'center', fontWeight: 'bold' }}>
                <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite', marginRight: '4px', verticalAlign: 'middle' }} />
                {migrationStatus}
              </div>
            )}
          </form>
          </div>
        </Modal>
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
          <option value="live">Live — active development & real-time collaboration</option>
          <option value="offline">Offline — local storage only</option>
        </select>
      </div>

      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
