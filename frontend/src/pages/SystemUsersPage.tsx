import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usersApi, type UserCreate } from '../api/users';
import { type UserRead } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import { useTheme } from '../context/ThemeContext';
import { NulltorLogo } from '../components/shared/NulltorLogo';
import { toast } from '../components/shared/Toast';
import { Modal } from '../components/shared/Modal';
import { Shield, Crown, Laptop, UserCheck, PlusCircle, Folder, FileText, Settings, Sun, Moon } from 'lucide-react';

export function SystemUsersPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { theme, toggleTheme } = useTheme();

  const [users, setUsers] = useState<UserRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await usersApi.list();
      setUsers(data.items);
    } catch {
      toast('Failed to load system users', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  async function handleToggleActive(targetUser: UserRead) {
    try {
      await usersApi.update(targetUser.id, { is_active: !targetUser.is_active });
      toast(`User "${targetUser.username}" ${targetUser.is_active ? 'deactivated' : 'activated'}`, 'success');
      loadUsers();
    } catch {
      toast('Failed to update user status', 'error');
    }
  }

  async function handleRoleChange(targetUser: UserRead, newRole: 'superadmin' | 'admin' | 'member') {
    try {
      await usersApi.update(targetUser.id, { role: newRole });
      toast(`Role for ${targetUser.username} updated to ${newRole.toUpperCase()}`, 'success');
      loadUsers();
    } catch {
      toast('Failed to update user role', 'error');
    }
  }

  const filteredUsers = users.filter((u) => {
    const matchesSearch = u.username.toLowerCase().includes(search.toLowerCase()) ||
                          u.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const superadminCount = users.filter((u) => u.role === 'superadmin').length;
  const adminCount = users.filter((u) => u.role === 'admin').length;
  const memberCount = users.filter((u) => u.role === 'member').length;

  const initials = user?.username?.slice(0, 2).toUpperCase() ?? '??';

  return (
    <div style={{ height: '100vh', width: '100vw', background: 'var(--bg-0)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Universal Workspace Nexus Topbar */}
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
        {/* Left: Branding & Core Navigation Tabs */}
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

            <button
              onClick={() => navigate('/users')}
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
              <Shield size={14} />
              <span>Governance & Team</span>
            </button>

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

      {/* Main Workspace Canvas with Fixed Height IDE Traffic Dot Card */}
      <main style={{ flex: 1, padding: '16px 24px 20px', maxWidth: '1600px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
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
          {/* Card Header with 3 Traffic Dots, Controls & Create Button */}
          <div
            style={{
              height: '42px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px',
              flexShrink: 0,
              userSelect: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }}></span>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }}></span>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
              </div>
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={14} style={{ color: '#2563eb' }} />
                System Governance & User Hierarchy
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="text"
                placeholder="Search username or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: '4px 10px', fontSize: '12px', width: '180px', borderRadius: '6px', background: 'var(--bg-0)', border: '1px solid var(--border)' }}
              />

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                style={{ padding: '4px 28px 4px 10px', fontSize: '12px', width: '120px', borderRadius: '6px' }}
              >
                <option value="all">All Roles</option>
                <option value="superadmin">Superadmin</option>
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>

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
                <PlusCircle size={14} /> Add User
              </button>
            </div>
          </div>

          {/* Governance Content Body - Fixed Container with Inner Scroll */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 24px' }}>
            {/* Role Distribution Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
              <div className="stat-box" style={{ background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="stat-label">Total Users</span>
                  <UserCheck size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
                <div className="stat-value" style={{ fontSize: '20px', marginTop: '4px' }}>{users.length}</div>
              </div>

              <div className="stat-box" style={{ background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="stat-label">Superadmins (L1)</span>
                  <Crown size={16} style={{ color: '#818cf8' }} />
                </div>
                <div className="stat-value" style={{ fontSize: '20px', color: '#818cf8', marginTop: '4px' }}>{superadminCount}</div>
              </div>

              <div className="stat-box" style={{ background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="stat-label">Admins (L2)</span>
                  <Shield size={16} style={{ color: '#38bdf8' }} />
                </div>
                <div className="stat-value" style={{ fontSize: '20px', color: '#38bdf8', marginTop: '4px' }}>{adminCount}</div>
              </div>

              <div className="stat-box" style={{ background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="stat-label">Members (L3)</span>
                  <Laptop size={16} style={{ color: '#10b981' }} />
                </div>
                <div className="stat-value" style={{ fontSize: '20px', color: '#10b981', marginTop: '4px' }}>{memberCount}</div>
              </div>
            </div>

            {/* Users Table */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-secondary)' }}>
                Loading user accounts…
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="glass-card" style={{ padding: '48px', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                  <Shield size={32} />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>No System Users Found</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No accounts match the current filter query.</p>
              </div>
            ) : (
              <div style={{ background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                <table className="members-table" style={{ margin: 0 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-2)' }}>
                      <th style={{ padding: '10px 16px', fontSize: '11px', fontWeight: 800 }}>Account & Identity</th>
                      <th style={{ padding: '10px 16px', fontSize: '11px', fontWeight: 800 }}>Hierarchy Role</th>
                      <th style={{ padding: '10px 16px', fontSize: '11px', fontWeight: 800 }}>System Status</th>
                      <th style={{ padding: '10px 16px', fontSize: '11px', fontWeight: 800 }}>Security Flags</th>
                      <th style={{ padding: '10px 16px', fontSize: '11px', fontWeight: 800, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                background: u.role === 'superadmin' ? 'linear-gradient(135deg, #6366f1, #818cf8)' : '#2563eb',
                                color: '#ffffff',
                                fontSize: '12px',
                                fontWeight: 800,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {u.username.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>{u.username}</div>
                              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{u.email}</div>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: '12px 16px' }}>
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u, e.target.value as any)}
                            disabled={u.id === user?.id}
                            style={{
                              padding: '4px 24px 4px 8px',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              borderRadius: '6px',
                              width: '130px',
                            }}
                          >
                            <option value="member">Member (L3)</option>
                            <option value="admin">Admin (L2)</option>
                            <option value="superadmin">Superadmin (L1)</option>
                          </select>
                        </td>

                        <td style={{ padding: '12px 16px' }}>
                          <span
                            className={`status-pill ${u.is_active ? 'live' : 'draft'}`}
                            style={{ fontSize: '10.5px' }}
                          >
                            ● {u.is_active ? 'Active' : 'Deactivated'}
                          </span>
                        </td>

                        <td style={{ padding: '12px 16px' }}>
                          {u.requires_password_change ? (
                            <span style={{ fontSize: '11px', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                              Password Change Req.
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#10b981' }}>
                              Verified
                            </span>
                          )}
                        </td>

                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          {u.id !== user?.id && (
                            <button
                              className={`btn btn-xs ${u.is_active ? 'btn-danger' : 'btn-secondary'}`}
                              onClick={() => handleToggleActive(u)}
                              style={{ fontSize: '11px', padding: '3px 8px' }}
                            >
                              {u.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} onCreated={loadUsers} />}
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [data, setData] = useState<UserCreate>({ email: '', username: '', password: 'password123', role: 'member' });
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!data.username || !data.email) return;
    setLoading(true);
    try {
      await usersApi.create(data);
      toast(`User account "${data.username}" created`, 'success');
      onCreated();
      onClose();
    } catch (e: any) {
      toast(e.message || 'Failed to create user', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Add New System User Account"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={loading || !data.email || !data.username}
          >
            {loading ? 'Provisioning…' : 'Create User Account'}
          </button>
        </>
      }
    >
      <div className="form-field">
        <label>Account Username</label>
        <input
          type="text"
          value={data.username}
          onChange={(e) => setData({ ...data, username: e.target.value })}
          placeholder="e.g. dev_architect"
          autoFocus
        />
      </div>

      <div className="form-field">
        <label>Email Address</label>
        <input
          type="email"
          value={data.email}
          onChange={(e) => setData({ ...data, email: e.target.value })}
          placeholder="user@nulltor.com"
        />
      </div>

      <div className="form-field">
        <label>System Hierarchy Role</label>
        <select
          value={data.role}
          onChange={(e) => setData({ ...data, role: e.target.value as any })}
        >
          <option value="member">Level 3 · Member (Project Contributor)</option>
          <option value="admin">Level 2 · Admin (Can create & manage projects)</option>
          <option value="superadmin">Level 1 · Superadmin (Full System Control & Governance)</option>
        </select>
      </div>

      <div className="form-field">
        <label>Initial Passphrase</label>
        <input
          type="text"
          value={data.password}
          onChange={(e) => setData({ ...data, password: e.target.value })}
        />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
          User will be required to update this password upon initial login.
        </span>
      </div>
    </Modal>
  );
}
