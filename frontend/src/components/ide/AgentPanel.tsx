import { useState, useRef, useEffect } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { useProjectStore } from '../../store/projectStore';
import { aiApi, type ChatMessage, type ToolExecutionResult } from '../../api/ai';
import { toast } from '../shared/Toast';
import { Bot, User, Send, RotateCcw, Settings2, FileCode, ShieldCheck, X, RefreshCw, Copy, Check, Sparkles, Code2, ArrowUpRight } from 'lucide-react';

interface AgentPanelProps {
  onApplyCode?: (fileName: string, code: string) => Promise<void> | void;
  currentCode?: string;
  projectId?: string;
  branchId?: string;
  onClose?: () => void;
}

export function AgentPanel({ onApplyCode, currentCode = '', projectId, branchId, onClose }: AgentPanelProps) {
  const openFile = useEditorStore((s) => s.openFile);
  const { currentProject, currentBranch } = useProjectStore();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Hello! I am DevBot, your autonomous AI coding assistant. Ask me to write code, debug issues, refactor, or generate unit tests directly for your workspace.'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('nulltor_groq_key') || '');
  const [showConfig, setShowConfig] = useState(false);
  const [, setToolLogs] = useState<ToolExecutionResult[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  function handleSaveKey(newKey: string) {
    setApiKey(newKey);
    localStorage.setItem('nulltor_groq_key', newKey);
    toast('API configuration saved', 'success');
  }

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userText = input.trim();
    const newMsg: ChatMessage = { role: 'user', content: userText };
    const updatedHistory = [...messages, newMsg];

    setMessages(updatedHistory);
    setInput('');
    setLoading(true);

    const cleanMessages = updatedHistory.filter(
      (m) => !(m.content && (m.content.startsWith('Error:') || m.content.startsWith('Agent execution error:')))
    );

    try {
      const res = await aiApi.chat({
        messages: cleanMessages,
        project_id: projectId || currentProject?.id,
        branch_id: branchId || currentBranch?.id,
        active_file_name: openFile?.name,
        active_file_content: currentCode,
        api_key: apiKey || undefined,
        model: 'llama-3.3-70b-versatile',
        base_url: 'https://api.groq.com/openai/v1'
      });

      setMessages(res.updated_messages.filter(m => m.role === 'user' || m.role === 'assistant'));

      if (res.executed_tools && res.executed_tools.length > 0) {
        setToolLogs(prev => [...prev, ...res.executed_tools]);
      }

      if (res.code_modifications) {
        for (const [fileName, code] of Object.entries(res.code_modifications)) {
          if (onApplyCode) {
            await onApplyCode(fileName, code);
          }
        }
      }

    } catch (e: any) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${e.message || 'Failed to communicate with agent service.'}`
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleClearChat() {
    setMessages([
      {
        role: 'assistant',
        content: 'Conversation history cleared. Ready for your next instruction.'
      }
    ]);
    setToolLogs([]);
  }

  function handleCopy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
    toast('Code copied to clipboard', 'success');
  }

  // Render message content with formatted code blocks
  const renderMessageContent = (content: string = '', msgIndex: number) => {
    if (!content || !content.includes('```')) {
      return <span>{content}</span>;
    }

    const parts = content.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const lines = part.slice(3, -3).trim().split('\n');
        const lang = lines[0].match(/^[a-zA-Z0-9_-]+$/) ? lines[0] : '';
        const code = lang ? lines.slice(1).join('\n') : lines.join('\n');
        const blockId = `${msgIndex}-${i}`;

        return (
          <div
            key={i}
            style={{
              margin: '10px 0',
              borderRadius: '8px',
              overflow: 'hidden',
              background: 'var(--bg-0)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                background: 'var(--bg-2)',
                borderBottom: '1px solid var(--border)',
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Code2 size={13} style={{ color: 'var(--accent)' }} />
                <span>{lang || 'code'}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => handleCopy(code, blockId)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    fontSize: '10.5px',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                  title="Copy Code"
                >
                  {copiedIndex === blockId ? <Check size={11} style={{ color: '#10b981' }} /> : <Copy size={11} />}
                  <span>{copiedIndex === blockId ? 'Copied' : 'Copy'}</span>
                </button>

                {onApplyCode && openFile && (
                  <button
                    type="button"
                    onClick={() => onApplyCode(openFile.name, code)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      fontSize: '10.5px',
                      background: 'var(--accent)',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#ffffff',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                    title={`Apply directly to ${openFile.name}`}
                  >
                    <ArrowUpRight size={11} />
                    <span>Apply</span>
                  </button>
                )}
              </div>
            </div>

            <pre
              className="font-mono"
              style={{
                margin: 0,
                padding: '10px 12px',
                fontSize: '11.5px',
                lineHeight: '1.45',
                overflowX: 'auto',
                color: 'var(--text-primary)',
                background: 'var(--bg-0)',
              }}
            >
              {code}
            </pre>
          </div>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-1)', borderLeft: '1px solid var(--border)', overflow: 'hidden' }}>

      {/* Sleek Modern Header */}
      <div
        style={{
          height: '46px',
          padding: '0 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
          background: 'var(--header-bg, var(--bg-1))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '6px',
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)',
            }}
          >
            <Sparkles size={14} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>
                DevBot Assistant
              </span>
              <span
                style={{
                  fontSize: '9.5px',
                  fontWeight: 700,
                  color: loading ? '#f59e0b' : '#10b981',
                  background: loading ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                  border: `1px solid ${loading ? '#f59e0b' : '#10b981'}`,
                  padding: '1px 6px',
                  borderRadius: '10px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                }}
              >
                <span
                  style={{
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    background: 'currentColor',
                  }}
                />
                {loading ? 'Reasoning' : 'Ready'}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="btn-icon"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: showConfig ? 'var(--bg-2)' : 'transparent',
              color: showConfig ? 'var(--accent)' : 'var(--text-secondary)',
              border: showConfig ? '1px solid var(--border)' : 'none',
            }}
            title="Configure Agent & API Key"
          >
            <Settings2 size={14} />
          </button>

          <button
            onClick={handleClearChat}
            className="btn-icon"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              color: 'var(--text-secondary)',
            }}
            title="Clear Chat History"
          >
            <RotateCcw size={14} />
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="btn-icon"
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                color: 'var(--text-secondary)',
                marginLeft: '2px',
              }}
              title="Close DevBot"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* API Key / Provider Configuration Card */}
      {showConfig && (
        <div style={{ padding: '12px 14px', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)', animation: 'slideDown 0.15s ease' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
            LLM Service Configuration
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type="password"
              placeholder="Groq API Key (gsk_...)"
              value={apiKey}
              onChange={(e) => handleSaveKey(e.target.value)}
              style={{
                flex: 1,
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
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '5px' }}>
            Model: <strong>Groq Llama-3.3-70B Versatile</strong> · Key saved locally in browser.
          </div>
        </div>
      )}

      {/* Messages Feed */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {messages.map((m, idx) => {
          const isUser = m.role === 'user';
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isUser ? 'flex-end' : 'flex-start',
                gap: '5px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                {isUser ? <User size={12} style={{ color: 'var(--accent)' }} /> : <Bot size={12} style={{ color: '#10b981' }} />}
                <span style={{ fontWeight: 700 }}>{isUser ? 'You' : 'DevBot'}</span>
              </div>

              <div
                style={{
                  maxWidth: '92%',
                  padding: '12px 14px',
                  borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  background: isUser ? 'var(--accent)' : 'var(--bg-0)',
                  border: isUser ? 'none' : '1px solid var(--border)',
                  color: isUser ? '#ffffff' : 'var(--text-primary)',
                  fontSize: '12.5px',
                  lineHeight: '1.55',
                  wordBreak: 'break-word',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                {renderMessageContent(m.content || '', idx)}
              </div>
            </div>
          );
        })}

        {/* Loading / Reasoning State */}
        {loading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              background: 'var(--bg-0)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              maxWidth: '85%',
              color: 'var(--text-primary)',
              fontSize: '12px',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <RefreshCw size={13} className="spin" style={{ color: 'var(--accent)' }} />
            <span>DevBot is reasoning & generating changes…</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Action Prompt Chips */}
      <div
        style={{
          padding: '8px 12px',
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          background: 'var(--bg-1)',
          borderTop: '1px solid var(--border)',
        }}
      >
        {[
          { label: '⚡ Explain Code', prompt: 'Explain how the active code works step-by-step and highlight key logic.' },
          { label: '🧪 Generate Tests', prompt: 'Write comprehensive unit test cases for the active file.' },
          { label: '✨ Optimize Code', prompt: 'Refactor and optimize the active file for performance and clean structure.' },
          { label: '🐛 Debug & Fix', prompt: 'Identify potential bugs, edge cases, or errors in this file and provide the fix.' },
        ].map((chip) => (
          <button
            key={chip.label}
            type="button"
            className="btn btn-xs"
            onClick={() => setInput(chip.prompt)}
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '4px 10px',
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              borderRadius: '20px',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Active File Context & Mode Bar */}
      <div
        style={{
          padding: '6px 14px',
          background: 'var(--bg-2)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: 'var(--text-muted)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <FileCode size={12} style={{ color: 'var(--accent)' }} />
          <span>Active file: <strong style={{ color: 'var(--text-primary)' }}>{openFile?.name || 'No file selected'}</strong></span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ShieldCheck size={12} style={{ color: '#10b981' }} />
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Direct Workspace Sync</span>
        </div>
      </div>

      {/* Modern Prompt Input Box */}
      <div style={{ padding: '12px 14px 16px', background: 'var(--bg-1)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '8px',
            background: 'var(--bg-0)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '8px 12px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask DevBot anything or type an instruction..."
            rows={2}
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: '12.5px',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              lineHeight: '1.45',
            }}
          />

          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={{
              padding: '7px 12px',
              borderRadius: '6px',
              background: input.trim() ? 'var(--accent)' : 'var(--bg-2)',
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

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '10.5px', color: 'var(--text-muted)' }}>
          <span>Press <kbd style={{ background: 'var(--bg-2)', padding: '1px 5px', borderRadius: '3px', border: '1px solid var(--border)' }}>Enter</kbd> to run</span>
          <span><kbd style={{ background: 'var(--bg-2)', padding: '1px 5px', borderRadius: '3px', border: '1px solid var(--border)' }}>Shift+Enter</kbd> for newline</span>
        </div>
      </div>

    </div>
  );
}
