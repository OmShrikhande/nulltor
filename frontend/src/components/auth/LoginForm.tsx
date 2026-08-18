import { useState, type FormEvent } from 'react';
import { useAuthStore } from '../../store/authStore';
import { ApiError } from '../../api/client';
import { NulltorLogo } from '../shared/NulltorLogo';

interface LoginFormProps {
  onSuccess: () => void;
}

const FLOATING_WORDS = [
  { text: 'Nulltor', left: '4%', delay: '-1s' },
  { text: 'E2EE Encryption', left: '15%', delay: '-5s' },
  { text: 'Real-Time Yjs', left: '26%', delay: '-2s' },
  { text: 'Branch Subrooms', left: '38%', delay: '-7s' },
  { text: 'Zero-Knowledge', left: '50%', delay: '-3s' },
  { text: 'FastAPI Backend', left: '62%', delay: '-8s' },
  { text: 'Socket.IO Sync', left: '74%', delay: '-4s' },
  { text: 'Monaco Editor', left: '85%', delay: '-6s' },
  { text: 'Quantum Mesh', left: '93%', delay: '-1.5s' },
  { text: 'Collaborative IDE', left: '10%', delay: '-3.5s' },
  { text: 'SQLite / Postgres', left: '22%', delay: '-6.5s' },
  { text: 'CRDT Deltas', left: '32%', delay: '-0.5s' },
  { text: 'Audit Telemetry', left: '44%', delay: '-4.5s' },
  { text: 'Nulltor Engine', left: '55%', delay: '-8.5s' },
  { text: 'System Governance', left: '68%', delay: '-2.5s' },
  { text: 'Multi-User Sync', left: '78%', delay: '-7.5s' },
  { text: 'AES-256 GCM', left: '88%', delay: '-5.2s' },
  { text: 'Passphrase Vault', left: '6%', delay: '-7.8s' },
  { text: 'Nulltor IDE', left: '48%', delay: '-1.8s' },
  { text: 'Code Workspace', left: '82%', delay: '-3.2s' },
];

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
      <div className="floating-words-bg">
        {FLOATING_WORDS.map((item, idx) => (
          <div
            key={idx}
            className="floating-word"
            style={{ left: item.left, animationDelay: item.delay }}
          >
            &lt;/&gt; {item.text}
          </div>
        ))}
      </div>

      <div className="login-glow" />

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
