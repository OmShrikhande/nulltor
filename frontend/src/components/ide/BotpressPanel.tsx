import React, { useEffect, useState } from 'react';
import { Bot, MessageSquare, PlusCircle, Eye, Edit3, Sparkles, Trash2, CheckCircle2, FileCode, ArrowRight, ShieldCheck } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import { useProjectStore } from '../../store/projectStore';
import { toast } from '../shared/Toast';

interface BotpressPanelProps {
  projectId: string;
  branchId?: string;
  onRefreshTree?: () => void;
  onApplyCode?: (fileName: string, code: string) => Promise<void> | void;
}

export function BotpressPanel({ projectId, branchId, onRefreshTree, onApplyCode }: BotpressPanelProps) {
  const openFile = useEditorStore((s) => s.openFile);
  const { currentBranch } = useProjectStore();
  const [isReady, setIsReady] = useState(false);

  // 1. Mount Global Client Tool Bridge for Botpress
  useEffect(() => {
    const bridge = {
      createFile: async (filename: string, initialContent: string = '') => {
        try {
          const res = await fetch('/api/tools/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({ action: 'create_file', project_id: projectId, branch_id: branchId, file_path: filename, content: initialContent })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || 'Failed to create file');
          toast(`Botpress created file '${filename}'`, 'success');
          if (onRefreshTree) onRefreshTree();
          return data;
        } catch (err: any) {
          toast(`Create failed: ${err.message}`, 'error');
          throw err;
        }
      },
      readFile: async (filename?: string) => {
        const target = filename || openFile?.name || 'active file';
        try {
          const res = await fetch('/api/tools/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({ action: 'read_file', project_id: projectId, branch_id: branchId, file_path: target })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || 'Failed to read file');
          return data;
        } catch (err: any) {
          toast(`Read failed: ${err.message}`, 'error');
          throw err;
        }
      },
      writeFile: async (filename: string, content: string) => {
        try {
          const res = await fetch('/api/tools/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({ action: 'write_file', project_id: projectId, branch_id: branchId, file_path: filename, content })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || 'Failed to write file');
          if (openFile?.name === filename && onApplyCode) {
            onApplyCode(filename, content);
          }
          toast(`Botpress updated '${filename}'`, 'success');
          if (onRefreshTree) onRefreshTree();
          return data;
        } catch (err: any) {
          toast(`Write failed: ${err.message}`, 'error');
          throw err;
        }
      },
      modifyFile: async (filename: string, content: string) => {
        try {
          const res = await fetch('/api/tools/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({ action: 'modify_file', project_id: projectId, branch_id: branchId, file_path: filename, content })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || 'Failed to modify file');
          if (openFile?.name === filename && onApplyCode) {
            onApplyCode(filename, content);
          }
          toast(`Botpress modified '${filename}'`, 'success');
          if (onRefreshTree) onRefreshTree();
          return data;
        } catch (err: any) {
          toast(`Modify failed: ${err.message}`, 'error');
          throw err;
        }
      },
      deleteFile: async (filename: string) => {
        try {
          const res = await fetch('/api/tools/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({ action: 'delete_file', project_id: projectId, branch_id: branchId, file_path: filename })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || 'Failed to delete file');
          toast(`Botpress deleted '${filename}'`, 'info');
          if (onRefreshTree) onRefreshTree();
          return data;
        } catch (err: any) {
          toast(`Delete failed: ${err.message}`, 'error');
          throw err;
        }
      },
      listFiles: async () => {
        const res = await fetch('/api/tools/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: JSON.stringify({ action: 'list_files', project_id: projectId, branch_id: branchId })
        });
        return await res.json();
      },
      getActiveFile: () => openFile?.name || null,
      getProjectId: () => projectId,
      getBranchId: () => branchId || null,
    };

    (window as any).nulltorTools = bridge;
    (window as any).botpressTools = bridge;

    // Check if window.botpress is ready
    const interval = setInterval(() => {
      if ((window as any).botpress) {
        setIsReady(true);
        clearInterval(interval);
      }
    }, 800);

    return () => clearInterval(interval);
  }, [projectId, branchId, openFile, onRefreshTree, onApplyCode]);

  function openBotpressChat(initialPrompt?: string) {
    const bp = (window as any).botpress;
    if (bp) {
      if (typeof bp.open === 'function') {
        bp.open();
      } else if (typeof bp.sendEvent === 'function') {
        bp.sendEvent({ type: 'toggle' });
      }

      if (initialPrompt && typeof bp.sendPayload === 'function') {
        setTimeout(() => {
          bp.sendPayload({ type: 'text', text: initialPrompt });
        }, 400);
      }
    } else {
      toast('Botpress is initializing. Please click again in a moment.', 'info');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-1)', borderRight: '1px solid var(--border)' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-0)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--sapphire-dim)', color: 'var(--sapphire-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bot size={18} />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              DevBot AI
              <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '8px', background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', fontWeight: 700 }}>
                ● ONLINE
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Botpress Cloud Assistant
            </div>
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Primary Launch Card */}
        <div
          onClick={() => openBotpressChat()}
          style={{
            padding: '16px',
            borderRadius: '10px',
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--sapphire-light)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--sapphire-border)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13.5px', color: 'var(--text-primary)' }}>
              <MessageSquare size={16} style={{ color: 'var(--sapphire-light)' }} />
              Open DevBot Chat
            </div>
            <ArrowRight size={14} style={{ color: 'var(--sapphire-light)' }} />
          </div>
          <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
            Click to launch your full Botpress conversational assistant with multi-turn reasoning and tool access.
          </p>
        </div>

        {/* Quick Triggers */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '8px' }}>
            Quick Actions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[
              { label: '📝 Create New File', prompt: 'Please create a new utility file for this project with example functions.' },
              { label: '🔍 Explain Active File', prompt: `Read and explain the contents of ${openFile?.name || 'the active file'}.` },
              { label: '✨ Refactor & Optimize', prompt: `Analyze and optimize ${openFile?.name || 'the active file'} for better performance and readability.` },
              { label: '🛡️ Security & Bug Check', prompt: `Scan ${openFile?.name || 'the active file'} for bugs, security vulnerabilities, and logic errors.` },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => openBotpressChat(item.prompt)}
                style={{
                  textAlign: 'left',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  background: 'var(--bg-0)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--sapphire-light)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                <span>{item.label}</span>
                <ArrowRight size={12} style={{ opacity: 0.5 }} />
              </button>
            ))}
          </div>
        </div>

        {/* Enabled Tools List */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '8px' }}>
            Workspace Capabilities
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
            <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--bg-0)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-primary)' }}>
              <PlusCircle size={13} style={{ color: 'var(--sapphire-light)' }} />
              <span>create_file</span>
            </div>
            <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--bg-0)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-primary)' }}>
              <Eye size={13} style={{ color: 'var(--sapphire-light)' }} />
              <span>read_file</span>
            </div>
            <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--bg-0)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-primary)' }}>
              <Edit3 size={13} style={{ color: 'var(--sapphire-light)' }} />
              <span>write_file</span>
            </div>
            <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--bg-0)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-primary)' }}>
              <Sparkles size={13} style={{ color: 'var(--sapphire-light)' }} />
              <span>modify_file</span>
            </div>
            <div style={{ gridColumn: 'span 2', padding: '8px 10px', borderRadius: '6px', background: 'var(--bg-0)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-primary)' }}>
              <Trash2 size={13} style={{ color: 'var(--danger)' }} />
              <span>delete_file</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Status */}
      <div style={{ padding: '10px 14px', background: 'var(--bg-0)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <FileCode size={12} />
          <span>Target: <strong style={{ color: 'var(--sapphire-light)' }}>{openFile?.name || currentBranch?.name || 'main'}</strong></span>
        </div>
        <button
          onClick={() => openBotpressChat()}
          className="btn btn-primary btn-xs"
          style={{ background: 'var(--accent-primary)', color: '#fff', fontWeight: 700, padding: '4px 10px', borderRadius: '6px' }}
        >
          Open Chat
        </button>
      </div>
    </div>
  );
}
