import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '../components/shared/Sidebar';
import {
  Settings,
  Type,
  AlignLeft,
  WrapText,
  Monitor,
  RotateCcw,
  Terminal,
  Clock,
  Bot,
  KeyRound,
  Globe,
  Eye,
  EyeOff,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { usersApi } from '../api/users';
import { aiApi } from '../api/ai';
import {
  PROVIDER_PRESETS,
  loadLLMConfig,
  saveLLMConfig,
  type LLMProvider,
} from '../utils/llmProviders';

const STORAGE_KEY = 'nulltor-editor-settings';
const EXEC_STORAGE_KEY = 'nulltor-exec-settings';

interface EditorSettings {
  fontSize: number;
  tabSize: 2 | 4;
  wordWrap: boolean;
  theme: 'dark' | 'light' | 'system';
  minimap: boolean;
  lineNumbers: boolean;
}

export interface ExecSettings {
  dockerSandbox: boolean;
  timeoutSeconds: number;
}

const defaults: EditorSettings = {
  fontSize: 14,
  tabSize: 2,
  wordWrap: true,
  theme: 'system',
  minimap: true,
  lineNumbers: true,
};

const execDefaults: ExecSettings = {
  dockerSandbox: false,
  timeoutSeconds: 30,
};

export function loadEditorSettings(): EditorSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {}
  return defaults;
}

export function loadExecSettings(): ExecSettings {
  try {
    const raw = localStorage.getItem(EXEC_STORAGE_KEY);
    if (raw) return { ...execDefaults, ...JSON.parse(raw) };
  } catch {}
  return execDefaults;
}

