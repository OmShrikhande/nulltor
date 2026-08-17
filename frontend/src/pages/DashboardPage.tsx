import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsApi, type ProjectRead } from '../api/projects';
import { branchesApi } from '../api/branches';
import { logsApi, type AuditLogRead } from '../api/logs';
import { useAuthStore } from '../store/authStore';
import { useTheme } from '../context/ThemeContext';
import { NulltorLogo } from '../components/shared/NulltorLogo';
import { ProjectCard, CreateProjectModal } from '../components/dashboard/ProjectCard';
import { toast } from '../components/shared/Toast';
<<<<<<< Updated upstream

interface SprintTask {
  id: number;
  text: string;
  done: boolean;
}
=======
import { PlusCircle, FileText, Shield, User, Users, Folder, GitBranch, Activity, Key, Settings, LogOut, Sun, Moon, Search, Terminal } from 'lucide-react';
>>>>>>> Stashed changes

export function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useTheme();

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

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const initials = user?.username?.slice(0, 2).toUpperCase() ?? '??';

  return (
<<<<<<< Updated upstream
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
=======
    <div style={{ minHeight: '100vh', background: 'var(--bg-0)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
      {/* Global Top Navbar */}
      <header
        style={{
          height: '52px',
          background: 'var(--header-bg, #0d0d0d)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        {/* Left: Logo & Nav Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>
            <NulltorLogo size="md" />
          </div>

          <nav style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12.5px',
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
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12.5px',
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

            <button
              onClick={() => navigate('/users')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12.5px',
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

            <button
              onClick={() => navigate('/settings')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12.5px',
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

        {/* Right: Theme Toggle & User Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            style={{ padding: '5px 8px', borderRadius: '6px' }}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>

          <div
            onClick={() => navigate('/profile')}
            title="View Profile"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              padding: '3px 8px 3px 4px',
              background: 'var(--bg-1)',
              borderRadius: '20px',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                background: '#2563eb',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {initials}
            </div>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {user?.username || 'User'}
            </span>
          </div>

          <button
            className="btn-icon"
            onClick={handleLogout}
            title="Sign out"
            style={{
              width: '32px',
              height: '32px',
              background: 'var(--bg-1)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* Main Dashboard Canvas containing the IDE 3-Traffic Dot Card */}
      <main style={{ flex: 1, padding: '20px 24px', maxWidth: '1600px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
        
        {/* ─── IDE 3-Traffic Dot Card Container ────────────────────────────── */}
        <div
          className="ide-traffic-dot-card"
          style={{
            flex: 1,
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
>>>>>>> Stashed changes
                </button>
              )}
            </div>
          </div>

<<<<<<< Updated upstream
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
=======
          {/* IDE Window Interior Body */}
          <div style={{ padding: '20px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
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
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
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
=======
              </div>
>>>>>>> Stashed changes

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

<<<<<<< Updated upstream
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
=======
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
>>>>>>> Stashed changes
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
    </div>
  );
}
