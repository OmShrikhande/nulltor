import { useState, type FormEvent } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../context/ThemeContext';
import { ApiError } from '../../api/client';
import { NulltorLogo } from '../shared/NulltorLogo';
import { User, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, Sun, Moon } from 'lucide-react';

interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const login = useAuthStore((s) => s.login);
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      const msg = err instanceof ApiError ? err.message : 'Invalid credentials. Please check your username and password.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      {/* Top Right Theme Toggle */}
      <div style={{ position: 'absolute', top: '24px', right: '28px', zIndex: 50 }}>
        <button
          className="theme-toggle-btn"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 14px',
            borderRadius: '9999px',
            background: 'var(--bg-1)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: 'var(--shadow-sm)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent-secondary)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
        >
          {theme === 'dark' ? (
            <>
              <Sun size={14} style={{ color: '#f59e0b' }} />
              <span>Light</span>
            </>
          ) : (
            <>
              <Moon size={14} style={{ color: '#6366f1' }} />
              <span>Dark</span>
            </>
          )}
        </button>
      </div>

      {/* Main Login Card */}
      <div
        className="animate-fade-in-up"
        style={{
          width: '100%',
          maxWidth: '430px',
          background: 'var(--bg-1)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '40px 36px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.25)',
          position: 'relative',
          zIndex: 10,
          margin: '20px',
        }}
      >
        {/* Branding & Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ marginBottom: '12px' }}>
            <NulltorLogo size="xl" showText={true} />
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', margin: 0 }}>
            Welcome to Nulltor Studio
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12.5px', marginTop: '6px', margin: 0 }}>
            Collaborative Zero-Knowledge Cloud IDE
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Email / Username Field */}
          <div>
            <label
              htmlFor="login-email"
              style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}
            >
              Email or Username
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <User
                size={16}
                style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)', pointerEvents: 'none' }}
              />
              <input
                id="login-email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="superadmin or user@domain.com"
                autoComplete="username"
                required
                style={{
                  width: '100%',
                  padding: '10px 14px 10px 38px',
                  fontSize: '13.5px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--accent-secondary)';
                  e.target.style.boxShadow = '0 0 0 3px var(--accent-glow)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--border)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label
              htmlFor="login-password"
              style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}
            >
              Password
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Lock
                size={16}
                style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)', pointerEvents: 'none' }}
              />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                required
                style={{
                  width: '100%',
                  padding: '10px 38px 10px 38px',
                  fontSize: '13.5px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--accent-secondary)';
                  e.target.style.boxShadow = '0 0 0 3px var(--accent-glow)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--border)';
                  e.target.style.boxShadow = 'none';
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Error Notice */}
          {error && (
            <div className="form-error" style={{
              padding: '8px 12px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              fontSize: '12px',
              fontWeight: 500,
            }}>
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '4px',
              padding: '11px 18px',
              background: 'var(--accent-primary)',
              color: '#ffffff',
              fontSize: '13.5px',
              fontWeight: 700,
              borderRadius: '10px',
              border: 'none',
              cursor: loading ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px var(--accent-glow)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.background = 'var(--accent-secondary)';
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.background = 'var(--accent-primary)';
            }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'inline-block', width: '14px', height: '14px', borderRadius: '50%', border: '2px solid #fff', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                Authenticating...
              </span>
            ) : (
              <>
                <span>Sign in to Workspace</span>
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        {/* Security / E2EE Footer Tag */}
        <div style={{
          marginTop: '28px',
          paddingTop: '16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          color: 'var(--text-muted)',
          fontSize: '11px',
          fontWeight: 500,
        }}>
          <ShieldCheck size={14} style={{ color: '#10b981' }} />
          <span>Zero-Knowledge AES-256 · E2EE Encrypted</span>
        </div>
      </div>
    </div>
  );
}
