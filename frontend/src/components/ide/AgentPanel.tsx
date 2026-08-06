import { useEditorStore } from '../../store/editorStore';
import { useProjectStore } from '../../store/projectStore';

const AI_ENDPOINT = import.meta.env.VITE_AI_ENDPOINT as string | undefined;

export function AgentPanel({ embedded = false }: { embedded?: boolean }) {
  const openFile = useEditorStore((s) => s.openFile);
  const { currentProject, currentBranch } = useProjectStore();

  const context = [
    currentProject ? `Project: ${currentProject.name}` : null,
    currentBranch ? `Subroom: ${currentBranch.name} (${currentBranch.type})` : null,
    openFile ? `File: ${openFile.name}` : null,
  ].filter(Boolean).join(' · ');

  const inner = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '20px', background: 'var(--bg-1)' }}>
      {/* Sleek Notification Card */}
      <div
        className="glass-card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: '28px 20px',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-2)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow)',
          maxWidth: '440px',
          margin: 'auto',
        }}
      >
        {/* Glow AI Icon */}
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(1, 239, 172, 0.2), rgba(82, 64, 148, 0.3))',
            border: '1px solid var(--aurora-mint)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '26px',
            marginBottom: '16px',
            boxShadow: '0 0 20px rgba(1, 239, 172, 0.2)',
          }}
        >
          🤖
        </div>

        {/* ✨ COMING SOON Badge */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(1, 239, 172, 0.12)',
            border: '1px solid rgba(1, 239, 172, 0.35)',
            color: 'var(--aurora-mint)',
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: '12px',
          }}
        >
          ✨ COMING SOON
        </span>

        {/* AI Agent Title */}
        <h3
          style={{
            fontSize: '20px',
            fontWeight: 800,
            fontFamily: 'var(--font-ui)',
            color: 'var(--text-primary)',
            marginBottom: '10px',
            letterSpacing: '-0.02em',
          }}
        >
          AI Agent Assistant
        </h3>

        {/* User Requested Notification Description */}
        <p
          style={{
            fontSize: '13px',
            lineHeight: '1.6',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-ui)',
            marginBottom: '20px',
            maxWidth: '360px',
          }}
        >
          The AI agent will read your open file and project context to answer questions, explain code, suggest improvements, and help debug.
        </p>

        {/* Active Context Footer Pill */}
        {context && (
          <div
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-xs)',
              background: 'var(--bg-1)',
              border: '1px solid var(--border)',
              fontSize: '11px',
              color: 'var(--aurora-teal)',
              fontFamily: 'var(--font-mono)',
              wordBreak: 'break-all',
            }}
          >
            📍 {context}
          </div>
        )}

        {!AI_ENDPOINT && (
          <div style={{ marginTop: '14px', fontSize: '11px', color: 'var(--text-muted)' }}>
            Configure <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-3)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-primary)' }}>VITE_AI_ENDPOINT</code> in <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-3)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-primary)' }}>.env</code> to activate.
          </div>
        )}
      </div>

      {/* Disabled Input Bar at bottom */}
      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
        <input
          type="text"
          placeholder="Ask anything about your code… (coming soon)"
          disabled
          style={{
            flex: 1,
            padding: '8px 12px',
            fontSize: '12.5px',
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xs)',
            color: 'var(--text-muted)',
            cursor: 'not-allowed',
          }}
        />
        <button className="btn btn-primary btn-sm" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
          Send
        </button>
      </div>
    </div>
  );

  if (embedded) return inner;

  return (
    <div className="ide-agent-pane" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="agent-header" style={{ height: '36px', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', fontSize: '12px', fontWeight: 700 }}>
        🤖 AI Agent Assistant
      </div>
      {inner}
    </div>
  );
}
