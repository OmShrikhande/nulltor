import { useEffect, useState, useRef } from 'react';
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
import { toast } from '../components/shared/Toast';

const SALT = 'nulltor-static-salt-v1';

// ─── Combined Right Panel (Run + AI Agent) ─────────────────────────────────
function RightPanel({ code, language, runTrigger }: { code: string; language: string; runTrigger: number }) {
  const [activeTab, setActiveTab] = useState<'run' | 'agent'>('run');

  // Switch to run tab when triggered
  useEffect(() => {
    if (runTrigger > 0) setActiveTab('run');
  }, [runTrigger]);

  return (
    <div className="run-panel">
      {/* Tab bar */}
      <div className="run-panel-header">
        <div style={{ display: 'flex', gap: 2 }}>
          <button className={`run-tab ${activeTab === 'run' ? 'active' : ''}`} onClick={() => setActiveTab('run')}>
            ▶ Run
          </button>
          <button className={`run-tab ${activeTab === 'agent' ? 'active' : ''}`} onClick={() => setActiveTab('agent')}>
            🤖 AI Agent
          </button>
        </div>
      </div>
      {activeTab === 'run' && <RunPanel code={code} language={language} runTrigger={runTrigger} />}
      {activeTab === 'agent' && <AgentPanel embedded />}
    </div>
  );
}

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
      <div className="login-glow" />
      <div className="login-card" style={{ zIndex: 10, maxWidth: 440 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 26, color: 'var(--accent)' }}>◈</span>
          <span style={{ fontSize: 18, fontWeight: 700 }}>nulltor</span>
        </div>
        <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Room Key Required</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
          This project is end-to-end encrypted. Enter the shared passphrase to collaborate in real-time, or open a <strong>private copy</strong> to work independently.
        </p>

        {/* Option A: Enter shared key */}
        <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 10, padding: 18, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>
            🔐 Join Shared Room
          </div>
          <div className="form-field" style={{ marginBottom: 12 }}>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Enter shared passphrase…"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && key.trim() && onSubmit(key.trim())}
            />
          </div>
          <button
            className="btn btn-primary btn-full"
            disabled={!key.trim()}
            onClick={() => onSubmit(key.trim())}
          >
            Decrypt &amp; Enter Shared Room
          </button>
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* Option B: Private copy */}
        <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
            🔒 Open Private Copy
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
            Create your own encrypted private branch. Changes stay private — you can merge them later when you have the room key.
          </p>
          <button
            className="btn btn-ghost btn-full"
            style={{ justifyContent: 'center' }}
            onClick={onPrivateCopy}
          >
            Open Private Copy
          </button>
        </div>
      </div>
    </div>
  );
}

export function IDEPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [passphrase, setPassphrase] = useState(
    sessionStorage.getItem(`roomkey-${projectId}`) || ''
  );
  const [creatingPrivate, setCreatingPrivate] = useState(false);

  async function handlePrivateCopy() {
    if (!projectId || !user) return;
    setCreatingPrivate(true);
    try {
      // Generate a random personal key for this private branch
      const privateKey = `private-${user.username}-${crypto.randomUUID().slice(0, 8)}`;
      const branchName = `private/${user.username}`;

      // Get existing branches to check if already has private
      const bl = await branchesApi.list(projectId);
      let privateBranch = bl.items.find(
        b => b.type === 'private' && b.created_by === user.id
      );

      if (!privateBranch) {
        privateBranch = await branchesApi.create(projectId, {
          name: branchName,
          type: 'private',
        });
      }

      // Store the private key and branch id in session
      sessionStorage.setItem(`roomkey-${projectId}`, privateKey);
      sessionStorage.setItem(`privatebranch-${projectId}`, privateBranch.id);
      setPassphrase(privateKey);
      toast('Opened private copy — your changes are encrypted locally.', 'success');
    } catch (e: any) {
      toast(e.message || 'Failed to create private branch', 'error');
    } finally {
      setCreatingPrivate(false);
    }
  }

  if (!passphrase) {
    return (
      <PassphraseModal
        onSubmit={(key) => {
          sessionStorage.setItem(`roomkey-${projectId}`, key);
          setPassphrase(key);
        }}
        onPrivateCopy={handlePrivateCopy}
      />
    );
  }

  if (creatingPrivate) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-0)', flexDirection: 'column', gap: 16 }}>
        <div className="loading-spinner" style={{ width: 32, height: 32 }} />
        <p style={{ color: 'var(--text-secondary)' }}>Creating private branch…</p>
      </div>
    );
  }

  return <IDEInner projectId={projectId!} passphrase={passphrase} />;
}

