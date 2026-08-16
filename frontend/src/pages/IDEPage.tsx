import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectsApi } from '../api/projects';
import { branchesApi, type BranchRead } from '../api/branches';
import { mergesApi } from '../api/merges';
import { commitsApi } from '../api/commits';
import { useProjectStore } from '../store/projectStore';
import { useEditorStore } from '../store/editorStore';
import { useAuthStore } from '../store/authStore';
import { useDirectoryTree } from '../hooks/useDirectoryTree';
import { directoriesApi, type DirectoryNode } from '../api/directories';
import { useYjsDoc } from '../hooks/useYjsDoc';
import { useCrypto } from '../hooks/useCrypto';
import { FileTree } from '../components/ide/FileTree';
import { EditorPane } from '../components/ide/EditorPane';
import { AgentPanel } from '../components/ide/AgentPanel';
import { BranchSelector, CreateBranchModal } from '../components/ide/BranchSelector';
import { MergeRequestModal } from '../components/ide/MergeRequestModal';
import * as Y from 'yjs';
import { MergeReviewPanel } from '../components/ide/MergeReviewPanel';
import { PullSyncModal } from '../components/ide/PullSyncModal';
import { extractTextFromYjsSnapshot } from '../components/ide/DiffViewerModal';
import { TimelinePanel } from '../components/ide/TimelinePanel';
import { StatusBar } from '../components/ide/StatusBar';
import { ActivityBar, type ActivityTab } from '../components/ide/ActivityBar';
import { SearchPanel } from '../components/ide/SearchPanel';
import { NulltorLogo } from '../components/shared/NulltorLogo';
import { useTheme } from '../context/ThemeContext';
import { toast } from '../components/shared/Toast';
import { Rocket, GitMerge, Video, Users, Save, Bot, Mic, Lock, GitBranch, ListChecks, RefreshCw, ArrowDownCircle, Play } from 'lucide-react';

const SALT = 'nulltor-static-salt-v1';


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
  { text: 'CRDT Deltas', left: '32%', delay: '-0.5s' },
  { text: 'Audit Telemetry', left: '44%', delay: '-4.5s' },
  { text: 'Nulltor Engine', left: '55%', delay: '-8.5s' },
  { text: 'System Governance', left: '68%', delay: '-2.5s' },
  { text: 'Multi-User Sync', left: '78%', delay: '-7.5s' },
  { text: 'AES-256 GCM', left: '88%', delay: '-5.2s' },
  { text: 'Passphrase Vault', left: '6%', delay: '-7.8s' },
  { text: 'Nulltor IDE', left: '48%', delay: '-1.8s' },
];

