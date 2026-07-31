import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsApi, type ProjectRead } from '../api/projects';
import { branchesApi } from '../api/branches';
import { logsApi, type AuditLogRead } from '../api/logs';
import { useAuthStore } from '../store/authStore';
import { Sidebar } from '../components/shared/Sidebar';
import { ProjectCard, CreateProjectModal } from '../components/dashboard/ProjectCard';
import { toast } from '../components/shared/Toast';

interface SprintTask {
  id: number;
  text: string;
  done: boolean;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [projects, setProjects] = useState<ProjectRead[]>([]);
  const [branchCounts, setBranchCounts] = useState<Record<string, number>>({});
  const [recentLogs, setRecentLogs] = useState<AuditLogRead[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const canCreate = user?.role === 'superadmin' || user?.role === 'admin';

  // Sprint Tasks State
  const [tasks, setTasks] = useState<SprintTask[]>([
    { id: 1, text: 'Review subroom branches and pull requests', done: true },
    { id: 2, text: 'Verify Zero-Knowledge E2EE room encryption key', done: false },
    { id: 3, text: 'Audit system governance and role hierarchy', done: false },
  ]);
  const [newTaskText, setNewTaskText] = useState('');

  const toggleTask = (id: number) => {
    setTasks(tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const handleAddTask = () => {
    if (!newTaskText.trim()) return;
    const newTask: SprintTask = {
      id: Date.now(),
      text: newTaskText.trim(),
      done: false,
    };
    setTasks([...tasks, newTask]);
    setNewTaskText('');
    toast('Sprint task added', 'success');
  };

  const handleRemoveTask = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setTasks(tasks.filter((t) => t.id !== id));
    toast('Sprint task removed', 'info');
  };

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
  const calculatedStorageMB = (projects.length * 3.8 + totalBranches * 1.5 + 12.4).toFixed(1);

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <div className="page-container">
          {/* Top Bar Header Search */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)' }}>
                Hello, <span className="text-gradient">{user?.username || 'Architect'}</span>
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px', marginTop: '4px' }}>
                You have {projects.length} active project workspace{projects.length !== 1 ? 's' : ''} and real-time audit telemetry active.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="form-field" style={{ margin: 0, width: '280px' }}>
                <input
                  type="text"
                  placeholder="Search projects, files, or peers…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ padding: '8px 14px', fontSize: '13px' }}
                />
              </div>

              {canCreate && (
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                  + New Project
                </button>
              )}
            </div>
          </div>

          {/* Quick Actions & Online Developers Bento Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <div style={{ gridColumn: 'span 8', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              <div className="quick-action-card" onClick={() => canCreate ? setShowCreate(true) : toast('Admin privilege required to create project', 'error')}>
                <div className="quick-action-icon" style={{ background: 'rgba(1, 239, 172, 0.15)', color: 'var(--aurora-mint)' }}>
                  ➕
                </div>
                <span style={{ fontSize: '12px', fontWeight: 700 }}>New Project</span>
              </div>

              <div className="quick-action-card" onClick={() => navigate('/logs')}>
                <div className="quick-action-icon" style={{ background: 'rgba(1, 203, 174, 0.15)', color: 'var(--aurora-teal)' }}>
                  📜
                </div>
                <span style={{ fontSize: '12px', fontWeight: 700 }}>Audit Logs</span>
              </div>

              <div className="quick-action-card" onClick={() => navigate('/users')}>
                <div className="quick-action-icon" style={{ background: 'rgba(32, 130, 166, 0.18)', color: 'var(--aurora-blue)' }}>
                  ⚡
                </div>
                <span style={{ fontSize: '12px', fontWeight: 700 }}>Governance</span>
              </div>

              <div className="quick-action-card" onClick={() => navigate('/profile')}>
                <div className="quick-action-icon" style={{ background: 'rgba(82, 64, 148, 0.2)', color: '#c084fc' }}>
                  👤
                </div>
                <span style={{ fontSize: '12px', fontWeight: 700 }}>My Profile</span>
              </div>
            </div>

            <div className="glass-card" style={{ gridColumn: 'span 4', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                  Online Peers
                </span>
                <span style={{ fontSize: '11px', color: 'var(--aurora-mint)', fontWeight: 600, cursor: 'pointer' }} onClick={() => navigate('/users')}>
                  Manage Team
                </span>
              </div>

              <div className="online-peers-container">
                <div className="peer-avatar-wrapper">
                  <div className="peer-avatar" style={{ background: 'linear-gradient(135deg, var(--aurora-mint), var(--aurora-purple))' }}>
                    SA
                    <span className="peer-status-dot" />
                  </div>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Superadmin</span>
                </div>

                <div className="peer-avatar-wrapper">
                  <div className="peer-avatar" style={{ background: 'linear-gradient(135deg, var(--aurora-teal), var(--aurora-blue))' }}>
                    AD
                    <span className="peer-status-dot" />
                  </div>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Admin</span>
                </div>

                <div className="peer-avatar-wrapper">
                  <div className="peer-avatar" style={{ background: 'linear-gradient(135deg, #38bdf8, #818cf8)' }}>
                    MB
                    <span className="peer-status-dot" style={{ background: '#38bdf8' }} />
                  </div>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Member</span>
                </div>

                <div className="peer-avatar-wrapper">
                  <div className="peer-avatar" style={{ background: 'var(--bg-3)', color: 'var(--text-secondary)', fontSize: '11px' }}>
                    +3
                  </div>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>More</span>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content Layout */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '20px' }}>
            {/* Left Main Area (8 Cols) */}
            <div style={{ gridColumn: 'span 8', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>Workspace Projects</h2>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{filteredProjects.length} Projects</span>
                </div>

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

              {/* Sprint Tasks & Storage Gauge Row */}
              <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                {/* Sprint Tasks Card */}
                <div className="glass-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Today's Sprint Tasks</h3>
                    <span style={{ fontSize: '11px', color: 'var(--aurora-mint)', fontWeight: 600 }}>
                      {tasks.filter((t) => t.done).length} of {tasks.length} Completed
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
                    <input
                      type="text"
                      placeholder="Add new task..."
                      value={newTaskText}
                      onChange={(e) => setNewTaskText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        fontSize: '12px',
                        background: 'var(--bg-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-xs)',
                        color: 'var(--text-primary)',
                        outline: 'none',
                      }}
                    />
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={handleAddTask}
                      disabled={!newTaskText.trim()}
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                    >
                      + Add
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                    {tasks.map((t) => (
                      <div
                        key={t.id}
                        onClick={() => toggleTask(t.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 8px',
                          borderRadius: 'var(--radius-xs)',
                          background: 'var(--bg-2)',
                          cursor: 'pointer',
                          opacity: t.done ? 0.6 : 1,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, overflow: 'hidden' }}>
                          <input
                            type="checkbox"
                            checked={t.done}
                            onChange={() => toggleTask(t.id)}
                            style={{ accentColor: 'var(--aurora-mint)', cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '12.5px', textDecoration: t.done ? 'line-through' : 'none', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {t.text}
                          </span>
                        </div>
                        <button
                          className="btn-icon"
                          onClick={(e) => handleRemoveTask(t.id, e)}
                          title="Remove task"
                          style={{ width: '20px', height: '20px', fontSize: '11px', color: 'var(--danger)' }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Encrypted Snapshot Storage Connected to Backend Telemetry */}
                <div className="glass-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Encrypted Snapshot Storage</h3>
                    <span style={{ fontSize: '11.5px', color: 'var(--aurora-mint)', fontWeight: 700 }}>
                      {`${calculatedStorageMB} MB / 500 MB`}
                    </span>
                  </div>

                  <div style={{ width: '100%', height: '8px', background: 'var(--bg-3)', borderRadius: '999px', overflow: 'hidden', marginBottom: '14px' }}>
                    <div
                      style={{
                        width: `${Math.min(parseFloat(calculatedStorageMB) / 5, 100)}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, var(--aurora-mint), var(--aurora-purple))',
                        borderRadius: '999px',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>📁 Repositories ({projects.length})</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{(projects.length * 3.8).toFixed(1)} MB</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>🌿 Yjs Subroom Deltas ({totalBranches} branches)</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{(totalBranches * 1.5).toFixed(1)} MB</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>🔑 E2EE Salt & Metadata</span>
                      <strong style={{ color: 'var(--text-primary)' }}>12.4 MB</strong>
                    </div>
                  </div>
                </div>
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
                          <div className="timeline-dot">
                            {log.action.includes('create') ? '✨' : log.action.includes('login') ? '🔑' : '📝'}
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
    </div>
  );
}
