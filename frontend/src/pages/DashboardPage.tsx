import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsApi, type ProjectRead } from '../api/projects';
import { branchesApi } from '../api/branches';
import { logsApi, type AuditLogRead } from '../api/logs';
import { usersApi } from '../api/users';
import { type UserRead } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import { Sidebar } from '../components/shared/Sidebar';
import { ProjectCard, CreateProjectModal } from '../components/dashboard/ProjectCard';
import { JoinProjectModal } from '../components/dashboard/JoinProjectModal';
import { toast } from '../components/shared/Toast';
import { PlusCircle, FileText, Shield, User, Users, Folder, GitBranch, Trash2, Activity, Key } from 'lucide-react';

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
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

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <div className="page-container">
          {/* Professional Header & Actions Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  Hey, <span style={{ color: 'var(--sapphire-light)' }}>{user?.username || 'Architect'}</span>
                </h1>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: 'var(--sapphire-dim)',
                    border: '1px solid var(--sapphire-border)',
                    color: 'var(--sapphire-light)',
                    textTransform: 'uppercase',
                  }}
                >
                  {user?.role || 'member'}
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '3px' }}>
                Workspace Repositories & Environments ({projects.length} Active)
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="form-field" style={{ margin: 0, width: '280px' }}>
                <input
                  type="text"
                  placeholder="Filter workspaces by name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ padding: '7px 12px', fontSize: '12.5px', background: 'var(--bg-1)', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
              </div>

              <button
                className="btn btn-ghost"
                style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--sapphire-border)', color: 'var(--sapphire-light)', background: 'var(--bg-1)', borderRadius: '8px' }}
                onClick={() => setShowJoin(true)}
              >
                <Key size={14} /> Join via Code
              </button>

              {canCreate && (
                <button
                  className="btn btn-primary"
                  onClick={() => setShowCreate(true)}
                  style={{
                    background: 'var(--accent-primary)',
                    color: '#ffffff',
                    fontWeight: 700,
                    border: '1px solid var(--accent-tertiary)',
                    borderRadius: '8px',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
                  }}
                >
                  <PlusCircle size={15} /> New Project
                </button>
              )}
            </div>
          </div>

          {/* Main Content Layout */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '20px' }}>
            {/* Left Main Area (8 Cols) */}
            <div style={{ gridColumn: 'span 8', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <section>

                {loading ? (
                  <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Loading projects…
                  </div>
                ) : filteredProjects.length === 0 ? (
                  <div className="glass-card" style={{ padding: '36px', textAlign: 'center' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>No Workspace Projects Found</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>
                      {canCreate ? 'Create your first project workspace to start collaborating.' : 'No projects assigned.'}
                    </p>
                    {canCreate && (
                      <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
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
              </section>
            </div>

            {/* Right Sidebar Activity Audit Timeline Connected to Backend */}
            <div style={{ gridColumn: 'span 4' }}>
              <div className="glass-card" style={{ height: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                  <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Real-Time Activity Audit
                  </h2>
                  <span className="status-pill live" style={{ fontSize: '10px' }}>● LIVE TELEMETRY</span>
                </div>

                <div className="timeline-container">
                  <div className="timeline-line" />

                  {recentLogs.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>No backend audit events logged yet.</div>
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
                              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {log.action.replace('_', ' ').toUpperCase()}
                              </span>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{timeStr}</span>
                            </div>
                            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              Actor: <span style={{ color: 'var(--aurora-mint)', fontWeight: 600 }}>{log.actor_id ? log.actor_id.slice(0, 8) : 'System'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
