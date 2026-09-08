import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsApi, type ProjectRead } from '../api/projects';
import { branchesApi } from '../api/branches';
import { logsApi, type AuditLogRead } from '../api/logs';
import { usersApi } from '../api/users';
import { commitsApi } from '../api/commits';
import { type UserRead } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import { Sidebar } from '../components/shared/Sidebar';
import { ProjectCard, CreateProjectModal } from '../components/dashboard/ProjectCard';
import { JoinProjectModal } from '../components/dashboard/JoinProjectModal';
import { toast } from '../components/shared/Toast';
import { PlusCircle, FileText, Shield, User, Users, Folder, GitBranch, Trash2, Activity, Key, GitCommit, UsersRound } from 'lucide-react';

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [projects, setProjects] = useState<ProjectRead[]>([]);
  const [branchCounts, setBranchCounts] = useState<Record<string, number>>({});
  const [recentLogs, setRecentLogs] = useState<AuditLogRead[]>([]);
  const [systemUsers, setSystemUsers] = useState<UserRead[]>([]);
  const [totalUsersCount, setTotalUsersCount] = useState<number>(1);
  const [todayCommitsCount, setTodayCommitsCount] = useState<number>(0);
  const [totalCommitsCount, setTotalCommitsCount] = useState<number>(0);
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
      let totalCommits = 0;
      let todayCount = 0;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      await Promise.all(
        data.items.map(async (p) => {
          try {
            const bl = await branchesApi.list(p.id);
            counts[p.id] = bl.total;
          } catch {
            counts[p.id] = 0;
          }

          try {
            const cList = await commitsApi.getCommits(p.id);
            totalCommits += cList.length;
            todayCount += cList.filter((c) => new Date(c.created_at) >= todayStart).length;
          } catch {}
        })
      );
      setBranchCounts(counts);
      setTodayCommitsCount(todayCount);
      setTotalCommitsCount(totalCommits);

      try {
        const logData = await logsApi.list({ page: 1, page_size: 6 });
        setRecentLogs(logData.items);
      } catch {}

      try {
        const userData = await usersApi.list(0, 50);
        setSystemUsers(userData.items);
        setTotalUsersCount(userData.total || userData.items.length);
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
      <div className="main-content" style={{ zIndex: 10 }}>
        <div className="page-container">
          {/* Professional Header & Actions Bar matching Mockup */}
          <div className="animate-fade-in-up stagger-1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '16px', position: 'relative', zIndex: 10 }}>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
                Hey, <span style={{ color: 'var(--accent-secondary)' }}>{user?.username || 'superadmin'}</span>
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px', margin: 0 }}>
                {projects.length} active workspace{projects.length !== 1 ? 's' : ''}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ margin: 0, width: '240px' }}>
                <input
                  type="text"
                  placeholder="Filter workspaces"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 14px',
                    fontSize: '13px',
                    background: 'var(--bg-2)',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
              </div>

              <button
                className="btn btn-ghost"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  background: 'var(--bg-2)',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '13px',
                }}
                onClick={() => setShowJoin(true)}
              >
                <Key size={14} /> Join via code
              </button>

              {canCreate && (
                <button
                  className="btn"
                  onClick={() => setShowCreate(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'var(--accent-primary)',
                    color: '#ffffff',
                    fontWeight: 700,
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '13px',
                    boxShadow: '0 2px 8px var(--accent-glow)',
                  }}
                >
                  <PlusCircle size={14} /> New project
                </button>
              )}
            </div>
          </div>

          {/* Top 3-Card Metrics Shelf */}
          <div className="animate-fade-in-up stagger-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px', position: 'relative', zIndex: 10 }}>
            {/* Card 1: Workspaces & Branches */}
            <div style={{
              background: 'var(--bg-1)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Active workspaces
                </span>
                <Folder size={15} style={{ color: 'var(--accent-secondary)', opacity: 0.8 }} />
              </div>
              <div>
                <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '8px', letterSpacing: '-0.02em' }}>
                  {loading ? '…' : projects.length}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {totalBranches} branch{totalBranches !== 1 ? 'es' : ''} across all projects
                </div>
              </div>
            </div>

            {/* Card 2: Team Members & Users */}
            <div style={{
              background: 'var(--bg-1)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Team members
                </span>
                <Users size={15} style={{ color: '#10b981', opacity: 0.8 }} />
              </div>
              <div>
                <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '8px', letterSpacing: '-0.02em' }}>
                  {loading ? '…' : totalUsersCount}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {totalUsersCount === 1 ? '1 registered collaborator' : `${totalUsersCount} registered collaborators`}
                </div>
              </div>
            </div>

            {/* Card 3: Commits & Snapshots Today */}
            <div style={{
              background: 'var(--bg-1)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Commits today
                </span>
                <GitCommit size={15} style={{ color: '#6366f1', opacity: 0.8 }} />
              </div>
              <div>
                <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '8px', letterSpacing: '-0.02em' }}>
                  {loading ? '…' : todayCommitsCount}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {totalCommitsCount} total commit snapshot{totalCommitsCount !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          </div>

          {/* Main Workspaces & Audit Grid matching Mockup */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '16px', position: 'relative', zIndex: 10 }}>
            {/* Left 8 Cols: Project Workspaces */}
            <div className="animate-fade-in-up stagger-3" style={{ gridColumn: 'span 8', display: 'flex', flexDirection: 'column' }}>
              {loading ? (
                <div style={{ padding: '48px 0', textAlign: 'center', color: '#94a3b8' }}>
                  Loading workspaces…
                </div>
              ) : filteredProjects.length === 0 ? (
                <div style={{
                  background: 'var(--bg-1)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '36px',
                  textAlign: 'center'
                }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>No Workspace Projects Found</h3>
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
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

            {/* Right 4 Cols: Semantic Activity Audit matching Mockup */}
            <div className="animate-fade-in-up stagger-4" style={{ gridColumn: 'span 4' }}>
              <div style={{
                background: 'var(--bg-1)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '16px 20px',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                minHeight: '220px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    Activity audit
                  </h2>
                  <span style={{ color: '#10b981', fontSize: '11.5px', fontWeight: 600 }}>
                    Live
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, overflowY: 'auto' }}>
                  {recentLogs.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No activity logged yet.</div>
                  ) : (
                    recentLogs.map((log) => {
                      const isDelete = log.action.toLowerCase().includes('delete') || log.action.toLowerCase().includes('remove');
                      const isCreate = log.action.toLowerCase().includes('create') || log.action.toLowerCase().includes('branch') || log.action.toLowerCase().includes('sync');
                      
                      const timeStr = new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      const actionLabel = log.action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                      const actorName = log.actor_username || (log.actor_id ? log.actor_id.slice(0, 8) : 'superadmin');

                      const iconColor = isDelete ? '#ef4444' : isCreate ? '#10b981' : 'var(--text-muted)';
                      const textColor = isDelete ? '#ef4444' : isCreate ? '#10b981' : 'var(--text-primary)';

                      return (
                        <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                          <div style={{
                            width: '16px',
                            height: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: iconColor,
                            marginTop: '2px',
                            flexShrink: 0
                          }}>
                            {isDelete ? <Trash2 size={13} /> : isCreate ? <PlusCircle size={13} /> : <Activity size={13} />}
                          </div>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: textColor }}>
                              {actionLabel} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>· {timeStr}</span>
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '1px' }}>
                              {actorName}
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
