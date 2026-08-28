import { useEditorStore } from '../../store/editorStore';

interface StatusBarProps {
  isConnected: boolean;
  peerCount: number;
  branchName?: string;
}

export function StatusBar({ isConnected, peerCount, branchName }: StatusBarProps) {
  const { language } = useEditorStore();

  return (
    <div className="nexus-statusbar" style={{
      height: '24px',
      background: '#111215',
      borderTop: '1px solid #1f2128',
      color: '#94a3b8',
      fontSize: '11.5px',
      padding: '0 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      userSelect: 'none',
    }}>
      {/* Left: Branch & Live Peer Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#cbd5e1' }}>
          <svg viewBox="0 0 16 16" fill="currentColor" width={13} height={13}>
            <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Z"/>
          </svg>
          <span style={{ fontWeight: 600 }}>{branchName || 'main'}</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981' }} title={isConnected ? `E2EE Active · ${peerCount} Peer(s)` : 'Sync Reconnecting…'}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
          <span>{peerCount > 0 ? `${peerCount}` : '1'}</span>
        </div>
      </div>

      {/* Right: File telemetry */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: '#64748b', fontSize: '11px' }}>
        <span>UTF-8</span>
        <span style={{ color: '#cbd5e1' }}>{language ? (language.charAt(0).toUpperCase() + language.slice(1)) : 'Python'}</span>
        <span>Ln 1, Col 1</span>
      </div>
    </div>
  );
}
