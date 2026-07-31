import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { projectsApi, type ProjectRead } from '../api/projects';
import { Sidebar } from '../components/shared/Sidebar';
import { NulltorLogo } from '../components/shared/NulltorLogo';
import { ForcePasswordChange } from '../components/auth/ForcePasswordChange';
import { Modal } from '../components/shared/Modal';
import { toast } from '../components/shared/Toast';

export function ProfilePage() {
  const { user } = useAuthStore();
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

  const initials = user?.username?.slice(0, 2).toUpperCase() ?? '??';

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <div className="page-container">
          <div className="profile-container">
            {/* Header Title Bar with Nulltor Logo */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {/* <NulltorLogo size="lg" /> */}
                <div>
                  <h1 style={{ fontSize: '26px', fontWeight: 800 }}>
                    User <span className="text-gradient">Profile</span> & Identity
                  </h1>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '2px' }}>
                    Zero-Knowledge Identity Vault, Role Credentials, and Workspace Allocations.
                  </p>
                </div>
              </div>
            </div>

            {/* Profile Detail Card */}
            <div className="profile-card">
              <div className="profile-header">
                <div className="profile-avatar-large">{initials}</div>
                <div className="profile-details" style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h1 className="profile-name">{user?.username}</h1>
                    <span className={`branch-pill ${user?.role === 'superadmin' ? 'private' : user?.role === 'admin' ? 'subroom' : 'main'}`}>
                      {user?.role?.toUpperCase()}
                    </span>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px' }}>{user?.email}</p>
                  <p className="profile-designation">{getDesignation(user?.role)}</p>
                </div>

                <button className="btn btn-primary btn-sm" onClick={() => setShowPasswordChange(true)}>
                  🔒 Update Password
                </button>
              </div>

              {/* Stat Boxes */}
              <div className="profile-stats-grid">
                <div className="stat-box">
                  <div className="stat-value">{projects.length}</div>
                  <div className="stat-label">Accessible Workspaces</div>
                </div>
                <div className="stat-box">
                  <div className="stat-value" style={{ color: 'var(--aurora-mint)' }}>ACTIVE</div>
                  <div className="stat-label">System Account Status</div>
                </div>
                <div className="stat-box">
                  <div className="stat-value" style={{ color: 'var(--aurora-teal)' }}>AES-256</div>
                  <div className="stat-label">Zero-Knowledge E2EE</div>
                </div>
              </div>
            </div>

            {/* Assigned Projects Section */}
            <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Assigned Workspace Folders</h2>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{projects.length} Total Projects</span>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)' }}>
                Loading user profile telemetry…
              </div>
            ) : projects.length === 0 ? (
              <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No projects associated with this profile.
              </div>
            ) : (
              <div className="projects-compact-grid">
                {projects.map((p) => {
                  const statusStr = (p.status || 'live').toLowerCase();
                  return (
                    <div key={p.id} className="project-card-small">
                      <div className="project-card-top">
                        <div className="project-folder-icon">📁</div>
                        <span className={`status-pill ${statusStr}`}>
                          ● {statusStr}
                        </span>
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>{p.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {p.description || 'No description provided'}
                        </div>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', paddingTop: '8px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Role: Lead / Owner</span>
                        <a href={`#/ide/${p.id}`} style={{ color: 'var(--aurora-mint)', fontWeight: 600 }}>Open IDE →</a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

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
