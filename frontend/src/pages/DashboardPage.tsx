import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsApi, type ProjectRead } from '../api/projects';
import { branchesApi } from '../api/branches';
import { logsApi, type AuditLogRead } from '../api/logs';
import { usersApi } from '../api/users';
import { type UserRead } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import { useTheme } from '../context/ThemeContext';
import { NulltorLogo } from '../components/shared/NulltorLogo';
import { ProjectCard, CreateProjectModal } from '../components/dashboard/ProjectCard';
import { JoinProjectModal } from '../components/dashboard/JoinProjectModal';
import { toast } from '../components/shared/Toast';
import { PlusCircle, FileText, Shield, Folder, GitBranch, Activity, Key, Settings, Sun, Moon, Terminal } from 'lucide-react';

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { theme, toggleTheme } = useTheme();

  const [projects, setProjects] = useState<ProjectRead[]>([]);
  const [branchCounts, setBranchCounts] = useState<Record<string, number>>({});
  const [recentLogs, setRecentLogs] = useState<AuditLogRead[]>([]);
  const [systemUsers, setSystemUsers] = useState<UserRead[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const canCreate = user?.role === 'superadmin' || user?.role === 'admin';

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await projectsApi.list();
      setProjects(data.items);

      const counts: Record<string, number> = {};
      await Promise.all(
        data.items.map(async (p) => {
          try {
            const bl = await branchesApi.list(p.id);
            counts[p.id] = bl.total;
          } catch {
            counts[p.id] = 0;
          }
        })
      );
      setBranchCounts(counts);

      try {
        const logData = await logsApi.list({ page: 1, page_size: 6 });
        setRecentLogs(logData.items);
      } catch {}

      try {
        const userData = await usersApi.list(0, 5);
        setSystemUsers(userData.items);
      } catch {}

    } catch {
      toast('Failed to load workspace data', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(async () => {
      try {
        const logData = await logsApi.list({ page: 1, page_size: 6 });
        setRecentLogs(logData.items);
      } catch {}
    }, 8000);
    return () => clearInterval(interval);
  }, [loadDashboardData]);

  const filteredProjects = projects.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) ||
           (p.description && p.description.toLowerCase().includes(search.toLowerCase()))
  );

  const totalBranches = Object.values(branchCounts).reduce((a, b) => a + b, 0);

  const initials = user?.username?.slice(0, 2).toUpperCase() ?? '??';

  return (
    <div style={{ height: '100vh', width: '100vw', background: 'var(--bg-0)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Global Top Navbar */}
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
        {/* Left: Logo & Nav Links */}
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
                fontWeight: 700,
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
              }}
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

          {/* Circular Profile Icon Button for navigation */}
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
              border: '1px solid rgba(255, 255, 255, 0.2)',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.35)',
              cursor: 'pointer',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              padding: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.08)';
              e.currentTarget.style.boxShadow = '0 3px 12px rgba(37, 99, 235, 0.55)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(37, 99, 235, 0.35)';
            }}
          >
            {initials}
          </button>
        </div>
      </header>

      {/* Main Dashboard Canvas containing the IDE 3-Traffic Dot Card */}
      <main style={{ flex: 1, padding: '16px 24px 20px', maxWidth: '1600px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        
        {/* ─── IDE 3-Traffic Dot Card Container ────────────────────────────── */}
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
          {/* IDE Window Header Bar with 3 Traffic Dots */}
          <div
            style={{
              height: '42px',
              background: 'var(--bg-2)',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px',
              userSelect: 'none',
              flexShrink: 0,
            }}
          >
            {/* 3 Traffic Dots + Workspace Identifier */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <span style={{ width: '11px', height: '11px', borderRadius: '50%', background: '#ef4444', display: 'inline-block', boxShadow: '0 0 4px rgba(239, 68, 68, 0.4)' }} />
                <span style={{ width: '11px', height: '11px', borderRadius: '50%', background: '#eab308', display: 'inline-block', boxShadow: '0 0 4px rgba(234, 179, 8, 0.4)' }} />
                <span style={{ width: '11px', height: '11px', borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 4px rgba(16, 185, 129, 0.4)' }} />
              </div>

              <div style={{ width: '1px', height: '18px', background: 'var(--border)' }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                <Terminal size={14} style={{ color: 'var(--accent)' }} />
                <span>nulltor-developer-studio · workspace control plane</span>
              </div>
            </div>

            {/* Window Controls & Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ position: 'relative', width: '220px' }}>
                <input
                  type="text"
                  placeholder="Filter workspaces…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '4px 10px',
                    fontSize: '12px',
                    background: 'var(--bg-0)',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
              </div>

              <button
                className="btn btn-ghost btn-sm"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  background: 'var(--bg-0)',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
                onClick={() => setShowJoin(true)}
              >
                <Key size={13} style={{ color: '#eab308' }} /> Join via Code
              </button>

              {canCreate && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowCreate(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    background: '#2563eb',
                    color: '#ffffff',
                    fontWeight: 700,
                    border: '1px solid #1d4ed8',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '12px',
                  }}
                >
                  <PlusCircle size={14} /> New Project
                </button>
              )}
            </div>
          </div>

          {/* IDE Window Interior Body - Fixed Container with Inner Scroll */}
          <div style={{ padding: '20px 24px', flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Top KPI Stat Boxes */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
              <div className="stat-box" style={{ background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Active Workspaces
                  </span>
                  <Folder size={15} style={{ color: '#3b82f6' }} />
                </div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>{projects.length}</div>
              </div>

              <div className="stat-box" style={{ background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Total Subrooms & Forks
                  </span>
                  <GitBranch size={15} style={{ color: '#60a5fa' }} />
                </div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#60a5fa' }}>{totalBranches}</div>
              </div>

              <div className="stat-box" style={{ background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Telemetry Status
                  </span>
                  <Activity size={15} style={{ color: '#ea580c' }} />
                </div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#ea580c', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#ea580c' }} />
                  IMMUTABLE E2EE
                </div>
              </div>

              <div className="stat-box" style={{ background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Governance Team
                  </span>
                  <Shield size={15} style={{ color: '#eab308' }} />
                </div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#eab308' }}>{systemUsers.length || 1}</div>
              </div>
            </div>

            {/* 2-Column Responsive Layout */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '20px', flex: 1 }}>
              {/* Left Column (8 cols): Workspaces Projects Grid */}
              <div style={{ gridColumn: 'span 8', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    Workspace Projects ({filteredProjects.length})
                  </h2>
                  {canCreate && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowCreate(true)}
                      style={{ color: '#3b82f6', fontWeight: 600, fontSize: '12px' }}
                    >
                      + Add Project
                    </button>
                  )}
                </div>

                {loading ? (
                  <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Loading projects…
                  </div>
                ) : filteredProjects.length === 0 ? (
                  <div className="glass-card" style={{ padding: '36px', textAlign: 'center', background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>No Workspace Projects Found</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '12.5px', marginBottom: '16px' }}>
                      {canCreate ? 'Create your first project workspace to start collaborating.' : 'No projects assigned.'}
                    </p>
                    {canCreate && (
                      <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
                        + Create Workspace
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="projects-compact-grid">
                    {filteredProjects.map((p) => (
                      <ProjectCard
                        key={p.id}
                        project={p}
                        branchCount={branchCounts[p.id] ?? 0}
                        myRole={user?.role}
                        currentUserId={user?.id}
                        onDeleted={loadDashboardData}
                        onUpdated={loadDashboardData}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Right Column (4 cols): Real-Time Activity & Governance Overview */}
              <div style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Real-Time Audit Feed */}
                <div className="glass-card" style={{ background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h2 style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                      Real-Time Audit Stream
                    </h2>
                    <span className="status-pill live" style={{ fontSize: '10px' }}>● LIVE</span>
                  </div>

                  <div className="timeline-container">
                    <div className="timeline-line" />

                    {recentLogs.length === 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>No audit events logged yet.</div>
                    ) : (
                      recentLogs.map((log) => {
                        const timeStr = new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        return (
                          <div key={log.id} className="timeline-item">
                            <div className="timeline-dot" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {log.action.includes('create') ? <PlusCircle size={12} /> : log.action.includes('login') ? <Activity size={12} /> : <FileText size={12} />}
                            </div>
                            <div style={{ flex: 1, marginTop: '-2px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                  {log.action.replace('_', ' ').toUpperCase()}
                                </span>
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{timeStr}</span>
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                Actor: <span style={{ color: 'var(--aurora-mint)', fontWeight: 600 }}>{log.actor_id ? log.actor_id.slice(0, 8) : 'System'}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => navigate('/logs')}
                    style={{ width: '100%', marginTop: '14px', fontSize: '11.5px', fontWeight: 600, color: '#3b82f6', border: '1px solid var(--border)' }}
                  >
                    View Full Audit Logs Table →
                  </button>
                </div>

                {/* System Governance Card */}
                <div className="glass-card" style={{ background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h2 style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                      System Governance
                    </h2>
                    <Shield size={15} style={{ color: '#eab308' }} />
                  </div>

                  <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: '0 0 12px 0', lineHeight: 1.4 }}>
                    Role-based access control, encryption keys, and active collaborative peers across all nodes.
                  </p>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => navigate('/users')}
                      style={{ flex: 1, fontSize: '11.5px', fontWeight: 600 }}
                    >
                      Manage Users
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => navigate('/settings')}
                      style={{ fontSize: '11.5px', border: '1px solid var(--border)' }}
                    >
                      Settings
                    </button>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreated={(p) => {
            setProjects((prev) => [p, ...prev]);
            setShowCreate(false);
          }}
        />
      )}

      {showJoin && (
        <JoinProjectModal
          onClose={() => setShowJoin(false)}
          onJoined={(p) => {
            setProjects((prev) => {
              if (prev.find((x) => x.id === p.id)) return prev;
              return [p, ...prev];
            });
            setShowJoin(false);
          }}
        />
      )}
    </div>
  );
}
