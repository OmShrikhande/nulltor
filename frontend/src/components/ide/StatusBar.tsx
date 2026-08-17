import { useEditorStore } from '../../store/editorStore';

interface StatusBarProps {
  isConnected: boolean;
  peerCount: number;
  branchName?: string;
}

export function StatusBar({ isConnected, peerCount, branchName }: StatusBarProps) {
  const { openFile, language } = useEditorStore();

  return (
<<<<<<< Updated upstream
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
=======
    <div className="nexus-statusbar" style={{ background: 'var(--accent-primary)', color: 'white' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <svg viewBox="0 0 16 16" fill="currentColor" width={14} height={14}>
            <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Z"/>
          </svg>
          <span style={{ fontWeight: 500 }}>{branchName || 'main*'}</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }} title={isConnected ? `E2EE Active · ${peerCount} Peer(s)` : 'Sync Reconnecting…'}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: isConnected ? '#eab308' : '#ef4444', boxShadow: isConnected ? '0 0 6px #eab308' : 'none', display: 'inline-block' }} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width={14} height={14}>
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width={14} height={14}>
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            0
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width={14} height={14}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            2
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ cursor: 'pointer' }}>
          UTF-8
        </div>
>>>>>>> Stashed changes

        <div className="nexus-statusbar-item font-mono" style={{ color: 'var(--palette-rose)', fontWeight: 600 }}>
          {language ? language.toUpperCase() : 'PLAIN TEXT'} · UTF-8
        </div>
      </div>
    </div>
  );
}
