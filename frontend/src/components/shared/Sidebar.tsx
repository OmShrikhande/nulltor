import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { useTheme } from '../../context/ThemeContext';
import { NulltorLogo } from './NulltorLogo';
import { Folder, FileText, Shield, User, Settings, LogOut, Sun, Moon } from 'lucide-react';

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useTheme();
  const { sidebarOpen } = useUIStore();

  if (!sidebarOpen) {
    return null;
  }

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
        <NavItem
          href="/dashboard"
          label="Workspaces"
          currentPath={location.pathname}
          icon={<Folder size={16} />}
        />
        <NavItem
          href="/logs"
          label="Audit Telemetry"
          currentPath={location.pathname}
          icon={<FileText size={16} />}
        />
        <NavItem
          href="/users"
          label="Governance & Team"
          currentPath={location.pathname}
          icon={<Shield size={16} />}
        />
        <NavItem
          href="/profile"
          label="My Profile"
          currentPath={location.pathname}
          icon={<User size={16} />}
        />
        <NavItem
          href="/settings"
          label="Settings"
          currentPath={location.pathname}
          icon={<Settings size={16} />}
        />
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
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>

          <button className="btn-icon" onClick={handleLogout} title="Sign out">
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}

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
      {icon}
      <span>{label}</span>
    </button>
  );
}