function IDEInner({ projectId, passphrase }: { projectId: string; passphrase: string }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const { currentProject, setProject, currentBranch, setBranch } = useProjectStore();
  const openFile = useEditorStore((s) => s.openFile);
  const language = useEditorStore((s) => s.language);

  const [branches, setBranches] = useState<BranchRead[]>([]);
  const [editorValue, setEditorValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [showBranchPrompt, setShowBranchPrompt] = useState(false);
  const [runTrigger, setRunTrigger] = useState(0);

  const { encrypt, decrypt } = useCrypto(passphrase, SALT);

  const { doc, text, isConnected, peers } = useYjsDoc({
    fileId: openFile?.id ?? '__none__',
    branchId: currentBranch?.id ?? 'main',
    encrypt,
    decrypt,
    username: user?.username ?? 'Anonymous',
    color: '#6366f1',
  });

  const { tree, loading: treeLoading, refresh: refreshTree } = useDirectoryTree(
    projectId ?? null,
    currentBranch?.id ?? null
  );

  // Load project + branches
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

        // Default to main branch, or a saved private branch if present
        let defaultBranch = bl.items.find((b) => b.type === 'main');
        const savedPrivateBranchId = sessionStorage.getItem(`privatebranch-${projectId}`);
        if (savedPrivateBranchId) {
          const pb = bl.items.find(b => b.id === savedPrivateBranchId);
          if (pb) defaultBranch = pb;
        }
        
        if (defaultBranch && !currentBranch) setBranch(defaultBranch);
      } catch (e) {
        toast('Failed to load project', 'error');
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]); // eslint-disable-line

  // Sync Yjs Y.Text → editor value
  useEffect(() => {
    if (!text) return;
    const handler = () => setEditorValue(text.toString());
    text.observe(handler);
    setEditorValue(text.toString());
    return () => text.unobserve(handler);
  }, [text]);

  // Editor → Yjs Y.Text
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
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-0)' }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <div className="ide-shell">
      {/* Top bar */}
      <div className="topbar" style={{ background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/dashboard')}
            title="Back to projects"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" width={14} height={14}><path d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z"/></svg>
          </button>
          <span className="topbar-title">
            {currentProject?.name ?? 'IDE'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {peers.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>👥 {peers.length} peer{peers.length !== 1 ? 's' : ''}</span>
          )}
          <button
            className="btn btn-primary btn-sm"
            style={{ gap: 6, background: 'linear-gradient(135deg,#22c55e,#16a34a)', borderColor: '#16a34a' }}
            onClick={() => setRunTrigger(t => t + 1)}
            title="Run current file"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" width={12} height={12}><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm4.879-2.773 4.264 2.559a.25.25 0 0 1 0 .428l-4.264 2.559A.25.25 0 0 1 6 10.559V5.442a.25.25 0 0 1 .379-.215Z"/></svg>
            Run
          </button>
        </div>
      </div>

      {/* IDE body */}
      <div className="ide-body">
        {/* Left pane: file tree */}
        <div className="ide-file-tree">
          <BranchSelector
            branches={branches}
            currentBranch={currentBranch}
            projectId={projectId!}
            onBranchChange={handleBranchChange}
            onRefresh={handleBranchRefresh}
          />
          <FileTree
            tree={tree}
            loading={treeLoading}
            projectId={projectId!}
            branchId={currentBranch?.id ?? null}
            onRefresh={refreshTree}
          />
        </div>

        {/* Center pane: Monaco Editor */}
        <div className="ide-editor-pane">
          <EditorPane
            value={editorValue}
            onChange={handleEditorChange}
            readOnly={false}
          />
        </div>

        {/* Right pane: Run + Agent Panel */}
        <RightPanel code={editorValue} language={language} runTrigger={runTrigger} />
      </div>

      {/* Bottom status bar */}
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
