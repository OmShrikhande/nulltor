import React, { useState, useRef, useEffect } from 'react';
import { marked } from 'marked';
import { useEditorStore } from '../../store/editorStore';
import { useProjectStore } from '../../store/projectStore';
import { aiApi, type ChatMessage, type ToolExecutionResult } from '../../api/ai';
import { toast } from '../shared/Toast';
import {
  Bot,
  User,
  Send,
  CheckCircle2,
  RotateCcw,
  Settings2,
  Copy,
  Check,
  X,
  RefreshCw,
  Sparkles,
  Bug,
  FileCode,
  Zap,
  ShieldCheck,
  CheckCheck,
  Cpu,
  Search,
  Terminal,
  FileEdit,
  KeyRound,
  Globe,
  Sliders,
  Eye,
  EyeOff,
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  type LLMProvider,
  PROVIDER_PRESETS,
  loadLLMConfig,
  saveLLMConfig,
} from '../../utils/llmProviders';

// Configure marked with GFM table support & line breaks
marked.setOptions({
  gfm: true,
  breaks: true,
});

interface AgentPanelProps {
  onApplyCode?: (fileName: string, code: string) => Promise<void> | void;
  onRefreshTree?: () => void;
  currentCode?: string;
  getCurrentCode?: () => string;
  onSaveSnapshot?: () => void;
  projectId?: string;
  branchId?: string;
  onClose?: () => void;
}

function getLanguageColor(lang: string): string {
  const l = (lang || '').toLowerCase();
  if (l === 'c') return '#659ad2';
  if (l === 'cpp' || l === 'c++') return '#00599c';
  if (l === 'py' || l === 'python') return '#10b981';
  if (l === 'js' || l === 'javascript') return '#f59e0b';
  if (l === 'ts' || l === 'typescript') return '#3b82f6';
  if (l === 'rs' || l === 'rust') return '#dea584';
  if (l === 'go') return '#00add8';
  if (l === 'html') return '#e34f26';
  if (l === 'css') return '#2965f1';
  return '#94a3b8';
}

