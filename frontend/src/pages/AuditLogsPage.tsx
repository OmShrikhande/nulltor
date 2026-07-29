import { useEffect, useState, useCallback } from 'react';
import { logsApi, type AuditLogRead } from '../api/logs';
import { Sidebar } from '../components/shared/Sidebar';
import { toast } from '../components/shared/Toast';

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const loadLogs = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = await logsApi.list({ page: p, page_size: 50 });
      if (p === 1) {
        setLogs(data.items);
      } else {
        setLogs((prev) => [...prev, ...data.items]);
      }
      setHasMore(data.items.length === 50);
    } catch (e) {
      toast('Failed to load audit logs', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLogs(1); }, [loadLogs]);

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <div className="topbar">
          <span className="topbar-title">System Audit Logs</span>
        </div>

        <div className="view-container">
          <div className="page-header">
            <div>
              <div className="page-title">Recent Activity</div>
              <div className="page-desc">System-wide audit trail of all actions across projects and branches.</div>
            </div>
          </div>

          <div className="log-list">
            {logs.map((log) => (
              <div key={log.id} className="log-entry">
                <div className={`log-action-icon ${log.action.split('_')[0] || 'default'}`}>
                  {log.action.includes('create') ? '+' : log.action.includes('delete') ? '×' : '◈'}
                </div>
                <div>
                  <div style={{ fontSize: 13 }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{log.actor_id ?? 'System'}</strong>
                    {' '}performed <strong>{log.action}</strong>
                    {log.resource_type && ` on ${log.resource_type}`}
                  </div>
                  {log.detail && Object.keys(log.detail).length > 0 && (
                    <div className="log-meta" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 4 }}>
                      {JSON.stringify(log.detail)}
                    </div>
                  )}
                  <div className="log-meta">
                    {new Date(log.created_at).toLocaleString()}
                    {log.project_id && ` · Project: ${log.project_id.split('-')[0]}`}
                    {log.branch_id && ` · Branch: ${log.branch_id.split('-')[0]}`}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {loading && (
            <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
              <div className="loading-spinner" />
            </div>
          )}

          {!loading && hasMore && (
            <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
              <button className="btn btn-ghost" onClick={() => { setPage(p => p + 1); loadLogs(page + 1); }}>
                Load More
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
