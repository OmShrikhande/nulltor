import { useEffect, useState, useCallback } from 'react';
import { logsApi, type AuditLogRead } from '../api/logs';
import { Sidebar } from '../components/shared/Sidebar';
import { toast } from '../components/shared/Toast';

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [resourceFilter, setResourceFilter] = useState('');
  const [search, setSearch] = useState('');

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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: 800 }}>
                System Audit <span className="text-gradient">Telemetry</span>
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px', marginTop: '4px' }}>
                Alternate timeline stream of security actions across workspaces, branches, and user sessions.
              </p>
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

          {/* Alternating Branch Timeline Stream */}
          {loading && logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-secondary)' }}>
              Loading audit telemetry timeline…
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
            <div className="telemetry-timeline-wrapper">
              <div className="telemetry-branch-stem" />

              {filteredLogs.map((log, index) => {
                const isLeft = index % 2 === 0;
                const dateObj = new Date(log.created_at);
                const dateStr = dateObj.toLocaleDateString();
                const timeStr = dateObj.toLocaleTimeString();

                return (
                  <div key={log.id} className={`telemetry-row ${isLeft ? 'left' : 'right'}`}>
                    {/* Central Branch Node */}
                    <div className="telemetry-node-center">
                      {getActionIcon(log.action)}
                    </div>

                    {/* Alternating Card Content */}
                    <div className="telemetry-card-content">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span className={`branch-pill ${getActionColorClass(log.action)}`}>
                          {log.action.toUpperCase()}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {dateStr} · {timeStr}
                        </span>
                      </div>

                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                        User: <span style={{ color: 'var(--palette-sky)' }}>{log.actor_id ? log.actor_id.slice(0, 8) : 'System'}</span>
                      </div>

                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {log.resource_type && (
                          <span>Target: <strong>{log.resource_type}</strong></span>
                        )}
                        {log.ip_address && (
                          <span>IP: <code className="font-mono">{log.ip_address}</code></span>
                        )}
                      </div>

                      {log.detail && Object.keys(log.detail).length > 0 && (
                        <details style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border)', fontSize: '11.5px' }}>
                          <summary style={{ cursor: 'pointer', color: 'var(--aurora-mint)', fontWeight: 600 }}>
                            Inspect Event Payload
                          </summary>
                          <pre
                            className="font-mono"
                            style={{
                              background: 'var(--bg-2)',
                              padding: '8px 10px',
                              borderRadius: 'var(--radius-xs)',
                              marginTop: '6px',
                              fontSize: '11px',
                              overflowX: 'auto',
                              color: 'var(--text-primary)',
                            }}
                          >
                            {JSON.stringify(log.detail, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                );
              })}
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