function ChatCodeBlock({
  code,
  language,
  fileName,
  onApply,
}: {
  code: string;
  language: string;
  fileName?: string;
  onApply?: (fileName: string, code: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const langColor = getLanguageColor(language);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast('Code copied to clipboard', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApply = () => {
    if (onApply) {
      const target = fileName || 'active file';
      onApply(target, code);
    }
  };

  return (
    <div className="agent-code-block">
      <div className="agent-code-header">
        <div className="agent-code-lang">
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: langColor, display: 'inline-block' }} />
          <span>{language || 'code'}</span>
          {fileName && (
            <span style={{ color: 'var(--text-muted)', fontSize: '10.5px', textTransform: 'none', marginLeft: '4px' }}>
              ({fileName})
            </span>
          )}
        </div>
        <div className="agent-code-actions">
          <button
            type="button"
            onClick={handleCopy}
            className="agent-code-btn-copy"
            title="Copy snippet to clipboard"
          >
            {copied ? <CheckCheck size={13} style={{ color: '#10b981' }} /> : <Copy size={13} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          {onApply && (
            <button
              type="button"
              onClick={handleApply}
              className="agent-code-btn-apply"
              title="Apply this snippet directly into active file"
            >
              <CheckCircle2 size={13} />
              <span>Apply to Editor</span>
            </button>
          )}
        </div>
      </div>
      <pre className="agent-code-body">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  executedTools?: ToolExecutionResult[];
  isError?: boolean;
  timestamp?: string;
}

export function formatModelName(rawModel: string): string {
  if (!rawModel) return 'Default Model';
  const m = rawModel.toLowerCase();
  if (m.includes('llama-3.3-70b')) return 'Llama 3.3 70B';
  if (m.includes('llama-3.1-8b')) return 'Llama 3.1 8B';
  if (m.includes('deepseek-r1-distill-llama-70b')) return 'DeepSeek R1 (70B)';
  if (m.includes('deepseek-r1')) return 'DeepSeek R1';
  if (m.includes('deepseek-chat')) return 'DeepSeek Chat';
  if (m.includes('qwen-2.5-coder') || m.includes('qwen2.5-coder')) return 'Qwen 2.5 Coder';
  if (m.includes('claude-3-7-sonnet')) return 'Claude 3.7 Sonnet';
  if (m.includes('claude-3-5-sonnet')) return 'Claude 3.5 Sonnet';
  if (m.includes('claude-3-5-haiku')) return 'Claude 3.5 Haiku';
  if (m.includes('gpt-4o-mini')) return 'GPT-4o Mini';
  if (m.includes('gpt-4o')) return 'GPT-4o';
  if (m.includes('o3-mini')) return 'o3-mini';
  if (m.includes('gemini-2.0-flash')) return 'Gemini 2.0 Flash';
  if (m.includes('gemini-1.5-pro')) return 'Gemini 1.5 Pro';
  if (m.includes('codestral')) return 'Codestral';
  const clean = rawModel.split('/').pop() || rawModel;
  return clean.length > 20 ? clean.slice(0, 20) + '…' : clean;
}

function ToolBadge({ tool }: { tool: ToolExecutionResult }) {
  let icon = <Cpu size={12} />;
  let label = tool.tool;
  let bg = 'rgba(59, 130, 246, 0.1)';
  let color = '#3b82f6';
  let border = 'rgba(59, 130, 246, 0.25)';

  if (tool.tool === 'search_codebase') {
    icon = <Search size={12} />;
    label = `Search: "${tool.args?.query || ''}"`;
    bg = 'rgba(168, 85, 247, 0.1)';
    color = '#c084fc';
    border = 'rgba(168, 85, 247, 0.25)';
  } else if (tool.tool === 'run_sandbox_code') {
    icon = <Terminal size={12} />;
    label = `Sandbox: ${tool.args?.file_name || 'test run'}`;
    bg = 'rgba(16, 185, 129, 0.1)';
    color = '#10b981';
    border = 'rgba(16, 185, 129, 0.25)';
  } else if (tool.tool === 'apply_code_patch') {
    icon = <FileEdit size={12} />;
    label = `Patched: ${tool.args?.file_name || 'file'}`;
    bg = 'rgba(245, 158, 11, 0.1)';
    color = '#f59e0b';
    border = 'rgba(245, 158, 11, 0.25)';
  } else if (tool.tool === 'create_file' || tool.tool === 'write_code_to_file') {
    icon = <FileCode size={12} />;
    label = `${tool.tool === 'create_file' ? 'Created' : 'Updated'}: ${tool.args?.file_name || 'file'}`;
    bg = 'rgba(6, 182, 212, 0.1)';
    color = '#06b6d4';
    border = 'rgba(6, 182, 212, 0.25)';
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 8px',
        borderRadius: '6px',
        background: bg,
        color: color,
        border: `1px solid ${border}`,
        fontSize: '11px',
        fontWeight: 600,
        margin: '2px 0',
      }}
      title={tool.result}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}

function ToolExecutionTrace({ tools }: { tools: ToolExecutionResult[] }) {
  const [expanded, setExpanded] = useState(true);

  if (!tools || tools.length === 0) return null;

  return (
    <div className="agent-action-trace">
      <div
        className="agent-action-trace-header"
        onClick={() => setExpanded(!expanded)}
        title="Toggle automated action details"
      >
        <div className="agent-action-trace-title">
          <Zap size={13} style={{ color: '#f59e0b' }} />
          <span>Completed {tools.length} automated action{tools.length > 1 ? 's' : ''}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </div>
      </div>

      {expanded && (
        <div className="agent-action-trace-list">
          {tools.map((t, idx) => (
            <div key={idx} className="agent-action-trace-item">
              <ToolBadge tool={t} />
              {t.result && (
                <span className="agent-action-trace-result" title={t.result}>
                  {t.result}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FormattedChatMessage({
  message,
  openFileName,
  onApplyCode,
  onRetry,
}: {
  message: DisplayMessage;
  openFileName?: string;
  onApplyCode?: (fileName: string, code: string) => Promise<void> | void;
  onRetry?: () => void;
}) {
  const { content, role, isError, executedTools } = message;

  if (role === 'user') {
    return <div className="agent-msg-bubble-user">{content}</div>;
  }

  if (isError) {
    return (
      <div className="agent-msg-card-error">
        <div className="agent-msg-error-header">
          <AlertTriangle size={15} style={{ color: '#ef4444' }} />
          <span>Agent Execution Notice</span>
        </div>
        <div className="agent-msg-error-body">{content}</div>
        {onRetry && (
          <button type="button" onClick={onRetry} className="agent-msg-retry-btn">
            <RefreshCw size={12} />
            <span>Retry instruction</span>
          </button>
        )}
      </div>
    );
  }

  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="agent-msg-card-assistant">
      {executedTools && executedTools.length > 0 && (
        <ToolExecutionTrace tools={executedTools} />
      )}

      {parts.map((part, index) => {
        if (!part.trim()) return null;

        if (part.startsWith('```') && part.endsWith('```')) {
          let inner = part.trim();
          if (inner.startsWith('```')) inner = inner.slice(3);
          if (inner.endsWith('```')) inner = inner.slice(0, -3);

          let language = '';
          let code = inner;
          const firstNewline = inner.indexOf('\n');
          if (firstNewline !== -1) {
            language = inner.substring(0, firstNewline).trim();
            code = inner.substring(firstNewline + 1);
          }

          return (
            <ChatCodeBlock
              key={index}
              language={language}
              code={code.trimEnd()}
              fileName={openFileName}
              onApply={onApplyCode ? (fn, c) => onApplyCode(fn, c) : undefined}
            />
          );
        } else {
          const parsedHtml = marked.parse(part) as string;
          return (
            <div
              key={index}
              className="agent-markdown-content"
              dangerouslySetInnerHTML={{ __html: parsedHtml }}
            />
          );
        }
      })}
    </div>
  );
}

export function AgentPanel({
  onApplyCode,
  onRefreshTree,
  currentCode = '',
  getCurrentCode,
  onSaveSnapshot,
  projectId,
  branchId,
  onClose,
}: AgentPanelProps) {
  const openFile = useEditorStore((s) => s.openFile);
  const diagnosticCounts = useEditorStore((s) => s.diagnosticCounts);
  const { currentProject, currentBranch } = useProjectStore();

  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([
    {
      id: 'intro',
      role: 'assistant',
      content:
        'I am the Nulltor autonomous software agent. Ask me to create files, search your codebase, refactor, run tests, or debug errors.',
    },
  ]);
  const rawHistoryRef = useRef<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  // BYOK LLM Provider State
  const [llmConfig, setLlmConfig] = useState(loadLLMConfig);
  const [showKey, setShowKey] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    tested: boolean;
    success?: boolean;
    message?: string;
    latency_ms?: number;
  }>({ tested: false });

  const { provider, apiKey, model, baseUrl } = llmConfig;

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [displayMessages, loading]);

  const handleProviderChange = (newProvider: LLMProvider) => {
    const preset = PROVIDER_PRESETS[newProvider];
    const updated = saveLLMConfig({
      provider: newProvider,
      baseUrl: preset.defaultBaseUrl,
      model: preset.defaultModel,
    });
    setLlmConfig(updated);
    setConnectionStatus({ tested: false });
  };

  const handleUpdateConfig = (patch: Partial<typeof llmConfig>) => {
    const updated = saveLLMConfig(patch);
    setLlmConfig(updated);
    setConnectionStatus({ tested: false });
  };

  const handleTestConnection = async () => {
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
      if (res.success) {
        toast(`Connected (${res.latency_ms}ms) · ${res.model || model}`, 'success');
      } else {
        toast(res.message || 'Connection test failed', 'error');
      }
    } catch (err: any) {
      setConnectionStatus({
        tested: true,
        success: false,
        message: err.message || 'Connection test failed',
      });
      toast(err.message || 'Connection test failed', 'error');
    } finally {
      setTestingConnection(false);
    }
  };

  async function handleSend(customText?: string) {
    const textToSend = (customText || input).trim();
    if (!textToSend || loading) return;

    const userMsg: DisplayMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setDisplayMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const liveCode = getCurrentCode ? getCurrentCode() : currentCode;

    if (onSaveSnapshot) {
      try {
        onSaveSnapshot();
      } catch (err) {
        console.error('Snapshot save error:', err);
      }
    }

    const previousHistory = rawHistoryRef.current.length > 0
      ? rawHistoryRef.current
      : displayMessages
          .filter((m) => !m.isError && m.content.trim())
          .map((m) => ({ role: m.role, content: m.content } as ChatMessage));

    const payloadMessages: ChatMessage[] = [
      ...previousHistory,
      { role: 'user', content: textToSend },
    ];

    try {
      const res = await aiApi.chat({
        messages: payloadMessages,
        project_id: projectId || currentProject?.id,
        branch_id: branchId || currentBranch?.id,
        active_file_name: openFile?.name,
        active_file_content: liveCode,
        diagnostics: diagnosticCounts ? { errors: diagnosticCounts.errors, warnings: diagnosticCounts.warnings } : undefined,
        api_key: apiKey || undefined,
        model: model || undefined,
        base_url: baseUrl || undefined,
        provider: provider || undefined,
      });

      if (res.updated_messages && res.updated_messages.length > 0) {
        rawHistoryRef.current = res.updated_messages;
      }

      const replyContent = (res.reply || '').trim() || (res.executed_tools?.length ? 'Task completed successfully.' : 'Done.');

      const agentMsg: DisplayMessage = {
        id: `agent_${Date.now()}`,
        role: 'assistant',
        content: replyContent,
        executedTools: res.executed_tools && res.executed_tools.length > 0 ? res.executed_tools : undefined,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setDisplayMessages((prev) => [...prev, agentMsg]);

      if (res.executed_tools && res.executed_tools.length > 0) {
        if (onRefreshTree) onRefreshTree();
      }

      if (res.code_modifications && Object.keys(res.code_modifications).length > 0) {
        for (const [fileName, code] of Object.entries(res.code_modifications)) {
          if (onApplyCode) {
            await onApplyCode(fileName, code);
          }
        }
      }
    } catch (e: any) {
      const errMsg: DisplayMessage = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: e.message || 'Failed to communicate with agent service.',
        isError: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setDisplayMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  }

  function handleClearChat() {
    rawHistoryRef.current = [];
    setDisplayMessages([
      {
        id: 'intro_cleared',
        role: 'assistant',
        content: 'Conversation history cleared. Ready for your next instruction.',
      },
    ]);
  }

  return (
    <div className="agent-container">
      {/* Header */}
      <div className="agent-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Bot size={16} style={{ color: '#3b82f6' }} />
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              Agent
            </span>
          </div>

          <div
            className="agent-model-chip"
            onClick={() => setShowConfig(!showConfig)}
            title={`Provider: ${PROVIDER_PRESETS[provider]?.name || provider} · Model: ${model} (Click to configure)`}
          >
            <span className="agent-model-provider">{PROVIDER_PRESETS[provider]?.badge || provider.toUpperCase()}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span className="agent-model-name">{formatModelName(model)}</span>
          </div>

          {openFile && (
            <span
              className="agent-header-badge"
              title={`Active open file: ${openFile.name}`}
              style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              <FileCode size={11} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {openFile.name}
              </span>
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="btn-icon"
            style={{ width: '26px', height: '26px', color: showConfig ? '#3b82f6' : 'var(--text-secondary)' }}
            title="Configure Custom LLM Provider, Model & API Key"
          >
            <Settings2 size={14} />
          </button>
          <button
            onClick={handleClearChat}
            className="btn-icon"
            style={{ width: '26px', height: '26px', color: 'var(--text-secondary)' }}
            title="Clear Chat History"
          >
            <RotateCcw size={14} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="btn-icon"
              style={{ width: '26px', height: '26px', color: 'var(--text-secondary)' }}
              title="Close Agent Panel"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Bring Your Own LLM (BYOK) Configuration Card */}
      {showConfig && (
        <div style={{ padding: '14px 16px', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <KeyRound size={13} style={{ color: '#3b82f6' }} />
              Bring Your Own LLM (BYOK)
            </div>
            <button
              onClick={() => {
                toast('Configuration saved', 'success');
                setShowConfig(false);
              }}
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'var(--accent-primary)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Done
            </button>
          </div>

          {/* Provider Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>LLM Provider</label>
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
              style={{
                fontSize: '12px',
                padding: '6px 8px',
                background: 'var(--bg-0)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            >
              {Object.values(PROVIDER_PRESETS).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
              {PROVIDER_PRESETS[provider]?.helpText}
            </div>
          </div>

          {/* API Key */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                {PROVIDER_PRESETS[provider]?.requiresKey
                  ? `${PROVIDER_PRESETS[provider].name} API Key`
                  : `${PROVIDER_PRESETS[provider].name} Key (Optional)`}
              </label>
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '10.5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: 0,
                }}
              >
                {showKey ? <EyeOff size={11} /> : <Eye size={11} />}
                <span>{showKey ? 'Hide' : 'Show'}</span>
              </button>
            </div>
            <input
              type={showKey ? 'text' : 'password'}
              placeholder={PROVIDER_PRESETS[provider]?.keyPlaceholder || 'Enter your API key'}
              value={apiKey}
              onChange={(e) => handleUpdateConfig({ apiKey: e.target.value })}
              style={{
                fontSize: '11.5px',
                padding: '6px 10px',
                background: 'var(--bg-0)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
          </div>

          {/* Model Selection & Custom Name */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>Model Preset</label>
              <select
                value={PROVIDER_PRESETS[provider]?.models.includes(model) ? model : 'custom-model'}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val !== 'custom-model') {
                    handleUpdateConfig({ model: val });
                  }
                }}
                style={{
                  fontSize: '11.5px',
                  padding: '6px 8px',
                  background: 'var(--bg-0)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              >
                {PROVIDER_PRESETS[provider]?.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
                <option value="custom-model">Custom Model ID…</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>Active Model ID</label>
              <input
                type="text"
                value={model}
                onChange={(e) => handleUpdateConfig({ model: e.target.value })}
                placeholder="e.g. gpt-4o, claude-3-5-sonnet-20241022"
                style={{
                  fontSize: '11.5px',
                  padding: '6px 8px',
                  background: 'var(--bg-0)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Base URL */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Globe size={11} /> API Base URL
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => handleUpdateConfig({ baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
              style={{
                fontSize: '11.5px',
                padding: '6px 10px',
                background: 'var(--bg-0)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
          </div>

          {/* Connection Test Action & Live Status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testingConnection}
                style={{
                  fontSize: '11px',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  background: 'rgba(59, 130, 246, 0.12)',
                  color: '#3b82f6',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  cursor: testingConnection ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Activity size={12} />
                <span>{testingConnection ? 'Testing Connection...' : 'Test Connection'}</span>
              </button>

              {!apiKey && (
                <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                  (No key entered: will test default system key)
                </span>
              )}
            </div>

            {connectionStatus.tested && (
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: connectionStatus.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  color: connectionStatus.success ? '#10b981' : '#ef4444',
                  border: `1px solid ${connectionStatus.success ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                }}
              >
                {connectionStatus.success ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                <span>{connectionStatus.message}</span>
              </div>
            )}
          </div>

          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
            🔒 Credentials are stored client-side in your local browser storage. All outgoing requests are sanitized by Nulltor's secret redaction engine.
          </div>
        </div>
      )}

      {/* Messages Stream */}
      <div className="agent-messages-container">
        {displayMessages.length === 1 && (
          <div className="agent-starter-grid">
            <div
              className="agent-starter-card"
              onClick={() => handleSend(`Audit and fix compiler errors/warnings in ${openFile?.name || 'active file'}`)}
            >
              <Bug size={15} style={{ color: '#ef4444' }} />
              <span>Fix errors & compiler warnings in {openFile?.name || 'current file'}</span>
            </div>

            <div
              className="agent-starter-card"
              onClick={() => handleSend(`Search codebase for main functions and explain architecture`)}
            >
              <Search size={15} style={{ color: '#a855f7' }} />
              <span>Search codebase & explain project architecture</span>
            </div>

            <div
              className="agent-starter-card"
              onClick={() => handleSend(`Write complete unit tests for ${openFile?.name || 'active file'} and run them in sandbox`)}
            >
              <Terminal size={15} style={{ color: '#10b981' }} />
              <span>Write and verify unit tests in isolated sandbox</span>
            </div>

            <div
              className="agent-starter-card"
              onClick={() => handleSend(`Refactor ${openFile?.name || 'active file'} for cleaner structure and best practices`)}
            >
              <Zap size={15} style={{ color: '#f59e0b' }} />
              <span>Refactor & optimize {openFile?.name || 'current file'}</span>
            </div>
          </div>
        )}

        {displayMessages.map((m) => {
          const isUser = m.role === 'user';
          return (
            <div key={m.id} className={`agent-msg-row ${isUser ? 'user' : 'assistant'}`}>
              <div className="agent-msg-sender">
                {isUser ? (
                  <>
                    <span>You</span>
                    <User size={12} style={{ color: '#3b82f6' }} />
                    {m.timestamp && (
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px', fontWeight: 400 }}>
                        {m.timestamp}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <Bot size={12} style={{ color: '#10b981' }} />
                    <span>Agent</span>
                    {m.timestamp && (
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px', fontWeight: 400 }}>
                        {m.timestamp}
                      </span>
                    )}
                  </>
                )}
              </div>

              <FormattedChatMessage
                message={m}
                openFileName={openFile?.name}
                onApplyCode={onApplyCode}
                onRetry={m.isError ? () => handleSend() : undefined}
              />
            </div>
          );
        })}

        {/* Loading / Reasoning Indicator */}
        {loading && (
          <div className="agent-msg-row assistant">
            <div className="agent-msg-sender">
              <Bot size={12} style={{ color: '#10b981' }} />
              <span>Agent</span>
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                background: 'var(--bg-2)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '12px 12px 12px 2px',
                color: '#3b82f6',
                fontSize: '12px',
                fontWeight: 500,
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <RefreshCw size={13} className="spin" />
              <span>Agent reasoning, updating workspace & running tools…</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <div style={{ padding: '12px 14px', background: 'var(--bg-1)', borderTop: '1px solid var(--border)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '8px 12px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={openFile ? `Ask about ${openFile.name} or instruct changes...` : 'Instruct the agent...'}
            rows={1}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '13px',
              resize: 'none',
              outline: 'none',
              fontFamily: 'var(--font-ui)',
              lineHeight: '1.4',
            }}
          />

          <button
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              background: input.trim() ? 'var(--accent-primary)' : 'var(--bg-3)',
              border: 'none',
              color: input.trim() ? '#ffffff' : 'var(--text-muted)',
              cursor: input.trim() ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              transition: 'all 0.15s ease',
            }}
            title="Send instruction (Enter)"
          >
            <Send size={13} />
          </button>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '6px',
            fontSize: '10.5px',
            color: 'var(--text-muted)',
          }}
        >
          <span>
            Press <kbd style={{ background: 'var(--bg-2)', padding: '1px 4px', borderRadius: '3px', border: '1px solid var(--border)' }}>Enter</kbd> to run
          </span>
          <span>
            <kbd style={{ background: 'var(--bg-2)', padding: '1px 4px', borderRadius: '3px', border: '1px solid var(--border)' }}>Shift+Enter</kbd> for newline
          </span>
        </div>
      </div>
    </div>
  );
}
