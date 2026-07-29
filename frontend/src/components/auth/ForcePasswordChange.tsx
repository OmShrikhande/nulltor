import { useState, FormEvent } from 'react';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../shared/Toast';

interface ForcePasswordChangeProps {
  onSuccess: () => void;
}

export function ForcePasswordChange({ onSuccess }: ForcePasswordChangeProps) {
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
      toast('Password updated — please log in again', 'success');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-glow" />
      <div className="login-card">
        <div className="login-logo">
          <span className="logo-icon">◈</span>
          <span className="logo-text">nulltor</span>
        </div>
        <h1 className="login-title">Update Password</h1>
        <p className="login-sub">Please set a new password to continue, {user?.username}.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="fp-old">Temporary Password</label>
            <input
              id="fp-old"
              type="password"
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="fp-new">New Password</label>
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
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
