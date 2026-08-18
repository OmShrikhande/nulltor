import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { logsApi, type AuditLogRead } from '../api/logs';
import { useAuthStore } from '../store/authStore';
import { useTheme } from '../context/ThemeContext';
import { NulltorLogo } from '../components/shared/NulltorLogo';
import { toast } from '../components/shared/Toast';
import { ChevronDown, ChevronRight, FileText, Folder, Shield, Settings, Sun, Moon } from 'lucide-react';

export function AuditLogsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { theme, toggleTheme } = useTheme();

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
        page_size: 50,
        resource_type: resourceFilter || undefined,
      });
      if (p === 1) {
        setLogs(data.items);
      } else {
        setLogs((prev) => [...prev, ...data.items]);
      }
      setHasMore(data.items.length === 50);
    } catch {
      toast('Failed to load audit logs', 'error');
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

  const getActionColorClass = (action: string) => {
    if (action.includes('delete')) return 'private';
    if (action.includes('create') || action.includes('branch')) return 'main';
    return 'subroom';
  };

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
                fontWeight: 700,
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <FileText size={14} />
              <span>Audit Telemetry</span>
            </button>

            {user?.role === 'superadmin' && (
              <button
                onClick={() => navigate('/users')}
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
                <Shield size={14} />
                <span>Governance & Team</span>
              </button>
            )}

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
          {/* Card Header with 3 Traffic Dots & Filters */}
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
                <FileText size={14} style={{ color: '#2563eb' }} />
                System Audit Telemetry Logs
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="text"
                placeholder="Filter action / user…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: '4px 10px', fontSize: '12px', width: '180px', borderRadius: '6px', background: 'var(--bg-0)', border: '1px solid var(--border)' }}
              />

              <select
                value={resourceFilter}
                onChange={(e) => setResourceFilter(e.target.value)}
                style={{ padding: '4px 28px 4px 10px', fontSize: '12px', width: '130px', borderRadius: '6px' }}
              >
                <option value="">All Resources</option>
                <option value="project">Project</option>
                <option value="branch">Branch</option>
                <option value="user">User</option>
                <option value="session">Session</option>
              </select>
            </div>
          </div>

          {/* Audit Logs Content Body - Fixed Container with Inner Scroll */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 24px' }}>
            {/* Stats Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '20px' }}>
              <div className="stat-box" style={{ background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px' }}>
                <div className="stat-value" style={{ fontSize: '20px' }}>{filteredLogs.length}</div>
                <div className="stat-label">Logged Audit Events</div>
              </div>
              <div className="stat-box" style={{ background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px' }}>
                <div className="stat-value" style={{ fontSize: '20px', color: '#38bdf8' }}>
                  {resourceFilter ? resourceFilter.toUpperCase() : 'ALL SYSTEM'}
                </div>
                <div className="stat-label">Active Resource Scope</div>
              </div>
              <div className="stat-box" style={{ background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px' }}>
                <div className="stat-value" style={{ fontSize: '20px', color: '#10b981' }}>
                  IMMUTABLE
                </div>
                <div className="stat-label">Telemetry Status</div>
              </div>
            </div>

            {/* Logs Table */}
            {loading && logs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-secondary)' }}>
                Loading audit telemetry logs…
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="glass-card" style={{ padding: '48px', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                  <FileText size={32} />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>No Audit Logs Found</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                  No events match your current filter parameters.
                </p>
              </div>
            ) : (
              <div style={{ background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                {/* Table Header */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '40px 1.8fr 1.5fr 1.2fr 1.2fr',
                    padding: '10px 16px',
                    background: 'var(--bg-2)',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '11px',
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
                      <div key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <div
                          onClick={() => toggleExpand(log.id)}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '40px 1.8fr 1.5fr 1.2fr 1.2fr',
                            padding: '12px 16px',
                            alignItems: 'center',
                            cursor: 'pointer',
                            background: isExpanded ? 'var(--bg-2)' : 'transparent',
                            transition: 'background 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            if (!isExpanded) e.currentTarget.style.background = 'var(--bg-2)';
                          }}
                          onMouseLeave={(e) => {
                            if (!isExpanded) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                            {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className={`branch-pill ${getActionColorClass(log.action)}`} style={{ padding: '2px 7px', fontSize: '10px' }}>
                              {log.action.toUpperCase()}
                            </span>
                            <span style={{ fontWeight: 600, fontSize: '12.5px', color: 'var(--text-primary)' }}>
                              {log.action}
                            </span>
                          </div>

                          <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>
                            {log.actor_id ? log.actor_id : 'System'}
                          </div>

                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {log.resource_type || 'General'}
                          </div>

                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {dateStr} · {timeStr}
                          </div>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div
                            style={{
                              padding: '14px 18px 16px 56px',
                              background: 'var(--bg-1)',
                              borderTop: '1px solid var(--border)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px',
                            }}
                          >
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                              <div style={{ padding: '8px 10px', background: 'var(--bg-0)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '2px' }}>Actor ID</div>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                                  {log.actor_id || 'System Event'}
                                </div>
                              </div>
                              <div style={{ padding: '8px 10px', background: 'var(--bg-0)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '2px' }}>Target Resource</div>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {log.resource_type || 'N/A'} {log.resource_id ? `(${log.resource_id})` : ''}
                                </div>
                              </div>
                              <div style={{ padding: '8px 10px', background: 'var(--bg-0)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '2px' }}>Client IP</div>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                                  {log.ip_address || '127.0.0.1'}
                                </div>
                              </div>
                              <div style={{ padding: '8px 10px', background: 'var(--bg-0)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '2px' }}>Timestamp (ISO)</div>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {dateObj.toISOString()}
                                </div>
                              </div>
                            </div>

                            {log.detail && Object.keys(log.detail).length > 0 && (
                              <div>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                  Event Payload & Diagnostics:
                                </div>
                                <pre
                                  className="font-mono"
                                  style={{
                                    background: 'var(--bg-0)',
                                    padding: '10px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border)',
                                    fontSize: '11px',
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
              <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0 12px 0' }}>
                <button
                  className="btn btn-secondary btn-sm"
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
      </main>
    </div>
  );
}
