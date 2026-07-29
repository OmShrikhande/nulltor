import { useState, FormEvent } from 'react';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../shared/Toast';
import { ApiError } from '../../api/client';

interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      onSuccess();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Login failed';
      setError(msg);
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
        <h1 className="login-title">Welcome back</h1>
        <p className="login-sub">Sign in to your workspace</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="superadmin@nulltor.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
