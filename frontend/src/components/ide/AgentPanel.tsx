/**
 * AgentPanel — AI Agent Chat (Phase 5: Under Development)
 * 
 * This panel is scaffolded with a "Coming Soon" placeholder UI.
 * When VITE_AI_ENDPOINT is configured, it will accept the open file's
 * decrypted content + project context and stream responses from the LLM.
 */
import { useEditorStore } from '../../store/editorStore';
import { useProjectStore } from '../../store/projectStore';

const AI_ENDPOINT = import.meta.env.VITE_AI_ENDPOINT as string | undefined;

export function AgentPanel({ embedded = false }: { embedded?: boolean }) {
  const openFile = useEditorStore((s) => s.openFile);
  const { currentProject, currentBranch } = useProjectStore();

  const context = [
    currentProject ? `Project: ${currentProject.name}` : null,
    currentBranch ? `Branch: ${currentBranch.name} (${currentBranch.type})` : null,
    openFile ? `File: ${openFile.name}` : null,
  ].filter(Boolean).join(' · ');

  const inner = (
    <>
      <div className="agent-body">
        <div className="agent-placeholder">
          <div className="ai-icon">🤖</div>
          <span className="coming-badge">COMING SOON</span>
          <h4>AI Agent</h4>
          <p>
            The AI agent will read your open file and project context to answer
            questions, explain code, suggest improvements, and help debug.
          </p>
          {context && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 8, wordBreak: 'break-all' }}>
              {context}
            </p>
          )}
          {!AI_ENDPOINT && (
            <p style={{ marginTop: 12, fontSize: 11 }}>
              Set <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-3)', padding: '1px 4px', borderRadius: 3 }}>VITE_AI_ENDPOINT</code> in{' '}
              <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-3)', padding: '1px 4px', borderRadius: 3 }}>.env</code> to activate.
            </p>
          )}
        </div>
      </div>
      <div className="agent-footer">
        <textarea
          className="agent-input"
          placeholder="Ask anything about your code… (coming soon)"
          disabled
          rows={1}
        />
        <button className="btn btn-primary btn-sm" disabled>Send</button>
      </div>
    </>
  );

  if (embedded) return inner;

  return (
    <div className="ide-agent-pane">
      <div className="agent-header">
        <svg viewBox="0 0 16 16" fill="currentColor" width={16} height={16} style={{ color: 'var(--accent)' }}>
          <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm1.5 0a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm4.879-2.773 4.264 2.559a.25.25 0 0 1 0 .428l-4.264 2.559A.25.25 0 0 1 6 10.559V5.442a.25.25 0 0 1 .379-.215Z"/>
        </svg>
        AI Agent
      </div>
      {inner}
    </div>
  );
}
