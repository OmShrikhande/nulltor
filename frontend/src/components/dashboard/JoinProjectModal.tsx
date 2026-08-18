import { useState } from 'react';
import { projectsApi, type ProjectRead } from '../../api/projects';
import { Modal } from '../shared/Modal';
import { toast } from '../shared/Toast';
import { Key, ArrowRight } from 'lucide-react';

export function JoinProjectModal({
  onClose,
  onJoined,
}: {
  onClose: () => void;
  onJoined: (project: ProjectRead) => void;
}) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleJoin() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed || trimmed.length !== 8) {
      setError('Invite code must be exactly 8 characters');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const project = await projectsApi.joinByCode(trimmed);
      toast(`Joined project "${project.name}" successfully!`, 'success');
      onJoined(project);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid or expired invite code');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Join Project via Invite Code"
      onClose={onClose}
      footer={
        <>
          <button className="btn" style={{ background: 'rgba(13,148,136,0.15)', border: '1px solid #0d9488', color: '#14b8a6', fontWeight: 600 }} onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleJoin}
            disabled={loading || code.trim().length !== 8}
          >
            {loading ? 'Joining…' : <><ArrowRight size={14} /> Join Project</>}
          </button>
        </>
      }
    >
      <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(1,239,172,0.06)', border: '1px solid rgba(1,239,172,0.2)', borderRadius: 'var(--radius)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Key size={16} style={{ color: 'var(--aurora-mint)', marginTop: 2, flexShrink: 0 }} />
        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
          Enter the 8-character invite code shared with you by a project admin or lead.
          You'll be added instantly with the role configured by the project owner.
        </p>
      </div>

      <div className="form-field">
        <label style={{ color: '#0d9488', fontWeight: 700 }}>Invite Code</label>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
          placeholder="e.g. ABC12XYZ"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          style={{ letterSpacing: '0.15em', fontWeight: 700, fontSize: 18, textAlign: 'center', textTransform: 'uppercase' }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{code.length}/8 characters</span>
      </div>

      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
