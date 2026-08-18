import { useState, type FormEvent } from 'react';
import { useAuthStore } from '../../store/authStore';
import { ApiError } from '../../api/client';
import { NulltorLogo } from '../shared/NulltorLogo';

interface LoginFormProps {
  onSuccess: () => void;
}

const FLOATING_WORDS = [
  { text: 'Nulltor Enterprise', left: '3%', delay: '-1s', duration: '14s', size: '15px', colorClass: 'cyan' },
  { text: 'E2EE AES-256-GCM', left: '14%', delay: '-5s', duration: '11s', size: '13px', colorClass: 'blue' },
  { text: 'Real-Time Yjs CRDT', left: '26%', delay: '-2s', duration: '16s', size: '16px', colorClass: 'purple' },
  { text: 'Parallel Subrooms', left: '39%', delay: '-8s', duration: '13s', size: '14px', colorClass: 'teal' },
  { text: 'Zero-Knowledge Vault', left: '52%', delay: '-3s', duration: '15s', size: '15px', colorClass: 'mint' },
  { text: 'FastAPI Async Engine', left: '65%', delay: '-10s', duration: '12s', size: '13px', colorClass: 'blue' },
  { text: 'Socket.IO Mesh Sync', left: '77%', delay: '-4s', duration: '17s', size: '15px', colorClass: 'purple' },
  { text: 'Monaco Core Editor', left: '88%', delay: '-6s', duration: '13s', size: '14px', colorClass: 'cyan' },
  { text: 'Quantum Mesh Matrix', left: '94%', delay: '-1.5s', duration: '18s', size: '12px', colorClass: 'teal' },
  { text: 'Peer Awareness Multi-Cursor', left: '8%', delay: '-3.5s', duration: '15s', size: '13px', colorClass: 'mint' },
  { text: 'PostgreSQL / SQLite Dual DB', left: '21%', delay: '-7s', duration: '12s', size: '14px', colorClass: 'blue' },
  { text: 'CRDT Delta Compression', left: '33%', delay: '-0.5s', duration: '16s', size: '15px', colorClass: 'cyan' },
  { text: 'Audit Telemetry & Governance', left: '46%', delay: '-9s', duration: '14s', size: '13px', colorClass: 'purple' },
  { text: 'State Vector Diff Sync', left: '58%', delay: '-11s', duration: '19s', size: '14px', colorClass: 'teal' },
  { text: 'DevBot AI Autonomous Agent', left: '71%', delay: '-2.5s', duration: '13s', size: '15px', colorClass: 'mint' },
  { text: 'Merge Request 3-Way Diff', left: '82%', delay: '-7.5s', duration: '15s', size: '14px', colorClass: 'blue' },
  { text: 'Encrypted Snapshot Vault', left: '90%', delay: '-5.2s', duration: '12s', size: '13px', colorClass: 'cyan' },
  { text: 'Zero-Leak Ephemeral Memory', left: '5%', delay: '-8.5s', duration: '17s', size: '14px', colorClass: 'purple' },
  { text: 'Sandboxed Python WebWorker', left: '42%', delay: '-1.8s', duration: '14s', size: '15px', colorClass: 'mint' },
  { text: 'Collaborative IDE Hub', left: '60%', delay: '-4.8s', duration: '11s', size: '16px', colorClass: 'blue' },
  { text: 'E2EE Key Derivation PBKDF2', left: '80%', delay: '-12s', duration: '16s', size: '13px', colorClass: 'teal' },
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
      {/* High-Tech Animated Floating Background Words */}
      <div className="floating-words-bg" aria-hidden="true">
        {FLOATING_WORDS.map((item, idx) => (
          <div
            key={idx}
            className={`floating-word word-${item.colorClass}`}
            style={{
              left: item.left,
              animationDelay: item.delay,
              animationDuration: item.duration,
              fontSize: item.size,
            }}
          >
            <span className="floating-word-symbol">&lt;/&gt;</span> {item.text}
          </div>
        ))}
      </div>

      {/* Radiant Background Glow */}
      <div className="login-glow" />

      {/* Login Card */}
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
