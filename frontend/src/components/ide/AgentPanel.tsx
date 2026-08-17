import React, { useState, useRef, useEffect } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { useProjectStore } from '../../store/projectStore';
import { aiApi, type ChatMessage, type ToolExecutionResult } from '../../api/ai';
import { toast } from '../shared/Toast';
import { Bot, User, Send, Terminal, CheckCircle2, RotateCcw, Settings2, FileCode, Layers, ShieldCheck, CornerDownLeft, X, RefreshCw } from 'lucide-react';

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
      content: 'I am the Nulltor autonomous software agent. Ask me to write, refactor, debug, or create new files, and I will execute the changes directly in your workspace.'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('nulltor_groq_key') || '');
  const [showConfig, setShowConfig] = useState(false);
  const [toolLogs, setToolLogs] = useState<ToolExecutionResult[]>([]);

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

    // Filter out previous error alerts so they do not confuse the model's tool calling
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
        model: 'openai/gpt-oss-120b',
        base_url: 'https://api.groq.com/openai/v1'
      });

      // Update message history
      setMessages(res.updated_messages.filter(m => m.role === 'user' || m.role === 'assistant'));

      // If tools were executed, record them
      if (res.executed_tools && res.executed_tools.length > 0) {
        setToolLogs(prev => [...prev, ...res.executed_tools]);
      }

      // Automatically apply code modifications into the editor
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-1)', borderLeft: '1px solid var(--border)', overflow: 'hidden' }}>
      
      {/* Header */}
      <div style={{ height: '40px', padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bot size={15} style={{ color: 'var(--text-primary)' }} />
          <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.02em', color: 'var(--text-primary)' }}>
            Agent Assistant
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg-2)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
            {apiKey ? 'Groq / Llama-3.3' : 'Local Agent'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="btn-icon"
            style={{ width: '24px', height: '24px', color: showConfig ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
            title="Configure Agent & API Key"
          >
            <Settings2 size={13} />
          </button>
          <button
            onClick={handleClearChat}
            className="btn-icon"
            style={{ width: '24px', height: '24px', color: 'var(--text-secondary)' }}
            title="Clear Chat History"
          >
            <RotateCcw size={13} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="btn-icon"
              style={{ width: '24px', height: '24px', color: 'var(--text-secondary)', marginLeft: '2px' }}
              title="Close Agent Panel"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* API Key / Model Settings Card */}
      {showConfig && (
        <div style={{ padding: '12px', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
            LLM Provider Configuration
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type="password"
              placeholder="Groq API Key (gsk_...)"
              value={apiKey}
              onChange={(e) => handleSaveKey(e.target.value)}
              style={{
                flex: 1,
                fontSize: '11px',
                padding: '6px 8px',
                background: 'var(--bg-0)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Key is stored locally in your browser.
          </div>
        </div>
      )}

      {/* Messages Thread */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {messages.map((m, idx) => {
          const isUser = m.role === 'user';
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isUser ? 'flex-end' : 'flex-start',
                gap: '4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                {isUser ? <User size={12} style={{ color: 'var(--aurora-cyan)' }} /> : <Bot size={12} style={{ color: 'var(--aurora-mint)' }} />}
                <span style={{ fontWeight: 600 }}>{isUser ? 'You' : 'Autonomous Agent'}</span>
              </div>

              <div
                style={{
                  maxWidth: '92%',
                  padding: '10px 14px',
                  borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  background: isUser ? 'var(--accent-primary)' : 'var(--bg-2)',
                  border: isUser ? '1px solid var(--accent-tertiary)' : '1px solid var(--border)',
                  color: isUser ? '#ffffff' : 'var(--text-primary)',
                  fontSize: '12.5px',
                  lineHeight: '1.55',
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap',
                  boxShadow: isUser ? '0 2px 8px rgba(37, 99, 235, 0.25)' : 'none',
                }}
              >
                {m.content}
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--bg-2)', border: '1px solid var(--sapphire-light)', borderRadius: '12px', maxWidth: '85%', color: 'var(--sapphire-light)', fontSize: '12px', boxShadow: '0 0 16px rgba(37, 99, 235, 0.15)' }}>
            <RefreshCw size={13} className="spin" />
            <span>Agent reasoning & executing tools on Groq Llama-3.3…</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompt Chips */}
      <div style={{ padding: '6px 12px', display: 'flex', gap: '6px', overflowX: 'auto', background: 'var(--bg-1)', borderTop: '1px solid var(--border)' }}>
        {[
          { label: '⚡ Explain Code', prompt: 'Explain how the active code works step-by-step and highlight key logic.' },
          { label: '🧪 Generate Tests', prompt: 'Write comprehensive unit test cases for the active file.' },
          { label: '✨ Optimize Code', prompt: 'Refactor and optimize the active file for performance and clean code principles.' },
          { label: '🐛 Debug & Fix', prompt: 'Identify potential bugs, edge cases, or errors in this file and provide the fix.' },
        ].map((chip) => (
          <button
            key={chip.label}
            type="button"
            className="btn btn-xs"
            onClick={() => setInput(chip.prompt)}
            style={{
              fontSize: '10.5px',
              padding: '3px 8px',
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              borderRadius: '12px',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--sapphire-light)';
              e.currentTarget.style.color = 'var(--sapphire-light)';
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

      {/* Active Context Banner */}
      <div style={{ padding: '6px 12px', background: 'var(--bg-0)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <FileCode size={12} />
          <span>Active file: <strong style={{ color: 'var(--sapphire-light)' }}>{openFile?.name || 'None'}</strong></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ShieldCheck size={12} style={{ color: 'var(--success)' }} />
          <span>Direct Write</span>
        </div>
      </div>

      {/* Input Box */}
      <div style={{ padding: '10px 12px 14px', background: 'var(--bg-1)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', transition: 'border-color 0.2s' }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Instruct the agent (e.g. 'Write a JS function to print hello world')..."
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
              fontFamily: 'var(--font-ui)',
              lineHeight: '1.4',
            }}
          />

          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              background: input.trim() ? 'var(--accent-primary)' : 'var(--bg-2)',
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
          <span>Press <kbd style={{ background: 'var(--bg-2)', padding: '1px 4px', borderRadius: '3px', border: '1px solid var(--border)' }}>Enter</kbd> to run</span>
          <span><kbd style={{ background: 'var(--bg-2)', padding: '1px 4px', borderRadius: '3px', border: '1px solid var(--border)' }}>Shift+Enter</kbd> for newline</span>
        </div>
      </div>

    </div>
  );
}
