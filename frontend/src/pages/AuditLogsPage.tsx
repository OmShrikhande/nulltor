import { useEffect, useState, useCallback } from 'react';
import { logsApi, type AuditLogRead } from '../api/logs';
import { Sidebar } from '../components/shared/Sidebar';
import { toast } from '../components/shared/Toast';
import { Trash2, Key, GitBranch, GitMerge, Edit, FileText, PlusCircle, Shield, ChevronDown, ChevronUp } from 'lucide-react';

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [resourceFilter, setResourceFilter] = useState('');
  const [search, setSearch] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const loadLogs = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = await logsApi.list({
        page: p,
        page_size: 40,
        resource_type: resourceFilter || undefined,
      });
      if (p === 1) {
        setLogs(data.items);
      } else {
        setLogs((prev) => [...prev, ...data.items]);
      }
      setHasMore(data.items.length === 40);
    } catch {
      toast('Failed to load audit telemetry', 'error');
    } finally {
      setLoading(false);
    }
  }, [resourceFilter]);

  useEffect(() => {
    setPage(1);
    loadLogs(1);
  }, [loadLogs]);

  const filteredLogs = logs.filter((log) => {
    const term = search.toLowerCase();
    const actor = (log.actor_username || log.actor_id || '').toLowerCase();
    const action = log.action.toLowerCase();
    const resource = (log.resource_type || '').toLowerCase();
    const ip = (log.ip_address || '').toLowerCase();
    return action.includes(term) || actor.includes(term) || resource.includes(term) || ip.includes(term);
  });

  const getActionBadge = (action: string) => {
    const act = action.toLowerCase();
    const label = action.replace(/_/g, ' ').toUpperCase();

    if (act.includes('delete') || act.includes('remove')) {
      return {
        icon: <Trash2 size={13} />,
        color: '#f87171',
        bg: 'rgba(239, 68, 68, 0.1)',
        border: 'rgba(239, 68, 68, 0.25)',
        label,
      };
    }
    if (act.includes('create') || act.includes('branch')) {
      return {
        icon: <PlusCircle size={13} />,
        color: '#34d399',
        bg: 'rgba(16, 185, 129, 0.1)',
        border: 'rgba(16, 185, 129, 0.25)',
        label,
      };
    }
    if (act.includes('grant') || act.includes('member')) {
      return {
        icon: <Shield size={13} />,
        color: '#60a5fa',
        bg: 'rgba(59, 130, 246, 0.1)',
        border: 'rgba(59, 130, 246, 0.25)',
        label,
      };
    }
    if (act.includes('login')) {
      return {
        icon: <Key size={13} />,
        color: '#cbd5e1',
        bg: 'rgba(255, 255, 255, 0.06)',
        border: 'rgba(255, 255, 255, 0.12)',
        label,
      };
    }
    return {
      icon: <Edit size={13} />,
      color: '#a78bfa',
      bg: 'rgba(167, 139, 250, 0.1)',
      border: 'rgba(167, 139, 250, 0.25)',
      label,
    };
  };

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content" style={{ zIndex: 10 }}>
        <div className="page-container">
          {/* Header & Search Controls */}
          <div className="animate-fade-in-up stagger-1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em', margin: 0 }}>
                Audit <span style={{ color: '#3b82f6' }}>Telemetry</span>
              </h1>
              <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px', margin: 0 }}>
                Immutable operational and security audit stream across workspaces and sessions.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ margin: 0, width: '240px' }}>
                <input
                  type="text"
                  placeholder="Filter logs by user, action, IP…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 14px',
                    fontSize: '13px',
                    background: '#15161a',
                    borderRadius: '8px',
                    border: '1px solid #22242c',
                    color: '#f8fafc',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ margin: 0, width: '160px' }}>
                <select
                  value={resourceFilter}
                  onChange={(e) => setResourceFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '13px',
                    background: '#15161a',
                    borderRadius: '8px',
                    border: '1px solid #22242c',
                    color: '#f8fafc',
                    outline: 'none',
                  }}
                >
                  <option value="">All Resources</option>
                  <option value="project">Project</option>
                  <option value="branch">Branch</option>
                  <option value="user">User</option>
                  <option value="session">Session</option>
                </select>
              </div>
            </div>
          </div>

          {/* Top Metrics Shelf */}
          <div className="animate-fade-in-up stagger-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
            <div style={{
              background: '#15161a',
              border: '1px solid #22242c',
              borderRadius: '12px',
              padding: '16px 20px',
            }}>
              <div style={{ fontSize: '12.5px', color: '#94a3b8', fontWeight: 500 }}>
                Logged Audit Events
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#f8fafc', marginTop: '6px', letterSpacing: '-0.02em' }}>
                {filteredLogs.length}
              </div>
            </div>

            <div style={{
              background: '#15161a',
              border: '1px solid #22242c',
              borderRadius: '12px',
              padding: '16px 20px',
            }}>
              <div style={{ fontSize: '12.5px', color: '#94a3b8', fontWeight: 500 }}>
                Active Scope
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#60a5fa', marginTop: '6px', letterSpacing: '-0.02em' }}>
                {resourceFilter ? resourceFilter.toUpperCase() : 'ALL SYSTEM'}
              </div>
            </div>

            <div style={{
              background: '#15161a',
              border: '1px solid #22242c',
              borderRadius: '12px',
              padding: '16px 20px',
            }}>
              <div style={{ fontSize: '12.5px', color: '#94a3b8', fontWeight: 500 }}>
                Log Integrity
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#34d399', marginTop: '6px', letterSpacing: '-0.02em' }}>
                IMMUTABLE
              </div>
            </div>
          </div>

          {/* Normal Table / List Feed */}
          <div className="animate-fade-in-up stagger-3">
            <div style={{
              background: '#15161a',
              border: '1px solid #22242c',
              borderRadius: '12px',
              overflow: 'hidden',
            }}>
              {/* Table Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '190px 180px 1fr 140px 160px 40px',
                padding: '12px 20px',
                background: '#18191e',
                borderBottom: '1px solid #22242c',
                fontSize: '11.5px',
                fontWeight: 700,
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>
                <div>Action</div>
                <div>Actor</div>
                <div>Resource / Details</div>
                <div>Client IP</div>
                <div style={{ textAlign: 'right' }}>Timestamp</div>
                <div></div>
              </div>

              {/* Table Body */}
              {loading && logs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8', fontSize: '13px' }}>
                  Loading audit logs…
                </div>
              ) : filteredLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8', fontSize: '13px' }}>
                  No audit events found matching your filter.
                </div>
              ) : (
                filteredLogs.map((log) => {
                  const badge = getActionBadge(log.action);
                  const actorName = log.actor_username || (log.actor_id ? log.actor_id.slice(0, 8) : 'superadmin');
                  const dateObj = new Date(log.created_at);
                  const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
                  const isExpanded = expandedLogId === log.id;
                  const hasDetails = log.detail && Object.keys(log.detail).length > 0;

                  return (
                    <div key={log.id} style={{ borderBottom: '1px solid #22242c' }}>
                      <div
                        onClick={() => hasDetails && setExpandedLogId(isExpanded ? null : log.id)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '190px 180px 1fr 140px 160px 40px',
                          alignItems: 'center',
                          padding: '13px 20px',
                          fontSize: '12.5px',
                          color: '#f8fafc',
                          background: isExpanded ? 'rgba(59, 130, 246, 0.04)' : 'transparent',
                          cursor: hasDetails ? 'pointer' : 'default',
                          transition: 'background 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (!isExpanded) e.currentTarget.style.background = '#18191e';
                        }}
                        onMouseLeave={(e) => {
                          if (!isExpanded) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        {/* Action Badge */}
                        <div>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            background: badge.bg,
                            border: `1px solid ${badge.border}`,
                            color: badge.color,
                            fontSize: '11px',
                            fontWeight: 700,
                          }}>
                            {badge.icon}
                            {badge.label}
                          </span>
                        </div>

                        {/* Actor */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #0f52ba, #38bdf8)',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: 700,
                          }}>
                            {actorName.charAt(0).toUpperCase()}
                          </div>
                          <span style={{ fontWeight: 600, color: '#f8fafc' }}>
                            {actorName}
                          </span>
                        </div>

                        {/* Resource / Details Summary */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.resource_type && (
                            <span style={{
                              fontSize: '10.5px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'rgba(255, 255, 255, 0.06)',
                              color: '#94a3b8',
                              textTransform: 'uppercase',
                              fontWeight: 600,
                            }}>
                              {log.resource_type}
                            </span>
                          )}
                          <span style={{ color: '#94a3b8', fontSize: '12px' }}>
                            {log.detail && typeof log.detail === 'object'
                              ? Object.entries(log.detail).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')
                              : 'System Event'}
                          </span>
                        </div>

                        {/* IP Address */}
                        <div>
                          <span style={{
                            fontFamily: 'monospace',
                            fontSize: '11.5px',
                            color: '#94a3b8',
                            background: '#18191e',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: '1px solid #282a32',
                          }}>
                            {log.ip_address || '127.0.0.1'}
                          </span>
                        </div>

                        {/* Timestamp */}
                        <div style={{ textAlign: 'right', fontSize: '12px', color: '#94a3b8' }}>
                          <span style={{ color: '#f8fafc', fontWeight: 500 }}>{timeStr}</span> <span style={{ color: '#64748b' }}>· {dateStr}</span>
                        </div>

                        {/* Expand Icon */}
                        <div style={{ textAlign: 'right', color: '#64748b' }}>
                          {hasDetails && (isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                        </div>
                      </div>

                      {/* Expandable JSON Payload Drawer */}
                      {isExpanded && log.detail && (
                        <div style={{
                          padding: '12px 20px',
                          background: '#121316',
                          borderTop: '1px solid #1f2128',
                        }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', marginBottom: '6px' }}>
                            Event Detail Payload
                          </div>
                          <pre style={{
                            margin: 0,
                            padding: '10px 14px',
                            borderRadius: '6px',
                            background: '#0d0e11',
                            border: '1px solid #1f2128',
                            fontFamily: 'monospace',
                            fontSize: '11.5px',
                            color: '#34d399',
                            overflowX: 'auto',
                          }}>
                            {JSON.stringify(log.detail, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Pagination */}
          {!loading && hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
              <button
                className="btn btn-ghost"
                style={{
                  background: '#15161a',
                  border: '1px solid #22242c',
                  color: '#f8fafc',
                  padding: '10px 24px',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}
                onClick={() => {
                  const nextPage = page + 1;
                  setPage(nextPage);
                  loadLogs(nextPage);
                }}
              >
                Load More Events ↓
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
