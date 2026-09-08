import React from 'react';
import { useEditorStore } from '../../store/editorStore';
import { GitBranch, ShieldCheck, AlertCircle, AlertTriangle, Check, RefreshCw } from 'lucide-react';

interface StatusBarProps {
  isConnected: boolean;
  peerCount: number;
  branchName?: string;
  onReconnect?: () => void;
  onOpenProblems?: () => void;
}

export function StatusBar({
  isConnected,
  peerCount,
  branchName,
  onReconnect,
  onOpenProblems,
}: StatusBarProps) {
  const { language, cursorPosition, diagnosticCounts } = useEditorStore();

  const formatLanguageName = (lang: string) => {
    if (!lang || lang === 'plaintext') return 'Plain Text';
    if (lang === 'typescript') return 'TypeScript';
    if (lang === 'javascript') return 'JavaScript';
    if (lang === 'cpp') return 'C++';
    if (lang === 'c') return 'C';
    if (lang === 'python') return 'Python';
    if (lang === 'html') return 'HTML';
    if (lang === 'css') return 'CSS';
    if (lang === 'json') return 'JSON';
    if (lang === 'markdown') return 'Markdown';
    return lang.charAt(0).toUpperCase() + lang.slice(1);
  };

  const totalErrors = diagnosticCounts?.errors ?? 0;
  const totalWarnings = diagnosticCounts?.warnings ?? 0;

  return (
    <footer
      className="nexus-statusbar"
      style={{
        height: '24px',
        background: 'var(--bg-1)',
        borderTop: '1px solid var(--border)',
        color: 'var(--text-secondary)',
        fontSize: '11.5px',
        padding: '0 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        userSelect: 'none',
        zIndex: 20,
        boxSizing: 'border-box',
      }}
    >
      {/* Left: Branch, Diagnostics & Live Peer/Sync Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* Branch */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            padding: '2px 4px',
            borderRadius: '4px',
          }}
          title={`Active Branch: ${branchName || 'main'}`}
        >
          <GitBranch size={13} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontWeight: 600 }}>{branchName || 'main'}</span>
        </div>

        {/* Real-time Connection State */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '2px 6px',
            borderRadius: '4px',
            background: isConnected ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.1)',
            color: isConnected ? '#10b981' : '#f59e0b',
            fontSize: '11px',
            fontWeight: 500,
          }}
          title={
            isConnected
              ? `Zero-Knowledge E2EE Active · ${peerCount} collaborator(s) online`
              : 'Connection interrupted. Attempting automatic reconnection…'
          }
        >
          <span
            style={{
              width: '6.5px',
              height: '6.5px',
              borderRadius: '50%',
              background: isConnected ? '#10b981' : '#f59e0b',
              boxShadow: isConnected ? '0 0 6px rgba(16, 185, 129, 0.6)' : '0 0 6px rgba(245, 158, 11, 0.6)',
              animation: isConnected ? 'none' : 'pulse 1.5s infinite',
            }}
          />
          <span>{isConnected ? 'Connected' : 'Reconnecting...'}</span>
          {!isConnected && onReconnect && (
            <button
              onClick={onReconnect}
              style={{
                background: 'none',
                border: 'none',
                color: '#f59e0b',
                cursor: 'pointer',
                padding: 0,
                marginLeft: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Force reconnect"
            >
              <RefreshCw size={10} />
            </button>
          )}
        </div>

        {/* E2EE Peer Badge */}
        {isConnected && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: 'var(--text-muted)',
              fontSize: '11px',
            }}
            title={`End-to-End Encrypted Session · ${peerCount > 0 ? peerCount : 1} active peer(s)`}
          >
            <ShieldCheck size={12} style={{ color: '#10b981' }} />
            <span>{peerCount > 0 ? `${peerCount} peer${peerCount > 1 ? 's' : ''}` : 'E2EE Solo'}</span>
          </div>
        )}

        {/* Problems & LSP Diagnostics Quick Indicator */}
        <div
          onClick={onOpenProblems}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: onOpenProblems ? 'pointer' : 'default',
            padding: '2px 4px',
            borderRadius: '4px',
          }}
          title={`${totalErrors} Error(s), ${totalWarnings} Warning(s)`}
        >
          {totalErrors === 0 && totalWarnings === 0 ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '11px' }}>
              <Check size={12} style={{ color: '#10b981' }} />
              <span>0 Problems</span>
            </span>
          ) : (
            <>
              {totalErrors > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#ef4444', fontSize: '11px', fontWeight: 600 }}>
                  <AlertCircle size={12} />
                  <span>{totalErrors}</span>
                </span>
              )}
              {totalWarnings > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#f59e0b', fontSize: '11px', fontWeight: 600 }}>
                  <AlertTriangle size={12} />
                  <span>{totalWarnings}</span>
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right: Telemetry, Indent, Encoding, Language & Prettier */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', color: 'var(--text-muted)', fontSize: '11px' }}>
        {/* Line & Column Position */}
        <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>
          Ln {cursorPosition?.line ?? 1}, Col {cursorPosition?.column ?? 1}
        </span>

        {/* Indentation */}
        <span>Spaces: {language === 'python' ? '4' : '2'}</span>

        {/* Encoding */}
        <span>UTF-8</span>

        {/* Formatter Tag */}
        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--accent-primary)', fontWeight: 600 }}>
          <span>{'{ }'}</span>
          <span>Prettier</span>
        </span>

        {/* Language */}
        <span
          style={{
            color: 'var(--text-primary)',
            fontWeight: 600,
            padding: '2px 6px',
            background: 'var(--bg-2)',
            borderRadius: '4px',
            border: '1px solid var(--border)',
          }}
        >
          {formatLanguageName(language)}
        </span>
      </div>
    </footer>
  );
}
