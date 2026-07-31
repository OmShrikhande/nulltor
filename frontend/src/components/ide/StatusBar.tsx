import { useEditorStore } from '../../store/editorStore';

interface StatusBarProps {
  isConnected: boolean;
  peerCount: number;
  branchName?: string;
}

export function StatusBar({ isConnected, peerCount, branchName }: StatusBarProps) {
  const { openFile, language } = useEditorStore();

  return (
    <div className="nexus-statusbar">
      <div className="nexus-statusbar-item">
        <span
          className="status-dot"
          style={{
            background: isConnected ? 'var(--palette-mint)' : 'var(--danger)',
            boxShadow: isConnected ? '0 0 8px var(--palette-mint)' : 'none',
          }}
        />
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          {isConnected ? `E2EE Active · ${peerCount} Peer${peerCount !== 1 ? 's' : ''}` : 'Sync Server Reconnecting…'}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {branchName && (
          <div className="nexus-statusbar-item font-mono">
            <svg viewBox="0 0 16 16" fill="currentColor" width={12} height={12} style={{ color: 'var(--palette-sky)' }}>
              <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Z"/>
            </svg>
            {branchName}
          </div>
        )}

        {openFile && (
          <div className="nexus-statusbar-item">
            <span>{openFile.name}</span>
          </div>
        )}

        <div className="nexus-statusbar-item font-mono" style={{ color: 'var(--palette-rose)', fontWeight: 600 }}>
          {language ? language.toUpperCase() : 'PLAIN TEXT'} · UTF-8
        </div>
      </div>
    </div>
  );
}
