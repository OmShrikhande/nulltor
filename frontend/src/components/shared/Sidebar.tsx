import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { useTheme } from '../../context/ThemeContext';
import { NulltorLogo } from './NulltorLogo';

export function Sidebar() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useTheme();
<<<<<<< Updated upstream
  const isSuperadmin = user?.role === 'superadmin';
=======
  const { sidebarOpen } = useUIStore();

  if (!sidebarOpen) {
    return null;
  }
>>>>>>> Stashed changes

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const initials = user?.username?.slice(0, 2).toUpperCase() ?? '??';

  return (
    <aside className="sidebar">
      <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <NulltorLogo size="md" />
      </div>

      <nav className="sidebar-nav">
        <NavItem href="/dashboard" label="Projects Workspace" icon={
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/></svg>
        } />
        <NavItem href="/logs" label="Audit Telemetry" icon={
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Z"/></svg>
        } />
        {isSuperadmin && (
          <NavItem href="/users" label="System Governance" icon={
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0ZM1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0Z"/></svg>
          } />
        )}
      </nav>

      <div className="sidebar-footer">
        <div
          className="user-badge"
          onClick={() => navigate('/profile')}
          title="View User Profile"
        >
          <div className="user-avatar">{initials}</div>
          <div className="user-info">
            <span className="user-name">{user?.username ?? '—'}</span>
            <span className="user-role">{user?.role}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button className="theme-toggle-btn" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}>
            {theme === 'dark' ? (
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </button>

          <button className="btn-icon" onClick={handleLogout} title="Sign out">
            <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor"><path d="M2 2.75C2 1.784 2.784 1 3.75 1h2.5a.75.75 0 0 1 0 1.5h-2.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h2.5a.75.75 0 0 1 0 1.5h-2.5A1.75 1.75 0 0 1 2 13.25Zm10.44 4.5-1.97-1.97a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l1.97-1.97H6.75a.75.75 0 0 1 0-1.5Z"/></svg>
          </button>
        </div>
      </div>
    </aside>
  );
}

<<<<<<< Updated upstream
function NavItem({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  const path = window.location.hash.replace('#', '');
  const active = path.startsWith(href);
  return (
    <a href={`#${href}`} className={`sidebar-link${active ? ' active' : ''}`}>
=======
function NavItem({
  href,
  label,
  icon,
  currentPath,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  currentPath: string;
}) {
  const navigate = useNavigate();
  const active = currentPath.startsWith(href);
  return (
    <button
      onClick={() => navigate(href)}
      className={`sidebar-link${active ? ' active' : ''}`}
      style={{
        width: '100%',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 12px',
      }}
    >
>>>>>>> Stashed changes
      {icon}
      <span>{label}</span>
    </a>
  );
}


