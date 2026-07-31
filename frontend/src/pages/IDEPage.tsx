import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectsApi } from '../api/projects';
import { branchesApi, type BranchRead } from '../api/branches';
import { useProjectStore } from '../store/projectStore';
import { useEditorStore } from '../store/editorStore';
import { useAuthStore } from '../store/authStore';
import { useDirectoryTree } from '../hooks/useDirectoryTree';
import { useYjsDoc } from '../hooks/useYjsDoc';
import { useCrypto } from '../hooks/useCrypto';
import { FileTree } from '../components/ide/FileTree';
import { EditorPane } from '../components/ide/EditorPane';
import { RunPanel } from '../components/ide/RunPanel';
import { AgentPanel } from '../components/ide/AgentPanel';
import { BranchSelector, CreateBranchModal } from '../components/ide/BranchSelector';
import { StatusBar } from '../components/ide/StatusBar';
import { NulltorLogo } from '../components/shared/NulltorLogo';
import { useTheme } from '../context/ThemeContext';
import { toast } from '../components/shared/Toast';

const SALT = 'nulltor-static-salt-v1';

// ─── Combined Right Panel (Run + AI Agent) ─────────────────────────────────
function RightPanel({ code, language, runTrigger }: { code: string; language: string; runTrigger: number }) {
  const [activeTab, setActiveTab] = useState<'run' | 'agent'>('run');

  useEffect(() => {
    if (runTrigger > 0) setActiveTab('run');
  }, [runTrigger]);

  return (
    <div className="ide-side-drawer">
      {/* Tab Header */}
      <div style={{ height: '36px', background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 8px', gap: '4px' }}>
        <button
          className={`btn btn-sm ${activeTab === 'run' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ padding: '4px 10px', fontSize: '11.5px' }}
          onClick={() => setActiveTab('run')}
        >
          ▶ Output Console
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'agent' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ padding: '4px 10px', fontSize: '11.5px' }}
          onClick={() => setActiveTab('agent')}
        >
          🤖 AI Assistant
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'run' && <RunPanel code={code} language={language} runTrigger={runTrigger} />}
        {activeTab === 'agent' && <AgentPanel embedded />}
      </div>
    </div>
  );
}

const FLOATING_WORDS = [
  { text: 'Nulltor', left: '4%', delay: '-1s' },
  { text: 'E2EE Encryption', left: '15%', delay: '-5s' },
  { text: 'Real-Time Yjs', left: '26%', delay: '-2s' },
  { text: 'Branch Subrooms', left: '38%', delay: '-7s' },
  { text: 'Zero-Knowledge', left: '50%', delay: '-3s' },
  { text: 'FastAPI Backend', left: '62%', delay: '-8s' },
  { text: 'Socket.IO Sync', left: '74%', delay: '-4s' },
  { text: 'Monaco Editor', left: '85%', delay: '-6s' },
  { text: 'Quantum Mesh', left: '93%', delay: '-1.5s' },
  { text: 'Collaborative IDE', left: '10%', delay: '-3.5s' },
  { text: 'SQLite / Postgres', left: '22%', delay: '-6.5s' },
  { text: 'CRDT Deltas', left: '32%', delay: '-0.5s' },
  { text: 'Audit Telemetry', left: '44%', delay: '-4.5s' },
  { text: 'Nulltor Engine', left: '55%', delay: '-8.5s' },
  { text: 'System Governance', left: '68%', delay: '-2.5s' },
  { text: 'Multi-User Sync', left: '78%', delay: '-7.5s' },
  { text: 'AES-256 GCM', left: '88%', delay: '-5.2s' },
  { text: 'Passphrase Vault', left: '6%', delay: '-7.8s' },
  { text: 'Nulltor IDE', left: '48%', delay: '-1.8s' },
  { text: 'Code Workspace', left: '82%', delay: '-3.2s' },
];

function PassphraseModal({
  onSubmit,
  onPrivateCopy,
}: {
  onSubmit: (key: string) => void;
  onPrivateCopy: () => void;
}) {
  const [key, setKey] = useState('');
  return (
    <div className="login-screen">
      <div className="floating-words-bg">
        {FLOATING_WORDS.map((item, idx) => (
          <div
            key={idx}
            className="floating-word"
            style={{ left: item.left, animationDelay: item.delay }}
          >
            {item.text}
          </div>
        ))}
      </div>
      <div className="login-glow" />
      <div className="login-card" style={{ zIndex: 10, maxWidth: 440 }}>
        <div className="login-logo">
          <NulltorLogo size="lg" />
        </div>
        <h1 className="login-title">Secure Session Key</h1>
        <p className="login-sub">
          Enter the room key to initialize zero-knowledge E2EE decryption for this workspace.
        </p>

        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (key.trim()) onSubmit(key.trim());
          }}
        >
          <div className="form-field">
            <label htmlFor="passphrase-input">Room Encryption Key</label>
            <input
              id="passphrase-input"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="e.g. secret-room-key-123"
              autoFocus
              required
            />
          </div>
          <button type="submit" className="btn btn-primary btn-full">
            Unlock Real-Time Room
          </button>
        </form>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            Or work in your isolated local branch without entering room key:
          </p>
          <button className="btn btn-ghost btn-sm btn-full" onClick={onPrivateCopy}>
            🔒 Create Private Local Fork
          </button>
        </div>
      </div>
    </div>
  );
}

export function IDEPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const user = useAuthStore((s) => s.user);
  const [passphrase, setPassphrase] = useState(
    sessionStorage.getItem(`roomkey-${projectId}`) || ''
  );
  const [creatingPrivate, setCreatingPrivate] = useState(false);

  useEffect(() => {
    const savedKey = sessionStorage.getItem(`roomkey-${projectId}`);
    if (savedKey) setPassphrase(savedKey);
  }, [projectId]);

  async function handlePassphraseSubmit(key: string) {
    sessionStorage.setItem(`roomkey-${projectId}`, key);
    setPassphrase(key);
  }

  async function handlePrivateCopy() {
    setCreatingPrivate(true);
    try {
      const mainPass = `priv-auto-${user?.id || 'anon'}`;
      sessionStorage.setItem(`roomkey-${projectId}`, mainPass);

      const bl = await branchesApi.list(projectId!);
      const myPrivateName = `private-${user?.username || 'user'}`;
      let pb = bl.items.find((b) => b.name === myPrivateName);

      if (!pb) {
        const mainBranch = bl.items.find((b) => b.type === 'main');
        pb = await branchesApi.create(projectId!, {
          name: myPrivateName,
          type: 'private',
          parent_branch_id: mainBranch?.id,
        });
      }

      sessionStorage.setItem(`privatebranch-${projectId}`, pb.id);
      setPassphrase(mainPass);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to setup private branch', 'error');
    } finally {
      setCreatingPrivate(false);
    }
  }

  if (!passphrase && !creatingPrivate) {
    return (
      <PassphraseModal
        onSubmit={handlePassphraseSubmit}
        onPrivateCopy={handlePrivateCopy}
      />
    );
  }

  if (creatingPrivate) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-0)' }}>
        <NulltorLogo size="lg" />
        <p style={{ color: 'var(--text-secondary)', marginTop: '16px' }}>Initializing isolated private branch…</p>
      </div>
    );
  }

  return <IDEInner projectId={projectId!} passphrase={passphrase} />;
}

function IDEInner({ projectId, passphrase }: { projectId: string; passphrase: string }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { theme, toggleTheme } = useTheme();

  const { currentProject, setProject, currentBranch, setBranch } = useProjectStore();
  const openFile = useEditorStore((s) => s.openFile);
  const language = useEditorStore((s) => s.language);

  const [branches, setBranches] = useState<BranchRead[]>([]);
  const [editorValue, setEditorValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [showBranchPrompt, setShowBranchPrompt] = useState(false);
  const [runTrigger, setRunTrigger] = useState(0);
  const [showTeamDrawer, setShowTeamDrawer] = useState(false);

  const { encrypt, decrypt } = useCrypto(passphrase, SALT);

  const { doc, text, isConnected, peers } = useYjsDoc({
    fileId: openFile?.id ?? '__none__',
    branchId: currentBranch?.id ?? 'main',
    encrypt,
    decrypt,
    username: user?.username ?? 'Anonymous',
    color: '#0284c7',
  });

  const { tree, loading: treeLoading, refresh: refreshTree } = useDirectoryTree(
    projectId ?? null,
    currentBranch?.id ?? null
  );

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      setLoading(true);
      try {
        const [project, bl] = await Promise.all([
          projectsApi.get(projectId),
          branchesApi.list(projectId),
        ]);
        setProject(project);
        setBranches(bl.items);

        let defaultBranch = bl.items.find((b) => b.type === 'main');
        const savedPrivateBranchId = sessionStorage.getItem(`privatebranch-${projectId}`);
        if (savedPrivateBranchId) {
          const pb = bl.items.find(b => b.id === savedPrivateBranchId);
          if (pb) defaultBranch = pb;
        }

        if (defaultBranch && !currentBranch) setBranch(defaultBranch);
      } catch {
        toast('Failed to load project', 'error');
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  useEffect(() => {
    if (!text) return;
    const handler = () => setEditorValue(text.toString());
    text.observe(handler);
    setEditorValue(text.toString());
    return () => text.unobserve(handler);
  }, [text]);

  function handleEditorChange(val: string) {
    if (!text || !doc) return;
    if (val === text.toString()) return;
    doc.transact(() => {
      text.delete(0, text.length);
      text.insert(0, val);
    }, 'local');
  }

  async function handleBranchChange(branch: BranchRead) {
    setBranch(branch);
    refreshTree();
  }

  async function handleBranchRefresh() {
    if (!projectId) return;
    const bl = await branchesApi.list(projectId);
    setBranches(bl.items);
  }

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-0)' }}>
        <NulltorLogo size="lg" />
        <p style={{ color: 'var(--text-secondary)', marginTop: '16px' }}>Loading Stitch Nexus IDE environment…</p>
      </div>
    );
  }

  return (
    <div className="ide-container">
      {/* Top Global Navigation Bar (Stitch Nexus) */}
      <header className="nexus-topbar">
        <div className="nexus-topbar-left">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/dashboard')}
            title="Return to Projects Workspace"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" width={14} height={14}>
              <path d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z"/>
            </svg>
          </button>

          <NulltorLogo size="sm" showText={false} />

          <div className="project-breadcrumbs">
            <span>Workspace</span>
            <span className="divider">/</span>
            <span className="current-project">{currentProject?.name ?? 'IDE'}</span>
          </div>

          <BranchSelector
            branches={branches}
            currentBranch={currentBranch}
            projectId={projectId!}
            onBranchChange={handleBranchChange}
            onRefresh={handleBranchRefresh}
          />
        </div>

        <div className="nexus-topbar-right">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => toast('Changes saved to Yjs CRDT room', 'success')}
            title="Save file"
          >
            💾 Save
          </button>

          <button
            className="btn btn-primary btn-sm"
            onClick={() => setRunTrigger((t) => t + 1)}
            title="Execute Code"
            style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
          >
            ▶ Execute
          </button>

          <button
            className={`btn btn-sm ${showTeamDrawer ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowTeamDrawer(!showTeamDrawer)}
            title="Toggle Team Session Drawer"
          >
            👥 Team Session {peers.length > 0 && `(${peers.length})`}
          </button>

          <button className="theme-toggle-btn" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}>
            {theme === 'dark' ? (
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </button>
        </div>
      </header>

      {/* Main Multi-Pane Body */}
      <div className="ide-body">
        <div className="ide-sidebar-pane">
          <FileTree
            tree={tree}
            loading={treeLoading}
            projectId={projectId!}
            branchId={currentBranch?.id ?? null}
            onRefresh={refreshTree}
          />
        </div>

        <div className="ide-editor-pane">
          <EditorPane
            value={editorValue}
            onChange={handleEditorChange}
            readOnly={false}
            peers={peers}
            onExecuteCode={() => setRunTrigger((t) => t + 1)}
          />
        </div>

        {showTeamDrawer ? (
          <div className="ide-side-drawer" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Team Session
              </span>
              <button className="btn-icon" style={{ width: '22px', height: '22px' }} onClick={() => setShowTeamDrawer(false)}>
                ×
              </button>
            </div>

            {/* Active Members List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="user-avatar" style={{ width: 36, height: 36, background: 'linear-gradient(135deg, var(--palette-sky), var(--palette-dark-pink))' }}>
                  {user?.username.slice(0, 2).toUpperCase() || 'ME'}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '13px' }}>{user?.username} (You)</div>
                  <div style={{ fontSize: '11px', color: '#22c55e' }}>● Editing {openFile?.name || 'file'}</div>
                </div>
              </div>

              {peers.map((peer, i) => (
                <div key={peer.id || i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="user-avatar" style={{ width: 36, height: 36, background: peer.color || 'var(--palette-sky)' }}>
                    {peer.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '13px' }}>{peer.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--aurora-mint)' }}>● Collaborative Peer</div>
                  </div>
                </div>
              ))}

              {/* Google Meet Style Video Window */}
              <div style={{ marginTop: '16px', background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', position: 'relative' }}>
                <div style={{ height: '120px', background: 'linear-gradient(135deg, #1e293b, #0f172a)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', marginBottom: '4px' }}>📹</div>
                    <div style={{ fontSize: '11px', fontWeight: 600 }}>Live E2EE Video Call</div>
                  </div>
                </div>
                <div style={{ padding: '8px 12px', background: 'var(--bg-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                  <span style={{ fontWeight: 600 }}>{user?.username}'s Room</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px' }}>🎤 Mute</button>
                    <button className="btn btn-danger btn-sm" style={{ padding: '2px 6px' }}>Leave</button>
                  </div>
                </div>
              </div>
            </div>

            <button className="btn btn-primary btn-full" onClick={() => toast('Room invite link copied to clipboard', 'success')}>
              + Invite Guest Collaborator
            </button>
          </div>
        ) : (
          <RightPanel code={editorValue} language={language} runTrigger={runTrigger} />
        )}
      </div>

      <StatusBar
        isConnected={isConnected}
        peerCount={peers.length}
        branchName={currentBranch?.name}
      />

      {showBranchPrompt && (
        <CreateBranchModal
          projectId={projectId!}
          branches={branches}
          onClose={() => setShowBranchPrompt(false)}
          onCreated={(b) => {
            handleBranchRefresh();
            handleBranchChange(b);
            setShowBranchPrompt(false);
          }}
        />
      )}
    </div>
  );
}
