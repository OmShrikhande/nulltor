import { useEffect, useState, useCallback } from 'react';
import { usersApi, type UserCreate } from '../api/users';
import { type UserRead } from '../api/auth';
import { Sidebar } from '../components/shared/Sidebar';
import { toast } from '../components/shared/Toast';
import { Modal } from '../components/shared/Modal';
<<<<<<< Updated upstream
=======
import { Shield, UserPlus, Key, Mail, User, ShieldAlert, CheckCircle2, XCircle, Menu, Crown, Laptop } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
>>>>>>> Stashed changes

export function SystemUsersPage() {
  const { toggleSidebar } = useUIStore();
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

  async function handleToggleActive(user: UserRead) {
    try {
      await usersApi.update(user.id, { is_active: !user.is_active });
      toast(`User "${user.username}" ${user.is_active ? 'deactivated' : 'activated'}`, 'success');
      loadUsers();
    } catch {
      toast('Failed to update user status', 'error');
    }
  }

  async function handleRoleChange(user: UserRead, newRole: 'superadmin' | 'admin' | 'member') {
    try {
      await usersApi.update(user.id, { role: newRole });
      toast(`Role for ${user.username} updated to ${newRole.toUpperCase()}`, 'success');
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

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <div className="page-container">
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <button
                className="btn-icon"
                onClick={toggleSidebar}
                title="Toggle Navigation Menu"
                style={{
                  width: '36px',
                  height: '36px',
                  background: 'var(--bg-1)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Menu size={18} />
              </button>

              <div>
                <h1 style={{ fontSize: '24px', fontWeight: 800 }}>
                  System <span style={{ color: 'var(--sapphire-light)' }}>Governance</span> & User Hierarchy
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '3px' }}>
                  Manage user access permissions, elevate roles according to security hierarchy, and add new system members.
                </p>
              </div>
            </div>

            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              + Add New User
            </button>
          </div>

          {/* User Hierarchy Level Breakdown Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' }}>
            <div className="glass-card" style={{ borderLeft: '4px solid var(--aurora-violet)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--aurora-violet)', textTransform: 'uppercase' }}>
                  👑 Level 1 · Superadmin
                </span>
                <span className="branch-pill private">{superadminCount} Users</span>
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                Full system control, global audit telemetry, user provisioning & project deletion rights.
              </p>
            </div>

            <div className="glass-card" style={{ borderLeft: '4px solid var(--aurora-blue)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--aurora-blue)', textTransform: 'uppercase' }}>
                  🛡️ Level 2 · Admin
                </span>
                <span className="branch-pill subroom">{adminCount} Users</span>
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                Project workspace creation, team invitation, branch management & project settings.
              </p>
            </div>

            <div className="glass-card" style={{ borderLeft: '4px solid var(--aurora-mint)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--aurora-mint)', textTransform: 'uppercase' }}>
                  💻 Level 3 · Member
                </span>
                <span className="branch-pill main">{memberCount} Users</span>
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                Real-time E2EE collaborative editing, subroom branch creation & code execution.
              </p>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', width: '100%', maxWidth: '500px' }}>
              <div className="form-field" style={{ margin: 0, flex: 1 }}>
                <input
                  type="text"
                  placeholder="Search by username or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ padding: '7px 12px', fontSize: '13px' }}
                />
              </div>

              <div className="form-field" style={{ margin: 0, width: '160px' }}>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  style={{ padding: '7px 12px', fontSize: '13px' }}
                >
                  <option value="all">All Roles</option>
                  <option value="superadmin">Superadmin</option>
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                </select>
              </div>
            </div>

            <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
              Showing {filteredUsers.length} of {users.length} accounts
            </div>
          </div>

          {/* Users Hierarchy Table */}
          <div style={{ background: 'var(--bg-1)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
            {loading ? (
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Loading system accounts…
              </div>
            ) : filteredUsers.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No accounts found matching search filter.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-2)', borderBottom: '1px solid var(--border)', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>User / Account</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Email Address</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Hierarchy Level</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Management Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background var(--transition-fast)' }}>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div className="user-avatar" style={{ width: 32, height: 32 }}>
                            {u.username.slice(0, 2).toUpperCase()}
                          </div>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{u.username}</span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>{u.email}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u, e.target.value as any)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--bg-2)',
                            border: '1px solid var(--border)',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="member">Level 3 · Member</option>
                          <option value="admin">Level 2 · Admin</option>
                          <option value="superadmin">Level 1 · Superadmin</option>
                        </select>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {u.is_active ? (
                          <span className="status-pill live">Active</span>
                        ) : (
                          <span className="status-pill offline">Disabled</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <button
                          className={`btn btn-sm ${u.is_active ? 'btn-ghost' : 'btn-primary'}`}
                          onClick={() => handleToggleActive(u)}
                        >
                          {u.is_active ? 'Deactivate Account' : 'Enable Account'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

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
          <button
            className="btn"
            style={{
              background: 'rgba(13, 148, 136, 0.15)',
              border: '1px solid #0d9488',
              color: '#14b8a6',
              fontWeight: 600,
            }}
            onClick={onClose}
          >
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
        <label style={{ color: '#0d9488', fontWeight: 700 }}>Account Username</label>
        <input
          type="text"
          value={data.username}
          onChange={(e) => setData({ ...data, username: e.target.value })}
          placeholder="e.g. dev_architect"
          autoFocus
        />
      </div>

      <div className="form-field">
        <label style={{ color: '#0d9488', fontWeight: 700 }}>Email Address</label>
        <input
          type="email"
          value={data.email}
          onChange={(e) => setData({ ...data, email: e.target.value })}
          placeholder="user@nulltor.com"
        />
      </div>

      <div className="form-field">
        <label style={{ color: '#0d9488', fontWeight: 700 }}>System Hierarchy Role</label>
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
        <label style={{ color: '#0d9488', fontWeight: 700 }}>Initial Passphrase</label>
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