function PassphraseModal({
  onSubmit,
}: {
  onSubmit: (key: string, isPrivate: boolean) => void;
}) {
  const [key, setKey] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
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
        <h1 className="login-title">Start Room & IDE Session</h1>
        <p className="login-sub">
          Enter the project room passphrase to initialize real-time zero-knowledge E2EE collaboration.
        </p>

        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (key.trim()) onSubmit(key.trim(), isPrivate);
          }}
        >
          <div className="form-field">
            <label htmlFor="passphrase-input" style={{ color: '#0d9488', fontWeight: 700 }}>
              Project Room Key
            </label>
            <input
              id="passphrase-input"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="e.g. room-passphrase-123"
              autoFocus
              required
            />
          </div>
          <div className="form-field" style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input 
              type="checkbox" 
              id="private-mode-check" 
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer', margin: 0 }}
            />
            <label htmlFor="private-mode-check" style={{ fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer', margin: 0 }}>
              Launch in Private Subroom (Isolate edits)
            </label>
          </div>
          <button type="submit" className="btn btn-primary btn-full" style={{ marginTop: '16px' }}>
            <Rocket size={14} /> Launch Project Session & IDE
          </button>
        </form>
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

  async function handlePassphraseSubmit(key: string, isPrivate: boolean) {
    if (isPrivate) {
      setCreatingPrivate(true);
      try {
        const bl = await branchesApi.list(projectId!);
        const myPrivateName = `subroom-priv-${user?.username || 'user'}`;
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
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Failed to setup private subroom', 'error');
        setCreatingPrivate(false);
        return;
      }
      setCreatingPrivate(false);
    } else {
      sessionStorage.removeItem(`privatebranch-${projectId}`);
    }

    sessionStorage.setItem(`roomkey-${projectId}`, key);
    setPassphrase(key);
  }

  if (!passphrase && !creatingPrivate) {
    return (
      <PassphraseModal
        onSubmit={handlePassphraseSubmit}
      />
    );
  }

  if (creatingPrivate) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-0)' }}>
        <NulltorLogo size="lg" />
        <p style={{ color: 'var(--text-secondary)', marginTop: '16px' }}>Launching isolated private subroom IDE session…</p>
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
  const [showAgentPanel, setShowAgentPanel] = useState(true);
  const [activeTab, setActiveTab] = useState<ActivityTab>('explorer');
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showMergeReview, setShowMergeReview] = useState(false);
  const [showPullSyncModal, setShowPullSyncModal] = useState(false);
  const [pendingMergeCount, setPendingMergeCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionPrivateBranch, setSessionPrivateBranch] = useState(sessionStorage.getItem(`privatebranch-${projectId}`));

  const isReadOnly = Boolean(sessionPrivateBranch) && currentBranch?.id !== sessionPrivateBranch;
  const isSharedModeActive = !sessionPrivateBranch && currentBranch?.type === 'main';

  const isOnNonMainBranch = currentBranch?.type !== 'main';
  const canReview = true; // GitHub model: all project members can view and review merge requests

  const { encrypt, decrypt } = useCrypto(passphrase, SALT);

  const { doc, text, isConnected, peers, cursors, emitCursor } = useYjsDoc({
    fileId: openFile?.id ?? '__none__',
    branchId: currentBranch?.id ?? 'main',
    encrypt,
    decrypt,
    username: user?.username ?? 'Anonymous',
    color: '#01EFAC',
  });

  const { tree, loading: treeLoading, refresh: refreshTree } = useDirectoryTree(
    projectId ?? null,
    currentBranch?.id ?? null
  );

  async function handlePullSyncComplete(newSnapshotBase64?: string | null) {
    if (newSnapshotBase64 && doc) {
      try {
        const decrypted = decrypt(newSnapshotBase64);
        const newCode = extractTextFromYjsSnapshot(decrypted);
        if (newCode) {
          const ytext = doc.getText('content').length > 0 ? doc.getText('content') : doc.getText('monaco');
          doc.transact(() => {
            ytext.delete(0, ytext.length);
            ytext.insert(0, newCode);
          });
          setEditorValue(newCode);
        }
      } catch (e) {
        console.error('Failed to apply synced snapshot', e);
      }
    }
    await refreshTree();
    await handleBranchRefresh();
  }

  async function handleCommitRequest() {
    if (!openFile || !currentBranch || !doc) return;
    const msg = window.prompt("Enter commit message for this revision:");
    if (!msg) return;

    try {
      const update = Y.encodeStateAsUpdate(doc);
      const b64 = btoa(String.fromCharCode(...update));
      const encryptedSnapshot = encrypt(b64);

      await commitsApi.createCommit(projectId!, {
        branch_id: currentBranch.id,
        file_id: openFile.id,
        message: msg,
        snapshot: encryptedSnapshot
      });
      toast("Committed revision successfully", "success");
      if (activeTab !== 'git') {
        setActiveTab('git');
      }
    } catch (e: any) {
      console.error(e);
      toast(e?.message || "Failed to commit revision", "error");
    }
  }

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
          setSessionPrivateBranch(savedPrivateBranchId);
        }

        if (defaultBranch && !currentBranch) setBranch(defaultBranch);
      } catch {
        toast('Failed to load project room', 'error');
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  const pendingAgentCodeRef = useRef<{ fileId: string; code: string } | null>(null);

  useEffect(() => {
    if (!text || !doc) return;

    if (pendingAgentCodeRef.current && openFile && pendingAgentCodeRef.current.fileId === openFile.id) {
      const codeToWrite = pendingAgentCodeRef.current.code;
      pendingAgentCodeRef.current = null;
      doc.transact(() => {
        text.delete(0, text.length);
        text.insert(0, codeToWrite);
      }, 'local');
      setEditorValue(codeToWrite);
    } else {
      setEditorValue(text.toString());
    }

    const handler = () => setEditorValue(text.toString());
    text.observe(handler);
    return () => text.unobserve(handler);
  }, [text, doc, openFile]);

  function handleEditorChange(val: string) {
    if (!text || !doc) return;
    if (val === text.toString()) return;
    doc.transact(() => {
      text.delete(0, text.length);
      text.insert(0, val);
    }, 'local');
  }

  async function handleApplyAgentCode(fileName: string, code: string) {
    if (!projectId) return;

    // 1. If the target file is already open, directly update its buffer
    if (openFile && openFile.name === fileName) {
      if (text && doc) {
        doc.transact(() => {
          text.delete(0, text.length);
          text.insert(0, code);
        }, 'local');
      }
      setEditorValue(code);
      toast(`Updated ${fileName}`, 'success');
      return;
    }

    // 2. Otherwise find or create the target file in the tree
    const findNode = (nodes: DirectoryNode[]): DirectoryNode | null => {
      for (const n of nodes) {
        if (n.name === fileName && n.type === 'file') return n;
        if (n.children && n.children.length > 0) {
          const res = findNode(n.children);
          if (res) return res;
        }
      }
      return null;
    };

    let updatedTree = await refreshTree();
    let targetNode = findNode(updatedTree || tree);

    if (!targetNode) {
      try {
        targetNode = await directoriesApi.create(projectId, {
          name: fileName,
          type: 'file'
        }, currentBranch?.id);
        await refreshTree();
      } catch (err) {
        console.error("Failed to auto-create file:", err);
      }
    }

    if (targetNode) {
      pendingAgentCodeRef.current = { fileId: targetNode.id, code };

      const editorStore = useEditorStore.getState();
      editorStore.setFile(targetNode);
      editorStore.openTab(targetNode);

      if (fileName.endsWith('.py')) editorStore.setLanguage('python');
      else if (fileName.endsWith('.js') || fileName.endsWith('.jsx')) editorStore.setLanguage('javascript');
      else if (fileName.endsWith('.ts') || fileName.endsWith('.tsx')) editorStore.setLanguage('typescript');
      else if (fileName.endsWith('.html')) editorStore.setLanguage('html');
      else if (fileName.endsWith('.css')) editorStore.setLanguage('css');
      else editorStore.setLanguage('plaintext');

      setEditorValue(code);
      toast(`Created and opened ${fileName}`, 'success');
    }
  }

  async function handleBranchChange(branch: BranchRead) {
    setBranch(branch);
    if (branch.type === 'private' || branch.type === 'subroom') {
      sessionStorage.setItem(`privatebranch-${projectId}`, branch.id);
      setSessionPrivateBranch(branch.id);
    } else {
      sessionStorage.removeItem(`privatebranch-${projectId}`);
      setSessionPrivateBranch(null);
    }
    useEditorStore.getState().setFile(null); // Clear open file so it doesn't query a mismatched ID
    toast(`Switched to ${branch.type.toUpperCase()} room: ${branch.name}`, 'info');
    refreshTree();
  }

  async function handleBranchRefresh() {
    if (!projectId) return;
    const bl = await branchesApi.list(projectId);
    setBranches(bl.items);
  }

  function handleJoinSharedRoom() {
    sessionStorage.removeItem(`privatebranch-${projectId}`);
    setSessionPrivateBranch(null);
    const mainB = branches.find(b => b.type === 'main');
    if (mainB) {
      setBranch(mainB);
      useEditorStore.getState().setFile(null); // Clear mismatched file ID
      toast('Switched to shared main room with write access.', 'success');
      refreshTree();
    }
  }

  // Load pending merge count for admin badge
  useEffect(() => {
    if (!projectId || !canReview) return;
    mergesApi.list(projectId, 'pending').then((data) => setPendingMergeCount(data.length)).catch(() => {});
  }, [projectId, canReview]);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-0)' }}>
        <NulltorLogo size="lg" />
        <p style={{ color: 'var(--text-secondary)', marginTop: '16px' }}>Initializing Nulltor Room Session & IDE…</p>
      </div>
    );
  }

  return (
    <div className="ide-container">
      {/* Top Global Project Session & Room Header */}
      <header className="nexus-topbar">
        <div className="nexus-topbar-left">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/dashboard')}
            title="Menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>

          <NulltorLogo size="sm" showText={false} />
        </div>

        <div className="nexus-topbar-center">
          <div className="nexus-topbar-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width={14} height={14}>
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" placeholder={currentProject?.name ?? 'Search Project'} />
          </div>
        </div>

        <div className="nexus-topbar-right">
          {/* Integrated Subroom Selector & Creator */}
          <BranchSelector
            branches={branches}
            currentBranch={currentBranch}
            projectId={projectId!}
            onBranchChange={handleBranchChange}
            onRefresh={handleBranchRefresh}
          />
          {/* Sleek Live Collaborator Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '4px', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-2)', padding: '4px 8px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 6px #3b82f6' }}></span>
            LIVE ({peers.length + 1})
          </div>

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => toast('Saved state encrypted locally', 'success')}
            title="Save file state"
            style={{ padding: '4px 8px' }}
          >
            <Save size={16} />
          </button>

          {/* Solid Sapphire Blue Run Button */}
          <button
            className="btn btn-sm"
            onClick={() => setRunTrigger((t) => t + 1)}
            disabled={isRunning}
            title={isRunning ? 'Executing code in sandbox...' : 'Execute Code (Run)'}
            style={{
              padding: '4px 14px',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 700,
              fontSize: '12px',
              border: '1px solid #1d4ed8',
              background: isRunning ? 'rgba(37, 99, 235, 0.6)' : '#2563eb',
              borderRadius: '6px',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.35)',
              cursor: isRunning ? 'wait' : 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {isRunning ? (
              <>
                <RefreshCw size={13} className="spin" />
                <span>Running...</span>
              </>
            ) : (
              <>
                <Play size={13} fill="currentColor" />
                <span>Run</span>
              </>
            )}
          </button>

          <button
            className={`btn btn-sm ${showTeamDrawer ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => {
              setShowTeamDrawer(!showTeamDrawer);
              if (!showTeamDrawer) setShowAgentPanel(false);
            }}
            title="Toggle Team & Subrooms"
            style={{ padding: '4px 8px', borderRadius: '6px' }}
          >
            <Users size={16} />
          </button>

          <button
            className={`btn btn-sm ${showAgentPanel ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => {
              setShowAgentPanel(!showAgentPanel);
              if (!showAgentPanel) setShowTeamDrawer(false);
            }}
            title={showAgentPanel ? "Hide Agent Assistant" : "Open Agent Assistant"}
            style={{
              padding: '4px 8px',
              background: showAgentPanel ? 'rgba(37, 99, 235, 0.15)' : undefined,
              color: showAgentPanel ? '#3b82f6' : undefined,
              border: showAgentPanel ? '1px solid rgba(37, 99, 235, 0.4)' : undefined,
              borderRadius: '6px',
            }}
          >
            <Bot size={16} />
          </button>

          {/* Pull / Sync Button — Sapphire Blue Accents */}
          <button
            className="btn btn-sm"
            style={{
              padding: '4px 10px',
              background: 'rgba(37, 99, 235, 0.12)',
              border: '1px solid rgba(37, 99, 235, 0.35)',
              color: '#60a5fa',
              fontWeight: 700,
              fontSize: '11.5px',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              borderRadius: '6px',
              transition: 'all 0.15s ease',
            }}
            title={`Pull / Sync updates from another branch into ${currentBranch?.name ?? 'current branch'}`}
            onClick={() => setShowPullSyncModal(true)}
          >
            <ArrowDownCircle size={14} /> Pull / Sync
          </button>

          {/* Submit PR / Merge Modal — Sapphire Blue Accents */}
          <button
            className="btn btn-sm"
            style={{
              padding: '4px 10px',
              background: 'rgba(37, 99, 235, 0.12)',
              border: '1px solid rgba(37, 99, 235, 0.35)',
              color: '#60a5fa',
              fontWeight: 700,
              fontSize: '11.5px',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              borderRadius: '6px',
              transition: 'all 0.15s ease',
            }}
            title="Submit Merge / Pull Request"
            onClick={() => setShowMergeModal(true)}
          >
            <GitMerge size={14} /> Merge / PR
          </button>

          {/* Review button — visible to admins/leads with pending count badge */}
          {canReview && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: '4px 8px', position: 'relative' }}
              title="Review Merge Requests"
              onClick={() => { setShowMergeReview(true); setPendingMergeCount(0); }}
            >
              <ListChecks size={16} />
              {pendingMergeCount > 0 && (
                <span style={{ position: 'absolute', top: 0, right: 0, width: 14, height: 14, background: '#fbbf24', borderRadius: '50%', fontSize: 9, fontWeight: 800, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {pendingMergeCount}
                </span>
              )}
            </button>
          )}

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
        <ActivityBar 
          activeTab={activeTab} 
          onChangeTab={(tab) => {
            if (tab === 'agent') {
              setShowAgentPanel((prev) => !prev);
              setShowTeamDrawer(false);
            } else {
              setActiveTab(tab);
            }
          }} 
          onProfileClick={() => navigate('/profile')}
          onSettingsClick={() => navigate('/settings')}
        />
        <div className="ide-sidebar-pane">
          {activeTab === 'explorer' && (
            <FileTree
              tree={tree}
              loading={treeLoading}
              projectId={projectId!}
              branchId={currentBranch?.id ?? null}
              onRefresh={refreshTree}
            />
          )}
          {activeTab === 'search' && (
            <SearchPanel 
              tree={tree}
              onOpenFile={(file) => {
                const e = useEditorStore.getState();
                e.setFile(file);
                // Simple language mapping
                if (file.name.endsWith('.ts') || file.name.endsWith('.tsx')) e.setLanguage('typescript');
                else if (file.name.endsWith('.js') || file.name.endsWith('.jsx')) e.setLanguage('javascript');
                else if (file.name.endsWith('.py')) e.setLanguage('python');
                else if (file.name.endsWith('.html')) e.setLanguage('html');
                else if (file.name.endsWith('.css')) e.setLanguage('css');
                else e.setLanguage('plaintext');
              }}
            />
          )}
          {activeTab === 'git' && openFile && currentBranch && (
            <TimelinePanel
              projectId={projectId}
              branchId={currentBranch.id}
              fileId={openFile.id}
              fileName={openFile.name}
              passphrase={passphrase}
              getCurrentSnapshot={() => {
                if (!doc) return null;
                try {
                  const update = Y.encodeStateAsUpdate(doc);
                  const b64 = btoa(String.fromCharCode(...update));
                  return encrypt(b64);
                } catch { return null; }
              }}
              onRestore={(snapshotBase64) => {
                if (!doc || !text) return;
                try {
                  const uint8Array = new Uint8Array(atob(snapshotBase64).split('').map(c => c.charCodeAt(0)));
                  const tempDoc = new Y.Doc();
                  Y.applyUpdate(tempDoc, uint8Array);
                  
                  let restoredText = '';
                  if (tempDoc.getText('content').length > 0) restoredText = tempDoc.getText('content').toString();
                  else if (tempDoc.getText('monaco').length > 0) restoredText = tempDoc.getText('monaco').toString();
                  
                  if (restoredText) {
                    text.delete(0, text.length);
                    text.insert(0, restoredText);
                    setEditorValue(restoredText);
                  }
                } catch (e) {
                  console.error("Failed to apply snapshot to Yjs doc", e);
                  alert("Failed to restore snapshot.");
                }
              }}
              onClose={() => setActiveTab('explorer')}
            />
          )}
          {activeTab === 'agent' && (
            <AgentPanel
              projectId={projectId}
              branchId={currentBranch?.id}
              currentCode={editorValue}
              onApplyCode={handleApplyAgentCode}
            />
          )}
          {activeTab !== 'explorer' && activeTab !== 'search' && activeTab !== 'git' && activeTab !== 'agent' && (
            <div style={{ padding: '16px', color: 'var(--text-secondary)' }}>
              {activeTab} panel coming soon.
            </div>
          )}
        </div>

        <div className="ide-editor-pane">
          <EditorPane
            value={editorValue}
            onChange={handleEditorChange}
            readOnly={isReadOnly}
            isSharedModeActive={isSharedModeActive}
            onBranchPrompt={() => setShowBranchPrompt(true)}
            onJoinSharedRoom={handleJoinSharedRoom}
            peers={peers}
            cursors={cursors}
            onCursorChange={emitCursor}
            runTrigger={runTrigger}
            onRunStateChange={setIsRunning}
            onCommitRequest={handleCommitRequest}
            projectId={projectId}
            branchId={currentBranch?.id}
            fileId={openFile?.id}
            getDoc={() => doc}
            decrypt={decrypt}
          />
        </div>


        {showTeamDrawer ? (
          <div className="ide-side-drawer" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Room & Subrooms Overview
              </span>
              <button className="btn-icon" style={{ width: '22px', height: '22px' }} onClick={() => setShowTeamDrawer(false)}>
                ×
              </button>
            </div>

            {/* Subrooms List in Room Drawer */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#0d9488', textTransform: 'uppercase', marginBottom: '8px' }}>
                <GitMerge size={14} /> Active Subroom Workspaces ({branches.length})
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {branches.map((b) => {
                  const isCurrent = b.id === currentBranch?.id;
                  return (
                    <div
                      key={b.id}
                      onClick={() => handleBranchChange(b)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-xs)',
                        background: isCurrent ? 'rgba(1, 239, 172, 0.12)' : 'var(--bg-2)',
                        border: isCurrent ? '1px solid var(--aurora-mint)' : '1px solid var(--border)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{b.type === 'main' ? <GitBranch size={14} /> : b.type === 'subroom' ? <GitMerge size={14} /> : <Lock size={14} />}</span>
                        <span style={{ fontSize: '12.5px', fontWeight: isCurrent ? 700 : 500, color: isCurrent ? 'var(--aurora-mint)' : 'var(--text-primary)' }}>
                          {b.name}
                        </span>
                      </div>
                      {isCurrent && <span style={{ fontSize: '10px', color: 'var(--aurora-mint)', fontWeight: 700 }}>ACTIVE</span>}
                    </div>
                  );
                })}
              </div>

              <button
                className="btn btn-sm"
                onClick={() => setShowBranchPrompt(true)}
                style={{
                  width: '100%',
                  marginTop: '10px',
                  background: 'rgba(13, 148, 136, 0.15)',
                  border: '1px solid #0d9488',
                  color: '#14b8a6',
                  fontWeight: 700,
                  fontSize: '12px',
                }}
              >
                + Create New Subroom
              </button>
            </div>

            {/* Active Members List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, marginTop: '8px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                <Users size={14} /> Active Collaborators ({peers.length + 1})
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="user-avatar" style={{ width: 36, height: 36, background: 'var(--accent-primary)', color: '#fff' }}>
                  {user?.username.slice(0, 2).toUpperCase() || 'ME'}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '13px' }}>{user?.username} (Room Host)</div>
                  <div style={{ fontSize: '11px', color: '#22c55e' }}>● Active in {currentBranch?.name || 'main'}</div>
                </div>
              </div>

              {peers.map((peer, i) => (
                <div key={peer.id || i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="user-avatar" style={{ width: 36, height: 36, background: peer.color || 'var(--aurora-teal)' }}>
                    {peer.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '13px' }}>{peer.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--aurora-mint)' }}>● Connected Peer</div>
                  </div>
                </div>
              ))}

              {/* Google Meet Style Video Window */}
              <div style={{ marginTop: '12px', background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <div style={{ height: '110px', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '22px', marginBottom: '2px' }}><Video size={14} /></div>
                    <div style={{ fontSize: '11px', fontWeight: 600 }}>Live E2EE Video Call</div>
                  </div>
                </div>
                <div style={{ padding: '8px 12px', background: 'var(--bg-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                  <span style={{ fontWeight: 600 }}>{user?.username}'s Room</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px' }}><Mic size={14} /> Mute</button>
                    <button className="btn btn-danger btn-sm" style={{ padding: '2px 6px' }}>Leave</button>
                  </div>
                </div>
              </div>
            </div>

            <button className="btn btn-primary btn-full" onClick={() => toast('Room session invite link copied', 'success')}>
              + Invite Peer to Subroom
            </button>
          </div>
        ) : showAgentPanel ? (
          <div className="ide-side-drawer" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <AgentPanel
              projectId={projectId}
              branchId={currentBranch?.id}
              currentCode={editorValue}
              onApplyCode={handleApplyAgentCode}
              onClose={() => setShowAgentPanel(false)}
            />
          </div>
        ) : null}
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

      {showMergeModal && currentBranch && (
        <MergeRequestModal
          projectId={projectId!}
          sourceBranch={currentBranch}
          branches={branches}
          currentFileId={openFile?.id ?? null}
          currentFileName={openFile?.name ?? null}
          decryptSnapshot={(snap) => snap ? decrypt(snap) : null}
          getCurrentSnapshot={() => {
            if (!doc) return null;
            try {
              const update = Y.encodeStateAsUpdate(doc);
              const b64 = btoa(String.fromCharCode(...update));
              return encrypt(b64);
            } catch { return null; }
          }}
          onClose={() => setShowMergeModal(false)}
          onCreated={() => setShowMergeModal(false)}
        />
      )}

      {showPullSyncModal && currentBranch && (
        <PullSyncModal
          projectId={projectId!}
          currentBranch={currentBranch}
          branches={branches}
          currentFileId={openFile?.id ?? null}
          currentFileName={openFile?.name ?? null}
          getCurrentSnapshot={() => {
            if (!doc) return null;
            try {
              const update = Y.encodeStateAsUpdate(doc);
              const b64 = btoa(String.fromCharCode(...update));
              return encrypt(b64);
            } catch { return null; }
          }}
          decryptSnapshot={(snap) => snap ? decrypt(snap) : null}
          onClose={() => setShowPullSyncModal(false)}
          onSyncComplete={handlePullSyncComplete}
        />
      )}

      {showMergeReview && (
        <MergeReviewPanel
          projectId={projectId!}
          branches={branches}
          canReview={canReview}
          passphrase={passphrase}
          onClose={() => setShowMergeReview(false)}
          onMerged={async () => {
            await refreshTree();
            await handleBranchRefresh();
          }}
        />
      )}
    </div>
  );
}
