import { useEffect, useState, useCallback } from 'react';
import { membershipsApi, type MembershipWithUser } from '../../api/memberships';
import { usersApi } from '../../api/users';
import { Modal } from '../shared/Modal';
import { toast } from '../shared/Toast';
import { useAuthStore } from '../../store/authStore';

interface MembersModalProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
}

function Avatar({ name }: { name: string }) {
  const initials = name?.slice(0, 2).toUpperCase() ?? '??';
  const hue = name ? (name.charCodeAt(0) * 37) % 360 : 200;
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
      background: `hsl(${hue}, 55%, 30%)`,
      border: `2px solid hsl(${hue}, 55%, 45%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 700, color: `hsl(${hue}, 80%, 85%)`,
      letterSpacing: '0.04em',
    }}>{initials}</div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    lead:   { bg: '#7c3aed22', color: '#a78bfa', border: '1px solid #7c3aed55' },
    member: { bg: '#0f766e22', color: '#5eead4', border: '1px solid #0f766e55' },
  };
  const s = styles[role] ?? styles.member;
  return (
    <span style={{
      ...s, display: 'inline-flex', alignItems: 'center',
      padding: '2px 10px', borderRadius: 9999,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
    }}>{role}</span>
  );
}

export function MembersModal({ projectId, projectName, onClose }: MembersModalProps) {
  const [members, setMembers] = useState<MembershipWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'lead' | 'member'>('member');
  const [adding, setAdding] = useState(false);
  const [systemUsers, setSystemUsers] = useState<{ email: string; username: string }[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const currentUser = useAuthStore((s) => s.user);

  // FIX: Admin and superadmin can ALWAYS manage — don't wait for membership data
  const isSystemAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const m = await membershipsApi.list(projectId);
      setMembers(m);
    } catch {
      toast('Failed to load members', 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadMembers();
    // Load system users for anyone who can manage (checked by system role immediately)
    if (isSystemAdmin) {
      usersApi.search().then(setSystemUsers).catch(() => {});
    }
  }, [projectId, isSystemAdmin, loadMembers]);

  // For non-admin users: check if they are project lead after members load
  const myMembership = members.find(m => m.user_id === currentUser?.id);
  const canManage = isSystemAdmin || myMembership?.role === 'lead';

  // Load system users for member-role project leads too
  useEffect(() => {
    if (!isSystemAdmin && myMembership?.role === 'lead' && systemUsers.length === 0) {
      usersApi.search().then(setSystemUsers).catch(() => {});
    }
  }, [myMembership, isSystemAdmin, systemUsers.length]);

  const filteredUsers = systemUsers.filter(
    u => !members.some(m => m.email === u.email) && (
      u.email.toLowerCase().includes(email.toLowerCase()) ||
      u.username.toLowerCase().includes(email.toLowerCase())
    )
  );

  async function handleAdd() {
    if (!email.trim()) return;
    setAdding(true);
    try {
      const res = await membershipsApi.add(projectId, email.trim(), role);
      if (res.temp_password) {
        toast(`New user created! Temp password: ${res.temp_password}`, 'success');
        alert(`New user auto-created!\n\nEmail: ${email}\nTemp Password: ${res.temp_password}\n\nShare this password securely with them.`);
      } else {
        toast('Member invited successfully!', 'success');
      }
      setEmail('');
      loadMembers();
    } catch (e: any) {
      toast(e.message || 'Failed to add member', 'error');
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(userId: string, username: string) {
    if (!confirm(`Remove ${username} from this project?`)) return;
    try {
      await membershipsApi.remove(projectId, userId);
      toast('Member removed', 'success');
      setMembers(m => m.filter(x => x.user_id !== userId));
    } catch (e: any) {
      toast(e.message || 'Failed to remove member', 'error');
    }
  }

  return (
    <Modal title={`Members · ${projectName}`} onClose={onClose}>
      {/* Section: Members list */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
          Members ({members.length})
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 28 }}>
            <div className="loading-spinner" />
          </div>
        ) : members.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No members yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {members.map(m => (
              <div key={m.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', borderRadius: 8,
                background: 'var(--bg-3)',
                border: m.user_id === currentUser?.id ? '1px solid var(--accent)' : '1px solid transparent',
              }}>
                <Avatar name={m.username} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {m.username}
                    {m.user_id === currentUser?.id && (
                      <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--accent)', fontWeight: 500 }}>you</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</div>
                </div>
                <RoleBadge role={m.role} />
                {canManage && m.user_id !== currentUser?.id && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleRemove(m.user_id, m.username)}
                    style={{ marginLeft: 4 }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Divider + Invite section — always show for admins, show after load for leads */}
      {(canManage || isSystemAdmin) && (
        <div>
          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0 16px' }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>
            Invite User
          </div>

          {/* User search — full width */}
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <input
              type="email"
              className="form-input"
              placeholder="Search by username or type an email address..."
              value={email}
              onChange={e => { setEmail(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            />
            {showDropdown && filteredUsers.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                marginTop: 4, background: 'var(--bg-2)',
                border: '1px solid var(--border-hi)', borderRadius: 8,
                boxShadow: '0 12px 30px rgba(0,0,0,0.6)', overflow: 'hidden',
                maxHeight: 200, overflowY: 'auto',
              }}>
                {filteredUsers.map(u => (
                  <div
                    key={u.email}
                    onClick={() => { setEmail(u.email); setShowDropdown(false); }}
                    style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-3)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Avatar name={u.username} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{u.username}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Role selector */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {(['member', 'lead'] as const).map(r => (
              <label
                key={r}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${role === r ? 'var(--accent)' : 'var(--border)'}`,
                  background: role === r ? 'rgba(99,102,241,0.12)' : 'var(--bg-3)',
                  transition: 'all var(--transition)',
                }}
              >
                <input
                  type="radio"
                  name="invite-role"
                  value={r}
                  checked={role === r}
                  onChange={() => setRole(r)}
                  style={{ accentColor: 'var(--accent)', width: 15, height: 15 }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, textTransform: 'capitalize' }}>{r}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {r === 'lead' ? 'Can manage members & branches' : 'Can view & collaborate'}
                  </div>
                </div>
              </label>
            ))}
          </div>

          {/* Invite button */}
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
            disabled={adding || !email.trim()}
            onClick={handleAdd}
          >
            {adding ? (
              <><div className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Inviting…</>
            ) : (
              '+ Invite Member'
            )}
          </button>
        </div>
      )}
    </Modal>
  );
}
