import { useEffect, useState, useCallback } from 'react';
import { logsApi, type AuditLogRead } from '../api/logs';
import { Sidebar } from '../components/shared/Sidebar';
import { toast } from '../components/shared/Toast';
<<<<<<< Updated upstream
=======
import { Trash2, Key, GitBranch, GitMerge, Edit, FileText, PlusCircle, ChevronDown, ChevronRight, Menu } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
>>>>>>> Stashed changes

export function AuditLogsPage() {
  const { toggleSidebar } = useUIStore();
  const [logs, setLogs] = useState<AuditLogRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [resourceFilter, setResourceFilter] = useState('');
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadLogs = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = await logsApi.list({
        page: p,
        page_size: 30,
        resource_type: resourceFilter || undefined,
      });
      if (p === 1) {
        setLogs(data.items);
      } else {
        setLogs((prev) => [...prev, ...data.items]);
      }
      setHasMore(data.items.length === 30);
    } catch {
      toast('Failed to load system audit telemetry', 'error');
    } finally {
      setLoading(false);
    }
  }, [resourceFilter]);

  useEffect(() => {
    setPage(1);
    loadLogs(1);
  }, [loadLogs]);

  const filteredLogs = logs.filter(
    (log) =>
      log.action.toLowerCase().includes(search.toLowerCase()) ||
      (log.actor_id && log.actor_id.toLowerCase().includes(search.toLowerCase())) ||
      (log.resource_type && log.resource_type.toLowerCase().includes(search.toLowerCase()))
  );

  const getActionIcon = (action: string) => {
    if (action.includes('create')) return '✨';
    if (action.includes('delete')) return '🗑️';
    if (action.includes('login')) return '🔑';
    if (action.includes('branch')) return '🌿';
    if (action.includes('merge')) return '🔀';
    return '📝';
  };

  const getActionColorClass = (action: string) => {
    if (action.includes('delete')) return 'private';
    if (action.includes('create') || action.includes('branch')) return 'main';
    return 'subroom';
  };

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <div className="page-container">
          {/* Header & Controls */}
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
                  System Audit <span style={{ color: 'var(--sapphire-light)' }}>Telemetry</span>
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '3px' }}>
                  Alternate timeline stream of security actions across workspaces, branches, and user sessions.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="form-field" style={{ margin: 0, width: '220px' }}>
                <input
                  type="text"
                  placeholder="Filter by action or user…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ padding: '7px 12px', fontSize: '13px' }}
                />
              </div>

              <div className="form-field" style={{ margin: 0, width: '170px' }}>
                <select
                  value={resourceFilter}
                  onChange={(e) => setResourceFilter(e.target.value)}
                  style={{ padding: '7px 12px', fontSize: '13px' }}
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

          {/* Telemetry Stats Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '32px' }}>
            <div className="stat-box">
              <div className="stat-value">{filteredLogs.length}</div>
              <div className="stat-label">Logged Audit Events</div>
            </div>
            <div className="stat-box">
              <div className="stat-value" style={{ color: 'var(--palette-sky)' }}>
                {resourceFilter ? resourceFilter.toUpperCase() : 'ALL SYSTEM'}
              </div>
              <div className="stat-label">Active Resource Scope</div>
            </div>
            <div className="stat-box">
              <div className="stat-value" style={{ color: 'var(--palette-mint)' }}>
                IMMUTABLE
              </div>
              <div className="stat-label">Telemetry Log Status</div>
            </div>
          </div>

          {/* Expandable Audit Telemetry Table */}
          {loading && logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-secondary)' }}>
              Loading audit telemetry logs…
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="glass-card" style={{ padding: '48px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>📜</div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>No Audit Logs Found</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                No events match your current filter parameters.
              </p>
            </div>
          ) : (
            <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
              {/* Table Header */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1.8fr 1.5fr 1.2fr 1.2fr',
                  padding: '12px 16px',
                  background: 'var(--bg-2)',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-secondary)',
                  alignItems: 'center',
                }}
              >
                <div />
                <div>Action / Event</div>
                <div>User / Actor</div>
                <div>Resource</div>
                <div style={{ textAlign: 'right' }}>Timestamp</div>
              </div>

              {/* Table Rows */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {filteredLogs.map((log) => {
                  const isExpanded = expandedIds.has(log.id);
                  const dateObj = new Date(log.created_at);
                  const dateStr = dateObj.toLocaleDateString();
                  const timeStr = dateObj.toLocaleTimeString();

                  return (
                    <div
                      key={log.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Main Clickable Row */}
                      <div
                        onClick={() => toggleExpand(log.id)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '40px 1.8fr 1.5fr 1.2fr 1.2fr',
                          padding: '14px 16px',
                          alignItems: 'center',
                          cursor: 'pointer',
                          background: isExpanded ? 'var(--bg-2)' : 'transparent',
                        }}
                        onMouseEnter={(e) => {
                          if (!isExpanded) e.currentTarget.style.background = 'var(--bg-2)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isExpanded) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className={`branch-pill ${getActionColorClass(log.action)}`} style={{ padding: '2px 8px', fontSize: '10.5px' }}>
                            {log.action.toUpperCase()}
                          </span>
                          <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                            {log.action}
                          </span>
                        </div>

                        <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', fontWeight: 600 }}>
                          {log.actor_id ? log.actor_id : 'System'}
                        </div>

                        <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                          {log.resource_type || 'General'}
                        </div>

                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {dateStr} · {timeStr}
                        </div>
                      </div>

                      {/* Dropdown Expandable Details Section */}
                      {isExpanded && (
                        <div
                          style={{
                            padding: '16px 20px 20px 56px',
                            background: 'var(--bg-0)',
                            borderTop: '1px solid var(--border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            animation: 'slideDown 0.15s ease-out',
                          }}
                        >
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                            <div style={{ padding: '10px 12px', background: 'var(--bg-1)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>Actor ID</div>
                              <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                                {log.actor_id || 'System Event'}
                              </div>
                            </div>

                            <div style={{ padding: '10px 12px', background: 'var(--bg-1)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>Target Resource</div>
                              <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {log.resource_type || 'N/A'} {log.resource_id ? `(${log.resource_id})` : ''}
                              </div>
                            </div>

                            <div style={{ padding: '10px 12px', background: 'var(--bg-1)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>Client IP Address</div>
                              <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                                {log.ip_address || '127.0.0.1 (Local)'}
                              </div>
                            </div>

                            <div style={{ padding: '10px 12px', background: 'var(--bg-1)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>Logged Timestamp</div>
                              <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {dateObj.toISOString()}
                              </div>
                            </div>
                          </div>

                          {log.detail && Object.keys(log.detail).length > 0 && (
                            <div style={{ marginTop: '4px' }}>
                              <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                Event Payload & Diagnostics:
                              </div>
                              <pre
                                className="font-mono"
                                style={{
                                  background: 'var(--bg-1)',
                                  padding: '12px 14px',
                                  borderRadius: '6px',
                                  border: '1px solid var(--border)',
                                  fontSize: '11.5px',
                                  overflowX: 'auto',
                                  color: 'var(--text-primary)',
                                  margin: 0,
                                }}
                              >
                                {JSON.stringify(log.detail, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!loading && hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '32px 0' }}>
              <button
                className="btn btn-secondary btn-lg"
                onClick={() => {
                  const nextPage = page + 1;
                  setPage(nextPage);
                  loadLogs(nextPage);
                }}
              >
                Load Older Telemetry Events ↓
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
