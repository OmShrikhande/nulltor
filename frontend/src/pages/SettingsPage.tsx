import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useTheme } from '../context/ThemeContext';
import { NulltorLogo } from '../components/shared/NulltorLogo';
import { Settings, Type, AlignLeft, WrapText, Monitor, RotateCcw, Folder, FileText, Shield, Sun, Moon } from 'lucide-react';

const STORAGE_KEY = 'nulltor-editor-settings';

interface EditorSettings {
  fontSize: number;
  tabSize: 2 | 4;
  wordWrap: boolean;
  theme: 'dark' | 'light' | 'system';
  minimap: boolean;
  lineNumbers: boolean;
}

const defaults: EditorSettings = {
  fontSize: 14,
  tabSize: 2,
  wordWrap: true,
  theme: 'system',
  minimap: true,
  lineNumbers: true,
};

export function loadEditorSettings(): EditorSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {}
  return defaults;
}

function save(settings: EditorSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { theme, toggleTheme } = useTheme();

  const [settings, setSettings] = useState<EditorSettings>(loadEditorSettings);
  const [saved, setSaved] = useState(false);

  function update<K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      save(next);
      return next;
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function resetAll() {
    save(defaults);
    setSettings(defaults);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

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
                fontWeight: 700,
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
              }}
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
          {/* Card Header with 3 Traffic Dots & Saved State */}
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
                <Settings size={14} style={{ color: '#2563eb' }} />
                Editor & Environment Preferences
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {saved && (
                <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 700, background: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  ✓ Preferences Saved
                </span>
              )}
              <button
                className="btn btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.08)', padding: '3px 8px', fontSize: '11.5px' }}
                onClick={resetAll}
              >
                <RotateCcw size={12} /> Reset Defaults
              </button>
            </div>
          </div>

          {/* Settings Content Body - Fixed Container with Inner Scroll */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px', marginBottom: '20px' }}>
              {/* Font Size */}
              <SettingCard icon={<Type size={17} />} title="Font Size" description="Controls the editor text size in pixels.">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <input
                    type="range"
                    min={11}
                    max={22}
                    value={settings.fontSize}
                    onChange={(e) => update('fontSize', parseInt(e.target.value))}
                    style={{ flex: 1, accentColor: '#2563eb' }}
                  />
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#3b82f6', minWidth: 32, textAlign: 'right' }}>
                    {settings.fontSize}px
                  </span>
                </div>
              </SettingCard>

              {/* Tab Size */}
              <SettingCard icon={<AlignLeft size={17} />} title="Tab Size" description="Number of spaces per indentation level.">
                <div style={{ display: 'flex', gap: 10 }}>
                  {([2, 4] as const).map((n) => (
                    <button
                      key={n}
                      onClick={() => update('tabSize', n)}
                      style={{
                        flex: 1,
                        padding: '7px 12px',
                        borderRadius: '6px',
                        border: `1px solid ${settings.tabSize === n ? '#3b82f6' : 'var(--border)'}`,
                        background: settings.tabSize === n ? 'rgba(37, 99, 235, 0.15)' : 'var(--bg-0)',
                        color: settings.tabSize === n ? '#60a5fa' : 'var(--text-secondary)',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      {n} Spaces
                    </button>
                  ))}
                </div>
              </SettingCard>

              {/* Word Wrap */}
              <SettingCard icon={<WrapText size={17} />} title="Word Wrap" description="Wrap long lines to fit the editor viewport.">
                <ToggleSwitch value={settings.wordWrap} onChange={(v) => update('wordWrap', v)} label={settings.wordWrap ? 'On' : 'Off'} />
              </SettingCard>

              {/* Minimap */}
              <SettingCard icon={<Monitor size={17} />} title="Minimap" description="Show the code minimap in the right gutter.">
                <ToggleSwitch value={settings.minimap} onChange={(v) => update('minimap', v)} label={settings.minimap ? 'Visible' : 'Hidden'} />
              </SettingCard>

              {/* Line Numbers */}
              <SettingCard icon={<AlignLeft size={17} />} title="Line Numbers" description="Show line numbers in the editor gutter.">
                <ToggleSwitch value={settings.lineNumbers} onChange={(v) => update('lineNumbers', v)} label={settings.lineNumbers ? 'Visible' : 'Hidden'} />
              </SettingCard>

              {/* Live Preview */}
              <SettingCard icon={<Type size={17} />} title="Code Preview" description="How code appears with current parameters.">
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', Consolas, monospace",
                    fontSize: settings.fontSize * 0.85,
                    background: 'var(--bg-0)',
                    padding: 10,
                    borderRadius: 6,
                    color: '#e2e8f0',
                    border: '1px solid var(--border)',
                    whiteSpace: settings.wordWrap ? 'pre-wrap' : 'pre',
                    overflow: 'hidden',
                    lineHeight: 1.6,
                  }}
                >
                  <span style={{ color: '#60a5fa' }}>def </span>
                  <span style={{ color: '#a78bfa' }}>calculate_mesh</span>
                  <span>(nodes):</span>{'\n'}
                  {'  '.repeat(settings.tabSize / 2)}
                  <span style={{ color: '#60a5fa' }}>return </span>
                  <span style={{ color: '#34d399' }}>f"Nulltor active with {'{'}len(nodes){'}'} peers"</span>{'\n'}
                </div>
              </SettingCard>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function SettingCard({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--bg-0)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ color: '#3b82f6' }}>{icon}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>{title}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 1 }}>{description}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function ToggleSwitch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: 38,
          height: 20,
          borderRadius: 10,
          cursor: 'pointer',
          position: 'relative',
          background: value ? '#2563eb' : 'var(--bg-3)',
          border: `1px solid ${value ? '#3b82f6' : 'var(--border)'}`,
          transition: 'background 0.2s',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: value ? 20 : 2,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: value ? '#ffffff' : 'var(--text-muted)',
            transition: 'left 0.2s',
          }}
        />
      </div>
      <span style={{ fontSize: '12px', fontWeight: 600, color: value ? '#60a5fa' : 'var(--text-muted)' }}>
        {label}
      </span>
    </div>
  );
}
