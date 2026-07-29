import { useEffect, useState, useCallback } from 'react';
import { usersApi, type UserCreate } from '../api/users';
import { type UserRead } from '../api/auth';
import { Sidebar } from '../components/shared/Sidebar';
import { toast } from '../components/shared/Toast';
import { Modal } from '../components/shared/Modal';

export function SystemUsersPage() {
  const [users, setUsers] = useState<UserRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await usersApi.list();
      setUsers(data.items);
    } catch (e) {
      toast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  async function handleToggleActive(user: UserRead) {
    try {
      await usersApi.update(user.id, { is_active: !user.is_active });
      toast(`User ${user.username} ${user.is_active ? 'deactivated' : 'activated'}`, 'success');
      loadUsers();
    } catch (e) {
      toast('Failed to update user', 'error');
    }
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <div className="topbar">
          <span className="topbar-title">System Users</span>
          <div className="topbar-actions">
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
              + Add User
            </button>
          </div>
        </div>

        <div className="view-container">
          <div className="page-header">
            <div>
              <div className="page-title">Manage Members</div>
              <div className="page-desc">System administrators can invite new members to Nulltor and manage roles.</div>
            </div>
          </div>

          <div style={{ background: 'var(--bg-1)', borderRadius: 6, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><div className="loading-spinner" /></div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-2)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Username</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Email</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Role</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px' }}><strong>{u.username}</strong></td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{u.email}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span className={`badge badge-role-${u.role}`}>{u.role}</span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {u.is_active ? <span className="badge badge-primary">Active</span> : <span className="badge">Inactive</span>}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleToggleActive(u)}>
                          {u.is_active ? 'Deactivate' : 'Activate'}
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
    setLoading(true);
    try {
      await usersApi.create(data);
      toast('User created successfully', 'success');
      onCreated();
      onClose();
    } catch (e: any) {
      toast(e.message || 'Failed to create user', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="New System User" onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleCreate} disabled={loading || !data.email || !data.username}>Create User</button>
      </>
    }>
      <div className="form-field">
        <label>Username</label>
        <input type="text" value={data.username} onChange={e => setData({...data, username: e.target.value})} autoFocus />
      </div>
      <div className="form-field">
        <label>Email</label>
        <input type="email" value={data.email} onChange={e => setData({...data, email: e.target.value})} />
      </div>
      <div className="form-field">
        <label>Role</label>
        <select value={data.role} onChange={e => setData({...data, role: e.target.value as any})} className="form-input">
          <option value="member">Member (Can only be invited to projects)</option>
          <option value="admin">Admin (Can create projects)</option>
          <option value="superadmin">Superadmin (Can manage system users)</option>
        </select>
      </div>
      <div className="form-field">
        <label>Initial Password</label>
        <input type="text" value={data.password} onChange={e => setData({...data, password: e.target.value})} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>They will be prompted to change this on first login.</span>
      </div>
    </Modal>
  );
}
