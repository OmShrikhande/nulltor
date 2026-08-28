import React, { useState, useRef, useEffect } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { useProjectStore } from '../../store/projectStore';
import { aiApi, type ChatMessage, type ToolExecutionResult } from '../../api/ai';
import { toast } from '../shared/Toast';
import { Bot, User, Send, Terminal, CheckCircle2, RotateCcw, Settings2, FileCode, Layers, ShieldCheck, CornerDownLeft, X, RefreshCw } from 'lucide-react';

interface AgentPanelProps {
  onApplyCode?: (fileName: string, code: string) => Promise<void> | void;
  onRefreshTree?: () => void;
  currentCode?: string;
  projectId?: string;
  branchId?: string;
  onClose?: () => void;
}

export function AgentPanel({ onApplyCode, onRefreshTree, currentCode = '', projectId, branchId, onClose }: AgentPanelProps) {
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
        // Auto-refresh the file explorer tree after any file operation
        if (onRefreshTree) onRefreshTree();
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#111215', borderLeft: '1px solid #1f2128', overflow: 'hidden' }}>
      
      {/* Header matching Mockup */}
      <div style={{
        height: '42px',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #1f2128',
        background: '#111215'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bot size={16} style={{ color: '#3b82f6' }} />
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}>
            Agent
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="btn-icon"
            style={{ width: '26px', height: '26px', color: showConfig ? '#3b82f6' : '#94a3b8' }}
            title="Configure Agent & API Key"
          >
            <Settings2 size={14} />
          </button>
          <button
            onClick={handleClearChat}
            className="btn-icon"
            style={{ width: '26px', height: '26px', color: '#94a3b8' }}
            title="Clear Chat History"
          >
            <RotateCcw size={14} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="btn-icon"
              style={{ width: '26px', height: '26px', color: '#94a3b8' }}
              title="Close Agent Panel"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* API Key / Model Settings Card */}
      {showConfig && (
        <div style={{ padding: '12px 16px', background: '#18191e', borderBottom: '1px solid #1f2128' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#f8fafc', marginBottom: '6px' }}>
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
                background: '#111215',
                border: '1px solid #2a2d36',
                borderRadius: '6px',
                color: '#f8fafc',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '4px' }}>
            Key is stored locally in your browser session.
          </div>
        </div>
      )}

      {/* Messages / Action Cards Stream */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '4px' }}>
            {/* Action Output Card from Mockup */}
            <div style={{
              background: '#18191e',
              border: '1px solid #252830',
              borderRadius: '8px',
              padding: '12px 14px',
              fontSize: '12.5px',
              color: '#cbd5e1',
              lineHeight: '1.45'
            }}>
              Refactored {openFile?.name || 'file'} for early exit & clean execution
            </div>

            {/* Interactive Prompt Chip Cards from Mockup */}
            <div
              onClick={() => {
                const p = `Add type hints and docstrings to ${openFile?.name || 'active file'}`;
                setInput(p);
              }}
              style={{
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: '8px',
                padding: '12px 14px',
                fontSize: '12.5px',
                color: '#93c5fd',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Add type hints to {openFile?.name || 'current file'}
            </div>

            <div
              onClick={() => {
                const p = `Write comprehensive unit tests for ${openFile?.name || 'active file'}`;
                setInput(p);
              }}
              style={{
                background: '#18191e',
                border: '1px solid #252830',
                borderRadius: '8px',
                padding: '12px 14px',
                fontSize: '12.5px',
                color: '#94a3b8',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Generate unit tests for {openFile?.name || 'current file'}
            </div>
          </div>
        ) : (
          messages.map((m, idx) => {
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#64748b' }}>
                  {isUser ? <User size={12} style={{ color: '#3b82f6' }} /> : <Bot size={12} style={{ color: '#10b981' }} />}
                  <span style={{ fontWeight: 600 }}>{isUser ? 'You' : 'Agent'}</span>
                </div>

                <div
                  style={{
                    maxWidth: '92%',
                    padding: '10px 14px',
                    borderRadius: isUser ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                    background: isUser ? '#2563eb' : '#18191e',
                    border: isUser ? '1px solid #1d4ed8' : '1px solid #252830',
                    color: '#ffffff',
                    fontSize: '12.5px',
                    lineHeight: '1.55',
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {m.content}
                </div>
              </div>
            );
          })
        )}

        {/* Loading Indicator */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: '#18191e', border: '1px solid #3b82f6', borderRadius: '10px', maxWidth: '90%', color: '#60a5fa', fontSize: '12px' }}>
            <RefreshCw size={13} className="spin" />
            <span>Agent executing workspace instructions…</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box matching Mockup */}
      <div style={{ padding: '12px 14px', background: '#111215', borderTop: '1px solid #1f2128' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: '#18191e',
          border: '1px solid #2a2d36',
          borderRadius: '10px',
          padding: '8px 12px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
        }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Instruct the agent"
            rows={1}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: '#f8fafc',
              fontSize: '13px',
              resize: 'none',
              outline: 'none',
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
