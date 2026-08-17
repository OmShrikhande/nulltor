import { useState, type FormEvent } from 'react';
import { useAuthStore } from '../../store/authStore';
import { ApiError } from '../../api/client';
import { NulltorLogo } from '../shared/NulltorLogo';

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
<<<<<<< Updated upstream
      {/* High-frequency Animated Floating Background Words */}
      <div className="floating-words-bg">
        {FLOATING_WORDS.map((item, idx) => (
          <div
            key={idx}
            className="floating-word"
            style={{ left: item.left, animationDelay: item.delay }}
          >
            {item.text}
          </div>
        ))}
      </div>

      <div className="login-glow" />

=======
>>>>>>> Stashed changes
      <div className="login-card">
        <div className="login-logo">
          <NulltorLogo size="lg" />
        </div>
        <h1 className="login-title">Nulltor Enterprise</h1>
        <p className="login-sub">Sign in to your Collaborative Nexus Workspace</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="login-email">Email or Username</label>
            <input
              id="login-email"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="superadmin@nulltor.com or superadmin"
              autoComplete="username"
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
            {loading ? 'Signing in…' : 'Sign in to Nulltor'}
          </button>
        </form>
      </div>
    </div>
  );
}
