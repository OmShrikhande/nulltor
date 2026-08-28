import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../context/ThemeContext';
import { NulltorLogo } from './NulltorLogo';
import { Folder, FileText, Shield, User, Settings, LogOut, Sun, Moon } from 'lucide-react';

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useTheme();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const initials = user?.username?.slice(0, 2).toUpperCase() ?? '??';

  return (
    <aside
      className="sidebar"
      style={{
        width: '240px',
        height: '100vh',
        background: '#111215',
        borderRight: '1px solid #1f2128',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        zIndex: 20,
        boxShadow: '4px 0 24px rgba(0, 0, 0, 0.4)',
      }}
    >
      {/* Top Header Logo */}
      <div
        style={{
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 18px',
          borderBottom: '1px solid #1f2128',
        }}
      >
        <NulltorLogo size="md" />
        <span
          style={{
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'rgba(16, 185, 129, 0.1)',
            color: '#10b981',
            border: '1px solid rgba(16, 185, 129, 0.25)',
          }}
        >
          v2.4
        </span>
      </div>

      {/* Main Navigation Links */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '16px 12px', flex: 1 }}>
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

      {/* Bottom User Footer Card */}
      <div
        style={{
          padding: '12px 14px',
          borderTop: '1px solid #1f2128',
          background: '#0d0e11',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <div
          onClick={() => navigate('/profile')}
          title="View User Profile"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            flex: 1,
            overflow: 'hidden',
            padding: '4px 6px',
            borderRadius: '8px',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#18191e')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #0f52ba, #38bdf8)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '12px',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(15, 82, 186, 0.4)',
            }}
          >
            {initials}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <span
              style={{
                fontWeight: 700,
                fontSize: '12.5px',
                color: '#f8fafc',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user?.username ?? '—'}
            </span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#60a5fa',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {user?.role}
            </span>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8',
              background: 'transparent',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#18191e';
              e.currentTarget.style.color = '#f8fafc';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#94a3b8';
            }}
          >
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>

          <button
            onClick={handleLogout}
            title="Sign out"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ef4444',
              background: 'transparent',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function NavItem({ href, label, icon, currentPath }: { href: string; label: string; icon: React.ReactNode; currentPath: string }) {
  const navigate = useNavigate();
  const active = currentPath === href || (href !== '/' && currentPath.startsWith(href));
  return (
    <button
      onClick={() => navigate(href)}
      style={{
        width: '100%',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '9px 12px',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: active ? 700 : 500,
        color: active ? '#60a5fa' : '#94a3b8',
        background: active ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
        border: active ? '1px solid rgba(59, 130, 246, 0.25)' : '1px solid transparent',
        transition: 'all 0.15s ease',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = '#18191e';
          e.currentTarget.style.color = '#f8fafc';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = '#94a3b8';
        }
      }}
    >
      <span style={{ color: active ? '#3b82f6' : 'inherit', display: 'flex', alignItems: 'center' }}>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
