import React, { useState, useEffect, useCallback } from 'react';
import { membershipsApi, type MembershipWithUser } from '../../api/memberships';
import { branchesApi, type BranchMemberRead } from '../../api/branches';
import { toast } from '../shared/Toast';
import { Modal } from '../shared/Modal';
import { Socket } from 'socket.io-client';
import { Users, UserPlus, Check, Search, Clock } from 'lucide-react';

interface InviteSubroomModalProps {
  isOpen: boolean;
  projectId: string;
  branchId: string;
  branchName: string;
  currentUserId?: string;
  inviterName?: string;
  socket: Socket | null;
  onClose: () => void;
  onMemberAdded?: () => void;
}

const INVITE_TIMEOUT_SECONDS = 30;

export function InviteSubroomModal({
  isOpen,
  projectId,
  branchId,
  branchName,
  currentUserId,
  inviterName = 'Team Member',
  socket,
  onClose,
  onMemberAdded,
}: InviteSubroomModalProps) {
  const [projectMembers, setProjectMembers] = useState<MembershipWithUser[]>([]);
  const [branchMembers, setBranchMembers] = useState<BranchMemberRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  
  // Maps userId -> expire timestamp (ms)
  const [pendingInvites, setPendingInvites] = useState<Record<string, number>>({});
  const [, setTick] = useState(0);

  const loadMembers = useCallback(async () => {
    try {
      const [membersRes, branchMembersRes] = await Promise.all([
        membershipsApi.list(projectId),
        branchId && branchId !== 'main'
          ? branchesApi.listMembers(projectId, branchId).catch(() => [])
          : Promise.resolve([]),
      ]);
      setProjectMembers(membersRes);
      setBranchMembers(branchMembersRes);
    } catch (err: any) {
      toast(err.message || 'Failed to load project members', 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId, branchId]);

  useEffect(() => {
    if (!isOpen || !projectId || !branchId) return;
    setLoading(true);
    loadMembers();
  }, [isOpen, projectId, branchId, loadMembers]);

  // Periodic tick to update remaining countdowns and clean up expired invites
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Listen for real-time response when invited peer accepts or rejects
  useEffect(() => {
    if (!socket || !isOpen) return;

    const handleInviteResponse = (data: {
      targetUserId: string;
      accepted: boolean;
      branchId: string;
      branchName: string;
      responderName: string;
    }) => {
      if (data.branchId !== branchId) return;

      if (data.accepted) {
        toast(`${data.responderName} accepted the invitation to "${branchName}"!`, 'success');
        // Remove from pending and reload members to show as Member
        setPendingInvites((prev) => {
          const next = { ...prev };
          delete next[data.targetUserId];
          return next;
        });
        loadMembers();
        if (onMemberAdded) onMemberAdded();
      } else {
        toast(`${data.responderName} declined the invitation to "${branchName}".`, 'info');
        // Immediately reset button back to active "Invite"
        setPendingInvites((prev) => {
          const next = { ...prev };
          delete next[data.targetUserId];
          return next;
        });
      }
    };

    socket.on('subroom-invite-response-received', handleInviteResponse);
    return () => {
      socket.off('subroom-invite-response-received', handleInviteResponse);
    };
  }, [socket, isOpen, branchId, branchName, loadMembers, onMemberAdded]);

  if (!isOpen) return null;

  const existingMemberIds = new Set(
    branchId === 'main' ? [] : branchMembers.map((bm) => bm.user_id)
  );

  const filteredMembers = projectMembers.filter((m) => {
    if (m.user_id === currentUserId) return false;
    const term = search.toLowerCase();
    return (
      m.username.toLowerCase().includes(term) ||
      m.email.toLowerCase().includes(term)
    );
  });

  async function handleInvite(member: MembershipWithUser) {
    setInvitingId(member.user_id);
    
    // 1. Immediately set pending invited state with expiration countdown
    const expiresAt = Date.now() + INVITE_TIMEOUT_SECONDS * 1000;
    setPendingInvites((prev) => ({
      ...prev,
      [member.user_id]: expiresAt,
    }));

    try {
      // 2. Broadcast real-time socket invitation notification requesting permission from target user
      if (socket) {
        socket.emit('subroom-invite', {
          targetUserId: member.user_id,
          projectId,
          branchId,
          branchName,
          inviterName,
          inviterUserId: currentUserId,
        });
      }

      toast(`Invitation request sent to ${member.username}. Waiting for their response…`, 'info');
    } catch (err: any) {
      // If failed, revert the pending state
      setPendingInvites((prev) => {
        const next = { ...prev };
        delete next[member.user_id];
        return next;
      });
      toast(err.message || `Failed to invite ${member.username}`, 'error');
    } finally {
      setInvitingId(null);
    }
  }

  const now = Date.now();

  return (
    <Modal
      title={`Invite Peers to "${branchName}"`}
      onClose={onClose}
      footer={
        <button className="btn btn-secondary" onClick={onClose}>
          Done
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
          Send invitations to project members. Invited peers will receive a real-time notification to join.
        </p>

        {/* Search Input */}
        <div style={{ position: 'relative' }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="text"
            placeholder="Search members by username or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 32px',
              fontSize: '13px',
              background: 'var(--bg-0)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
        </div>

        {/* Members List */}
        <div
          style={{
            maxHeight: '280px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {loading ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              Loading project members…
            </div>
          ) : filteredMembers.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              {search ? 'No matching members found.' : 'No other project members available to invite.'}
            </div>
          ) : (
            filteredMembers.map((member) => {
              const isAlreadyMember = existingMemberIds.has(member.user_id);
              const inviteExpire = pendingInvites[member.user_id];
              const isPending = Boolean(inviteExpire && inviteExpire > now);
              const remainingSec = isPending ? Math.ceil((inviteExpire - now) / 1000) : 0;
              const isInviting = invitingId === member.user_id;

              return (
                <div
                  key={member.user_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: 'var(--bg-1)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #0f52ba, #38bdf8)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '13px',
                      }}
                    >
                      {member.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                          {member.username}
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: member.role === 'lead' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                            color: member.role === 'lead' ? '#60a5fa' : 'var(--text-secondary)',
                            textTransform: 'uppercase',
                          }}
                        >
                          {member.role}
                        </span>
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                        {member.email}
                      </div>
                    </div>
                  </div>

                  <div>
                    {isAlreadyMember ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                          color: '#10b981',
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: 'rgba(16, 185, 129, 0.08)',
                          border: '1px solid rgba(16, 185, 129, 0.2)',
                        }}
                      >
                        <Check size={13} /> Member
                      </span>
                    ) : isPending ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '12px',
                          color: '#f59e0b',
                          fontWeight: 600,
                          padding: '5px 12px',
                          borderRadius: '6px',
                          background: 'rgba(245, 158, 11, 0.08)',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          cursor: 'not-allowed',
                          userSelect: 'none',
                        }}
                        title="Invitation sent. Waiting for peer response or timeout."
                      >
                        <Clock size={12} /> Invited ({remainingSec}s)
                      </span>
                    ) : (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => handleInvite(member)}
                        disabled={isInviting}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '12px',
                          padding: '5px 12px',
                          borderRadius: '6px',
                        }}
                      >
                        <UserPlus size={13} />
                        {isInviting ? 'Inviting…' : 'Invite'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}
