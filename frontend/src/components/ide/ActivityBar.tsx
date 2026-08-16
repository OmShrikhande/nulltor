import { Files, Search, GitBranch, Bot, Blocks, Settings, User } from 'lucide-react';

export type ActivityTab = 'explorer' | 'search' | 'git' | 'agent' | 'extensions' | 'settings';

interface ActivityBarProps {
  activeTab: ActivityTab;
  onChangeTab: (tab: ActivityTab) => void;
  onProfileClick: () => void;
  onSettingsClick?: () => void;
}

export function ActivityBar({ activeTab, onChangeTab, onProfileClick, onSettingsClick }: ActivityBarProps) {
  return (
    <div className="ide-activity-bar">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
        <div className={`activity-bar-icon ${activeTab === 'explorer' ? 'active' : ''}`} onClick={() => onChangeTab('explorer')} title="Explorer">
          <Files size={24} strokeWidth={1.5} />
        </div>
        <div className={`activity-bar-icon ${activeTab === 'search' ? 'active' : ''}`} onClick={() => onChangeTab('search')} title="Search">
          <Search size={24} strokeWidth={1.5} />
        </div>
        <div className={`activity-bar-icon ${activeTab === 'git' ? 'active' : ''}`} onClick={() => onChangeTab('git')} title="Source Control & Commits">
          <GitBranch size={24} strokeWidth={1.5} />
        </div>
        <div 
          className={`activity-bar-icon ${activeTab === 'agent' ? 'active' : ''}`} 
          onClick={() => onChangeTab('agent')} 
          title="AI Agent Assistant"
        >
          <Bot size={24} strokeWidth={1.5} />
        </div>
        <div className={`activity-bar-icon ${activeTab === 'extensions' ? 'active' : ''}`} onClick={() => onChangeTab('extensions')} title="Extensions">
          <Blocks size={24} strokeWidth={1.5} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', marginTop: 'auto', marginBottom: '12px' }}>
        <div className="activity-bar-icon" onClick={onSettingsClick} title="Settings">
          <Settings size={24} strokeWidth={1.5} />
        </div>
        <div className="activity-bar-icon" onClick={onProfileClick} title="Profile">
          <User size={24} strokeWidth={1.5} />
        </div>
      </div>
    </div>
  );
}