function save(settings: EditorSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function saveExec(settings: ExecSettings) {
  localStorage.setItem(EXEC_STORAGE_KEY, JSON.stringify(settings));
}

export function SettingsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<EditorSettings>(loadEditorSettings);
  const [execSettings, setExecSettings] = useState<ExecSettings>(loadExecSettings);
  const [llmConfig, setLlmConfig] = useState(loadLLMConfig);
  const [showKey, setShowKey] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    tested: boolean;
    success?: boolean;
    message?: string;
    latency_ms?: number;
  }>({ tested: false });
  const [saved, setSaved] = useState(false);

  const { provider, apiKey, model, baseUrl } = llmConfig;

  // Load preferences from database on mount
  useEffect(() => {
    usersApi.getPreferences().then((pref) => {
      if (pref && typeof pref === 'object' && Object.keys(pref).length > 0) {
        if (pref.editor) {
          const merged = { ...defaults, ...pref.editor };
          setSettings(merged);
          save(merged);
        }
        if (pref.exec) {
          const mergedExec = { ...execDefaults, ...pref.exec };
          setExecSettings(mergedExec);
          saveExec(mergedExec);
        }
        if (pref.ai && pref.ai.provider) {
          const updated = saveLLMConfig({
            provider: pref.ai.provider,
            model: pref.ai.model || llmConfig.model,
            baseUrl: pref.ai.baseUrl || llmConfig.baseUrl,
          });
          setLlmConfig(updated);
        }
      }
    }).catch(() => {});
  }, []);

  function syncRemotePreferences(nextEditor: EditorSettings, nextExec: ExecSettings, nextLLM = llmConfig) {
    usersApi.updatePreferences({
      editor: nextEditor,
      exec: nextExec,
      ai: {
        provider: nextLLM.provider,
        model: nextLLM.model,
        baseUrl: nextLLM.baseUrl,
      },
    }).catch(() => {});
  }

  function update<K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      save(next);
      syncRemotePreferences(next, execSettings, llmConfig);
      return next;
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function updateExec<K extends keyof ExecSettings>(key: K, value: ExecSettings[K]) {
    setExecSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveExec(next);
      syncRemotePreferences(settings, next, llmConfig);
      return next;
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function updateLLM(patch: Partial<typeof llmConfig>) {
    const next = saveLLMConfig(patch);
    setLlmConfig(next);
    setConnectionStatus({ tested: false });
    syncRemotePreferences(settings, execSettings, next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function handleProviderChange(newProvider: LLMProvider) {
    const preset = PROVIDER_PRESETS[newProvider];
    updateLLM({
      provider: newProvider,
      baseUrl: preset.defaultBaseUrl,
      model: preset.defaultModel,
    });
  }

  async function handleTestConnection() {
    setTestingConnection(true);
    setConnectionStatus({ tested: false });
    try {
      const res = await aiApi.testConnection({
        provider,
        api_key: apiKey || undefined,
        base_url: baseUrl || undefined,
        model: model || undefined,
      });
      setConnectionStatus({
        tested: true,
        success: res.success,
        message: res.message,
        latency_ms: res.latency_ms,
      });
    } catch (err: any) {
      setConnectionStatus({
        tested: true,
        success: false,
        message: err.message || 'Connection test failed',
      });
    } finally {
      setTestingConnection(false);
    }
  }

  function resetAll() {
    save(defaults);
    saveExec(execDefaults);
    setSettings(defaults);
    setExecSettings(execDefaults);
    const defaultLLM = saveLLMConfig({
      provider: 'groq',
      apiKey: '',
      model: PROVIDER_PRESETS['groq'].defaultModel,
      baseUrl: PROVIDER_PRESETS['groq'].defaultBaseUrl,
    });
    setLlmConfig(defaultLLM);
    syncRemotePreferences(defaults, execDefaults, defaultLLM);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <div className="page-container">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Settings size={22} style={{ color: '#818cf8' }} />
            </div>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Editor Settings</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Preferences are saved locally in your browser.</p>
            </div>
            {saved && (
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--aurora-mint)', fontWeight: 700, background: 'rgba(1,239,172,0.1)', padding: '4px 12px', borderRadius: 99, border: '1px solid rgba(1,239,172,0.3)' }}>
                ✓ Saved
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 20 }}>

            {/* Font Size */}
            <SettingCard icon={<Type size={18} />} title="Font Size" description="Controls the editor text size in pixels.">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <input
                  type="range" min={11} max={22} value={settings.fontSize}
                  onChange={(e) => update('fontSize', parseInt(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--aurora-mint)' }}
                />
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--aurora-mint)', minWidth: 30, textAlign: 'right' }}>
                  {settings.fontSize}px
                </span>
              </div>
            </SettingCard>

            {/* Tab Size */}
            <SettingCard icon={<AlignLeft size={18} />} title="Tab Size" description="Number of spaces per indentation level.">
              <div style={{ display: 'flex', gap: 10 }}>
                {([2, 4] as const).map((n) => (
                  <button
                    key={n}
                    onClick={() => update('tabSize', n)}
                    style={{
                      flex: 1, padding: '10px', borderRadius: 8, border: `1px solid ${settings.tabSize === n ? 'var(--aurora-mint)' : 'var(--border)'}`,
                      background: settings.tabSize === n ? 'rgba(1,239,172,0.1)' : 'var(--bg-2)',
                      color: settings.tabSize === n ? 'var(--aurora-mint)' : 'var(--text-secondary)',
                      fontWeight: 700, cursor: 'pointer', fontSize: 14,
                    }}
                  >
                    {n} Spaces
                  </button>
                ))}
              </div>
            </SettingCard>

            {/* Word Wrap */}
            <SettingCard icon={<WrapText size={18} />} title="Word Wrap" description="Wrap long lines to fit the editor viewport.">
              <ToggleSwitch value={settings.wordWrap} onChange={(v) => update('wordWrap', v)} label={settings.wordWrap ? 'On' : 'Off'} />
            </SettingCard>

            {/* Minimap */}
            <SettingCard icon={<Monitor size={18} />} title="Minimap" description="Show the code minimap in the right gutter.">
              <ToggleSwitch value={settings.minimap} onChange={(v) => update('minimap', v)} label={settings.minimap ? 'Visible' : 'Hidden'} />
            </SettingCard>

            {/* Line Numbers */}
            <SettingCard icon={<AlignLeft size={18} />} title="Line Numbers" description="Show line numbers in the editor gutter.">
              <ToggleSwitch value={settings.lineNumbers} onChange={(v) => update('lineNumbers', v)} label={settings.lineNumbers ? 'Visible' : 'Hidden'} />
            </SettingCard>

            {/* Preview */}
            <SettingCard icon={<Type size={18} />} title="Preview" description="How your code will look with these settings.">
              <div style={{
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: settings.fontSize * 0.85,
                background: '#0d1117', padding: 12, borderRadius: 8,
                color: '#e6edf3', border: '1px solid #30363d',
                whiteSpace: settings.wordWrap ? 'pre-wrap' : 'pre',
                overflow: 'hidden', lineHeight: 1.6,
              }}>
                <span style={{ color: '#ff7b72' }}>function </span>
                <span style={{ color: '#d2a8ff' }}>greet</span>
                <span>(</span>
                <span style={{ color: '#ffa657' }}>name</span>
                <span>) {'{'}</span>{'\n'}
                {'  '.repeat(settings.tabSize / 2)}
                <span style={{ color: '#ff7b72' }}>return </span>
                <span style={{ color: '#a5d6ff' }}>{`\`Hello, ${'${'}name{'}'}`}</span>
                <span>;</span>{'\n'}
                {'}'}
              </div>
            </SettingCard>

          </div>

          {/* AI Agent & BYOK LLM Configuration Section */}
          <div style={{ marginTop: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Bot size={18} style={{ color: '#3b82f6' }} />
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  AI Agent & LLM Configuration (BYOK)
                </h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                  Bring Your Own Key: Configure your personal LLM API provider or leave empty to use system defaults.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 20 }}>
              {/* Provider Selection */}
              <SettingCard
                icon={<Bot size={18} />}
                title="LLM Provider"
                description="Select which LLM provider powers the autonomous coding agent."
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <select
                    value={provider}
                    onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-2)',
                      color: 'var(--text-primary)',
                      fontSize: 13,
                      fontWeight: 600,
                      outline: 'none',
                    }}
                  >
                    {Object.values(PROVIDER_PRESETS).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                    💡 {PROVIDER_PRESETS[provider]?.helpText}
                  </div>
                </div>
              </SettingCard>

              {/* API Key */}
              <SettingCard
                icon={<KeyRound size={18} />}
                title={PROVIDER_PRESETS[provider]?.requiresKey ? 'Personal API Key' : 'API Key (Optional)'}
                description="Your key is stored client-side in browser storage. Never logged or saved on the server."
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => updateLLM({ apiKey: e.target.value })}
                      placeholder={PROVIDER_PRESETS[provider]?.keyPlaceholder || 'Enter your personal API key'}
                      style={{
                        width: '100%',
                        padding: '10px 38px 10px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--bg-2)',
                        color: 'var(--text-primary)',
                        fontSize: 13,
                        outline: 'none',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      style={{
                        position: 'absolute',
                        right: 10,
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: 2,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      title={showKey ? 'Hide key' : 'Show key'}
                    >
                      {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: apiKey ? 'var(--aurora-mint)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {apiKey ? '🔒 Custom API key configured' : '⚙️ No key entered (agent uses system default key)'}
                  </div>
                </div>
              </SettingCard>

              {/* Model Selection */}
              <SettingCard
                icon={<Sparkles size={18} />}
                title="Model Name & Preset"
                description="Choose a tested preset or provide a custom model identifier."
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      value={PROVIDER_PRESETS[provider]?.models.includes(model) ? model : 'custom'}
                      onChange={(e) => {
                        if (e.target.value !== 'custom') {
                          updateLLM({ model: e.target.value });
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--bg-2)',
                        color: 'var(--text-primary)',
                        fontSize: 12.5,
                        outline: 'none',
                      }}
                    >
                      {PROVIDER_PRESETS[provider]?.models.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      <option value="custom">Custom Model ID…</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => updateLLM({ model: e.target.value })}
                    placeholder="e.g. gpt-4o, claude-3-5-sonnet-20241022"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-2)',
                      color: 'var(--text-primary)',
                      fontSize: 12.5,
                      outline: 'none',
                    }}
                  />
                </div>
              </SettingCard>

              {/* Base URL & Live Connection Probe */}
              <SettingCard
                icon={<Globe size={18} />}
                title="API Base URL & Connection Test"
                description="Verify live connectivity, response latency, and model availability."
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => updateLLM({ baseUrl: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-2)',
                      color: 'var(--text-primary)',
                      fontSize: 12.5,
                      outline: 'none',
                    }}
                  />

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={testingConnection}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        background: 'rgba(59, 130, 246, 0.15)',
                        color: '#60a5fa',
                        border: '1px solid rgba(59, 130, 246, 0.35)',
                        cursor: testingConnection ? 'not-allowed' : 'pointer',
                        fontSize: 12,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Activity size={14} />
                      {testingConnection ? 'Testing Connection...' : 'Test Connection'}
                    </button>

                    {connectionStatus.tested && (
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          color: connectionStatus.success ? 'var(--aurora-mint)' : '#ef4444',
                        }}
                      >
                        {connectionStatus.success ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                        <span>{connectionStatus.message}</span>
                      </div>
                    )}
                  </div>
                </div>
              </SettingCard>
            </div>
          </div>

          {/* Code Execution Section */}
          <div style={{ marginTop: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Terminal size={18} style={{ color: 'var(--aurora-blue)' }} />
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Code Execution</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 20 }}>

              <SettingCard icon={<Terminal size={18} />} title="Docker Sandbox" description="Run code inside an isolated Docker container instead of the host machine. Requires Docker to be installed and running.">
                <ToggleSwitch
                  value={execSettings.dockerSandbox}
                  onChange={(v) => updateExec('dockerSandbox', v)}
                  label={execSettings.dockerSandbox ? 'Enabled (Isolated)' : 'Disabled (Host)'}
                />
                {execSettings.dockerSandbox && (
                  <div style={{ fontSize: 11, color: 'var(--aurora-mint)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--aurora-mint)', display: 'inline-block' }} />
                    Code will execute in a sandboxed container
                  </div>
                )}
              </SettingCard>

              <SettingCard icon={<Clock size={18} />} title="Execution Timeout" description="Maximum seconds a code run can execute before being terminated.">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <input
                    type="range" min={5} max={120} step={5} value={execSettings.timeoutSeconds}
                    onChange={(e) => updateExec('timeoutSeconds', parseInt(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--aurora-mint)' }}
                  />
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--aurora-mint)', minWidth: 40, textAlign: 'right' }}>
                    {execSettings.timeoutSeconds}s
                  </span>
                </div>
              </SettingCard>

            </div>
          </div>

          <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', gap: 12 }}>
            <button className="btn btn-ghost" onClick={() => navigate(-1)}>← Back</button>
            <button className="btn" style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)' }} onClick={resetAll}>
              <RotateCcw size={14} /> Reset to Defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingCard({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="glass-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: 'var(--aurora-blue)', opacity: 0.9 }}>{icon}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{description}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function ToggleSwitch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24, borderRadius: 12, cursor: 'pointer', position: 'relative',
          background: value ? 'var(--aurora-mint)' : 'var(--bg-3)',
          border: `1px solid ${value ? 'var(--aurora-mint)' : 'var(--border)'}`,
          transition: 'background 0.2s',
        }}
      >
        <div style={{
          position: 'absolute', top: 2, left: value ? 22 : 2, width: 18, height: 18,
          borderRadius: '50%', background: value ? '#0b0e15' : 'var(--text-muted)',
          transition: 'left 0.2s',
        }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: value ? 'var(--aurora-mint)' : 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}
