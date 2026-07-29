import { useEditorStore } from '../../store/editorStore';

interface StatusBarProps {
  isConnected: boolean;
  peerCount: number;
  branchName?: string;
}

export function StatusBar({ isConnected, peerCount, branchName }: StatusBarProps) {
  const { openFile, language } = useEditorStore();

  return (
    <div className="status-bar">
      <div className="status-item">
        <span className={`status-dot${isConnected ? ' connected' : ''}`} />
        {isConnected ? `Connected · ${peerCount} peer${peerCount !== 1 ? 's' : ''}` : 'Disconnected'}
      </div>
      {branchName && (
        <div className="status-item">
          <svg viewBox="0 0 16 16" fill="currentColor" width={12} height={12}>
            <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Z"/>
          </svg>
          {branchName}
        </div>
      )}
      {openFile && (
        <div className="status-item">
          {openFile.name}
        </div>
      )}
      {openFile && (
        <div className="status-item" style={{ marginLeft: 'auto' }}>
          {language}
        </div>
      )}
    </div>
  );
}
