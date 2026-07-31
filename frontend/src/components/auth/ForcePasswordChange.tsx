import { useState, type FormEvent } from 'react';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../shared/Toast';
import { NulltorLogo } from '../shared/NulltorLogo';

interface ForcePasswordChangeProps {
  onSuccess: () => void;
  onCancel?: () => void;
  embedded?: boolean;
}

export function ForcePasswordChange({ onSuccess, onCancel, embedded = false }: ForcePasswordChangeProps) {
  const user = useAuthStore((s) => s.user);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.changePassword(oldPw, newPw);
      toast('Password updated successfully', 'success');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setLoading(false);
    }
  }

  const formContent = (
    <form className="login-form" onSubmit={handleSubmit} style={{ marginTop: embedded ? 0 : '16px' }}>
      {!embedded && (
        <div className="login-logo" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
          <NulltorLogo size="md" />
        </div>
      )}

      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
        Enter your current password and a new 8+ character password for <strong>{user?.username}</strong>.
      </p>

      <div className="form-field">
        <label htmlFor="fp-old" style={{ color: '#0d9488', fontWeight: 700 }}>
          Current Password
        </label>
        <input
          id="fp-old"
          type="password"
          value={oldPw}
          onChange={(e) => setOldPw(e.target.value)}
          placeholder="Current password"
          autoComplete="current-password"
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="fp-new" style={{ color: '#0d9488', fontWeight: 700 }}>
          New Passphrase
        </label>
        <input
          id="fp-new"
          type="password"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          placeholder="Min. 8 characters"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      {error && <p className="form-error">{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '14px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
        {onCancel && (
          <button
            type="button"
            className="btn"
            style={{
              background: 'rgba(13, 148, 136, 0.15)',
              border: '1px solid #0d9488',
              color: '#14b8a6',
              fontWeight: 600,
            }}
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={loading || !oldPw || !newPw}>
          {loading ? 'Updating…' : 'Update Password'}
        </button>
      </div>
    </form>
  );

  if (embedded) {
    return formContent;
  }

  return (
    <div className="login-screen">
      <div className="login-glow" />
      <div className="login-card" style={{ maxWidth: 440 }}>
        {formContent}
      </div>
    </div>
  );
}
