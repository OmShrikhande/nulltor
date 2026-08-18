import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useTheme } from '../context/ThemeContext';
import { projectsApi, type ProjectRead } from '../api/projects';
import { NulltorLogo } from '../components/shared/NulltorLogo';
import { ForcePasswordChange } from '../components/auth/ForcePasswordChange';
import { Modal } from '../components/shared/Modal';
import { toast } from '../components/shared/Toast';
import { Folder, FileText, Shield, User, Settings, Lock, Sun, Moon, LogOut } from 'lucide-react';

export function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useTheme();

  const [projects, setProjects] = useState<ProjectRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPasswordChange, setShowPasswordChange] = useState(false);

  const getDesignation = (role?: string) => {
    switch (role) {
      case 'superadmin': return 'Principal Platform Architect & System Superadmin';
      case 'admin': return 'Lead Engineering Manager & Project Admin';
      case 'member': default: return 'Core Project Contributor & Member';
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await projectsApi.list();
        setProjects(data.items);
      } catch {
        toast('Failed to load user project details', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const initials = user?.username?.slice(0, 2).toUpperCase() ?? '??';

  return (
    <div style={{ height: '100vh', width: '100vw', background: 'var(--bg-0)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Universal Workspace Nexus Topbar */}
      <header
        style={{
          height: '48px',
          background: 'var(--header-bg, #0d0d0d)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          flexShrink: 0,
          zIndex: 50,
        }}
      >
        {/* Left: Branding & Core Navigation Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>
            <NulltorLogo size="sm" />
          </div>

          <nav style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
            >
              <Folder size={14} />
              <span>Workspaces</span>
            </button>

            <button
              onClick={() => navigate('/logs')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
            >
              <FileText size={14} />
              <span>Audit Telemetry</span>
            </button>

            {user?.role === 'superadmin' && (
              <button
                onClick={() => navigate('/users')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
              >
                <Shield size={14} />
                <span>Governance & Team</span>
              </button>
            )}

            <button
              onClick={() => navigate('/settings')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
            >
              <Settings size={14} />
              <span>Settings</span>
            </button>
          </nav>
        </div>

        {/* Right: Theme Toggle & Circular Profile Avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            style={{ padding: '5px 8px', borderRadius: '6px' }}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>

          <button
            onClick={() => navigate('/profile')}
            title={`My Profile (${user?.username || 'User'})`}
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
              color: '#ffffff',
              fontSize: '11.5px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #60a5fa',
              boxShadow: '0 2px 10px rgba(37, 99, 235, 0.5)',
              cursor: 'pointer',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              padding: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.08)';
              e.currentTarget.style.boxShadow = '0 3px 14px rgba(37, 99, 235, 0.65)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 2px 10px rgba(37, 99, 235, 0.5)';
            }}
          >
            {initials}
          </button>
        </div>
      </header>

      {/* Main Workspace Canvas with Fixed Height IDE Traffic Dot Card */}
      <main style={{ flex: 1, padding: '16px 24px 20px', maxWidth: '1600px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        <div
          className="ide-traffic-dot-card"
          style={{
            flex: 1,
            minHeight: 0,
            background: 'var(--bg-1)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            boxShadow: 'var(--shadow)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Card Header with 3 Traffic Dots */}
          <div
            style={{
              height: '42px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px',
              flexShrink: 0,
              userSelect: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }}></span>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }}></span>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
              </div>
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <User size={14} style={{ color: '#2563eb' }} />
                User Profile & Identity Credentials
              </span>
            </div>

            <button className="btn btn-primary btn-sm" onClick={() => setShowPasswordChange(true)} style={{ gap: '6px', padding: '4px 10px', fontSize: '12px' }}>
              <Lock size={13} /> Update Password
            </button>
          </div>

          {/* Profile Content Body - Fixed Container with Inner Scroll */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 24px' }}>
            {/* Identity Banner Card */}
            <div
              style={{
                background: 'var(--bg-0)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '20px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
                  color: '#ffffff',
                  fontSize: '22px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 16px rgba(37, 99, 235, 0.4)',
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>

              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '3px' }}>
                  <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>{user?.username}</h1>
                  <span
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      textTransform: 'uppercase',
                      background: user?.role === 'superadmin' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(37, 99, 235, 0.2)',
                      color: user?.role === 'superadmin' ? '#a5b4fc' : '#60a5fa',
                      border: user?.role === 'superadmin' ? '1px solid #6366f1' : '1px solid #3b82f6',
                    }}
                  >
                    {user?.role}
                  </span>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '0 0 4px 0' }}>{user?.email}</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0 }}>{getDesignation(user?.role)}</p>
              </div>

              {/* Stats Mini Grid */}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div className="stat-box" style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', padding: '10px 16px', minWidth: '110px', borderRadius: '8px' }}>
                  <div className="stat-value" style={{ fontSize: '18px' }}>{projects.length}</div>
                  <div className="stat-label">Workspaces</div>
                </div>
                <div className="stat-box" style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', padding: '10px 16px', minWidth: '110px', borderRadius: '8px' }}>
                  <div className="stat-value" style={{ fontSize: '18px', color: '#10b981' }}>ACTIVE</div>
                  <div className="stat-label">Account Status</div>
                </div>
                <div className="stat-box" style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', padding: '10px 16px', minWidth: '110px', borderRadius: '8px' }}>
                  <div className="stat-value" style={{ fontSize: '18px', color: '#38bdf8' }}>AES-256</div>
                  <div className="stat-label">E2EE Vault</div>
                </div>
              </div>
            </div>

            {/* Assigned Workspace Projects */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Folder size={15} style={{ color: '#3b82f6' }} /> Assigned Workspace Folders
                </h2>
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{projects.length} Total Projects</span>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)' }}>
                  Loading workspace telemetry…
                </div>
              ) : projects.length === 0 ? (
                <div style={{ background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: '8px', padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No projects associated with this profile.
                </div>
              ) : (
                <div className="projects-compact-grid">
                  {projects.map((p) => {
                    const statusStr = (p.status || 'live').toLowerCase();
                    return (
                      <div key={p.id} className="project-card-small" style={{ background: 'var(--bg-0)' }}>
                        <div className="project-card-top">
                          <div className="project-folder-icon"><Folder size={14} /></div>
                          <span className={`status-pill ${statusStr}`}>
                            ● {statusStr}
                          </span>
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '13.5px', marginBottom: '4px' }}>{p.name}</div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {p.description || 'No description provided'}
                          </div>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', paddingTop: '8px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Role: Lead / Owner</span>
                          <a href={`#/ide/${p.id}`} style={{ color: '#3b82f6', fontWeight: 600 }}>Open IDE →</a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Red Centered Logout Button at the Bottom */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '28px', paddingBottom: '16px' }}>
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  background: '#ef4444',
                  color: '#ffffff',
                  border: '1px solid #dc2626',
                  borderRadius: '8px',
                  padding: '9px 28px',
                  fontSize: '13.5px',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)',
                  cursor: 'pointer',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#dc2626';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(239, 68, 68, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#ef4444';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 14px rgba(239, 68, 68, 0.35)';
                }}
              >
                <LogOut size={15} />
                Logout
              </button>
            </div>
          </div>
        </div>
      </main>

      {showPasswordChange && (
        <Modal title="Update Account Password" onClose={() => setShowPasswordChange(false)} width={460}>
          <ForcePasswordChange
            embedded
            onSuccess={() => setShowPasswordChange(false)}
            onCancel={() => setShowPasswordChange(false)}
          />
        </Modal>
      )}
    </div>
  );
}
