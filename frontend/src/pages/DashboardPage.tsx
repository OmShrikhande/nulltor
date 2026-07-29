import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsApi, type ProjectRead } from '../api/projects';
import { branchesApi, type BranchList } from '../api/branches';
import { useAuthStore } from '../store/authStore';
import { Sidebar } from '../components/shared/Sidebar';
import { ProjectCard, CreateProjectModal } from '../components/dashboard/ProjectCard';
import { toast } from '../components/shared/Toast';

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [projects, setProjects] = useState<ProjectRead[]>([]);
  const [branchCounts, setBranchCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const canCreate = user?.role === 'superadmin' || user?.role === 'admin';

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await projectsApi.list();
      setProjects(data.items);

      // Fetch branch counts in parallel
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
    } catch (e) {
      toast('Failed to load projects', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <div className="topbar">
          <span className="topbar-title">Projects</span>
          <div className="topbar-actions">
            {canCreate && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
                + New Project
              </button>
            )}
          </div>
        </div>

        <div className="view-container">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 64 }}>
              <div className="loading-spinner" />
            </div>
          ) : projects.length === 0 ? (
            <div className="empty-state">
              <h3>No projects yet</h3>
              <p>{canCreate ? 'Create your first project to get started.' : 'You have not been added to any projects yet.'}</p>
            </div>
          ) : (
            <div>
              <div className="page-header">
                <div>
                  <div className="page-title">{projects.length} Project{projects.length !== 1 ? 's' : ''}</div>
                </div>
              </div>
              <div className="project-list">
                {projects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    branchCount={branchCounts[p.id] ?? 0}
                    myRole={user?.role}
                    currentUserId={user?.id}
                    onDeleted={loadProjects}
                  />
                ))}
              </div>
            </div>
          )}
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
