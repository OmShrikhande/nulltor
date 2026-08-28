import { useEffect, useState, useRef, useCallback } from 'react';
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
import { useYjsDoc, uint8ArrayToBase64, base64ToUint8Array } from '../hooks/useYjsDoc';
import { useWebRTC } from '../hooks/useWebRTC';
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
import { BotpressPanel } from '../components/ide/BotpressPanel';
import { NulltorLogo } from '../components/shared/NulltorLogo';
import { useTheme } from '../context/ThemeContext';
import { toast } from '../components/shared/Toast';
import { InviteSubroomModal } from '../components/ide/InviteSubroomModal';
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

function VideoPlayer({ stream, muted = false, autoPlay = true, controls = false, style }: { stream: MediaStream | null, muted?: boolean, autoPlay?: boolean, controls?: boolean, style?: React.CSSProperties }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      if (autoPlay) {
        videoRef.current.play().catch(e => console.log("Autoplay prevented:", e));
      }
    }
  }, [stream, autoPlay]);

  if (!stream) return null;

  return (
    <video
      ref={videoRef}
      autoPlay={autoPlay}
      muted={muted}
      controls={controls}
      playsInline
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        borderRadius: '4px',
        ...style
      }}
    />
  );
}

function PassphraseModal({
  onSubmit,
  projectId,
}: {
  onSubmit: (key: string, isPrivate: boolean) => void;
  projectId: string;
}) {
  const [key, setKey] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) return;
    setError(null);
    setIsVerifying(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/verify-passphrase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('nulltor_token')}`,
        },
        body: JSON.stringify({ passphrase: trimmed }),
      });
      if (res.status === 403) {
        setError('❌ Incorrect room passphrase. Access denied.');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || 'Verification failed. Please try again.');
        return;
      }
      const data = await res.json();
      if (data.status === 'set') {
        // This user just set the passphrase for the first time
      }
      onSubmit(trimmed, isPrivate);
    } catch (err) {
      setError('Network error. Could not verify passphrase. Is the server running?');
    } finally {
      setIsVerifying(false);
    }
  }

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

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="passphrase-input" style={{ color: '#0d9488', fontWeight: 700 }}>
              Project Room Key
            </label>
            <input
              id="passphrase-input"
              type="password"
              value={key}
              onChange={(e) => { setKey(e.target.value); setError(null); }}
              placeholder="Enter the room passphrase"
              autoFocus
              required
              disabled={isVerifying}
            />
          </div>

          {error && (
            <div style={{ marginTop: '10px', padding: '10px 12px', background: 'rgba(239,68,68,0.12)', border: '1px solid #ef4444', borderRadius: '8px', color: '#f87171', fontSize: '13px', fontWeight: 600 }}>
              {error}
            </div>
          )}

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
          <button type="submit" className="btn btn-primary btn-full" style={{ marginTop: '16px' }} disabled={isVerifying}>
            {isVerifying ? 'Verifying…' : <><Rocket size={14} /> Launch Project Session & IDE</>}
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
        projectId={projectId!}
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

  // Guard: if the stored branch belongs to a different project (stale Zustand state
  // from navigating between projects), clear it immediately so we don't send a
  // wrong branch_id to the API and get "Branch not found" errors.
  if (currentBranch && currentBranch.project_id !== projectId) {
    setBranch(null);
  }

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
  const [showInviteSubroom, setShowInviteSubroom] = useState(false);
  const [incomingInvite, setIncomingInvite] = useState<{
    branchId: string;
    branchName: string;
    inviterName: string;
    inviterUserId?: string;
    inviterId?: string;
  } | null>(null);
  const [pendingMergeCount, setPendingMergeCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionPrivateBranch, setSessionPrivateBranch] = useState(sessionStorage.getItem(`privatebranch-${projectId}`));

  const isReadOnly = Boolean(sessionPrivateBranch) && currentBranch?.id !== sessionPrivateBranch;
  const isSharedModeActive = !sessionPrivateBranch && currentBranch?.type === 'main';

  const isOnNonMainBranch = currentBranch?.type !== 'main';
  const canReview = true; // GitHub model: all project members can view and review merge requests

  const { encrypt, decrypt } = useCrypto(passphrase, SALT);

  const { doc, docRef, text, isConnected, peers, cursors, emitCursor, saveSnapshot, socket } = useYjsDoc({
    fileId: openFile?.id ?? '__none__',
    branchId: currentBranch?.id ?? 'main',
    encrypt,
    decrypt,
    username: user?.username ?? 'Anonymous',
    userId: user?.id,
    color: '#01EFAC',
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleManualSave = useCallback(() => {
    if (!openFile) {
      toast('No file open to save', 'info');
      return;
    }
    setIsSaving(true);
    const success = saveSnapshot();
    useEditorStore.getState().setDirty(false);
    setTimeout(() => {
      setIsSaving(false);
      if (success !== false) {
        toast(`✓ Saved ${openFile.name}`, 'success');
      } else {
        toast(`Failed to save ${openFile.name}`, 'error');
      }
    }, 250);
  }, [openFile, saveSnapshot]);

  // Global Keyboard Shortcut for Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleManualSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleManualSave]);

  // Listen for real-time subroom invitations from peers
  useEffect(() => {
    if (!socket) return;
    const handleInvite = (data: {
      projectId: string;
      branchId: string;
      branchName: string;
      inviterName: string;
      inviterUserId?: string;
      inviterId?: string;
    }) => {
      if (data.projectId === projectId) {
        setIncomingInvite(data);
        toast(`${data.inviterName} invited you to join subroom "${data.branchName}"!`, 'info');
      }
    };
    socket.on('subroom-invite-received', handleInvite);
    return () => {
      socket.off('subroom-invite-received', handleInvite);
    };
  }, [socket, projectId]);

  const { localStream, remoteStreams, isMuted, isVideoActive, startCall, toggleMute, leaveCall } = useWebRTC(
    socket,
    `${projectId}::${currentBranch?.id || 'main'}`
  );

  const { tree, loading: treeLoading, refresh: refreshTree } = useDirectoryTree(
    projectId ?? null,
    currentBranch?.id ?? null
  );

  // ── Global Botpress & AI Tool Bridge with Full File Permissions ─────────────
  useEffect(() => {
    const bridge = {
      createFile: async (filename: string, initialContent: string = '') => {
        try {
          const res = await fetch('/api/tools/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({ action: 'create_file', project_id: projectId, branch_id: currentBranch?.id, file_path: filename, content: initialContent })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || 'Failed to create file');
          toast(`Botpress created '${filename}'`, 'success');
          refreshTree();
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
            body: JSON.stringify({ action: 'read_file', project_id: projectId, branch_id: currentBranch?.id, file_path: target })
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
            body: JSON.stringify({ action: 'write_file', project_id: projectId, branch_id: currentBranch?.id, file_path: filename, content })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || 'Failed to write file');
          if (openFile?.name === filename) {
            handleApplyAgentCode(filename, content);
          }
          toast(`Botpress updated '${filename}'`, 'success');
          refreshTree();
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
            body: JSON.stringify({ action: 'modify_file', project_id: projectId, branch_id: currentBranch?.id, file_path: filename, content })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || 'Failed to modify file');
          if (openFile?.name === filename) {
            handleApplyAgentCode(filename, content);
          }
          toast(`Botpress modified '${filename}'`, 'success');
          refreshTree();
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
            body: JSON.stringify({ action: 'delete_file', project_id: projectId, branch_id: currentBranch?.id, file_path: filename })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || 'Failed to delete file');
          toast(`Botpress deleted '${filename}'`, 'info');
          refreshTree();
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
          body: JSON.stringify({ action: 'list_files', project_id: projectId, branch_id: currentBranch?.id })
        });
        return await res.json();
      },
      getActiveFile: () => openFile?.name || null,
      getActiveCode: () => text?.toString() || editorValue,
      getProjectId: () => projectId,
      getBranchId: () => currentBranch?.id || null,
    };

    (window as any).nulltorTools = bridge;
    (window as any).botpressTools = bridge;

    const handleMessage = async (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return;
      const { type, action, file_path, content } = event.data;
      if (type === 'nulltor_tool' || type === 'botpress_tool') {
        if (action === 'create_file' && file_path) await bridge.createFile(file_path, content || '');
        else if (action === 'write_file' && file_path) await bridge.writeFile(file_path, content || '');
        else if (action === 'modify_file' && file_path) await bridge.modifyFile(file_path, content || '');
        else if (action === 'delete_file' && file_path) await bridge.deleteFile(file_path);
        else if (action === 'read_file' && file_path) await bridge.readFile(file_path);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [projectId, currentBranch, openFile, editorValue]);

  function toggleBotpressChat() {
    const bp = (window as any).botpress;
    if (bp) {
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach((iframe) => {
        if (iframe.src.includes('botpress') || iframe.id.includes('bp') || iframe.name.includes('bp')) {
          iframe.style.removeProperty('display');
          iframe.style.removeProperty('opacity');
          iframe.style.removeProperty('pointer-events');
        }
      });

      if (typeof bp.open === 'function') {
        bp.open();
      } else if (typeof bp.sendEvent === 'function') {
        bp.sendEvent({ type: 'toggle' });
      }
    } else {
      toast('Botpress Webchat is initializing...', 'info');
    }
  }

  async function handlePullSyncComplete(newSnapshotBase64?: string | null) {
    const liveDoc = docRef.current;
    if (newSnapshotBase64 && liveDoc) {
      try {
        const decrypted = decrypt(newSnapshotBase64);
        const newCode = extractTextFromYjsSnapshot(decrypted);
        if (newCode) {
          const ytext = liveDoc.getText('content').length > 0 ? liveDoc.getText('content') : liveDoc.getText('monaco');
          liveDoc.transact(() => {
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
    const liveDoc = docRef.current;
    if (!openFile || !currentBranch || !liveDoc) return;
    const msg = window.prompt(`Enter commit message for ${openFile.name}:`);
    if (!msg) return;

    try {
      const update = Y.encodeStateAsUpdate(liveDoc);
      const b64 = uint8ArrayToBase64(update);
      const encryptedSnapshot = encrypt(b64);

      await commitsApi.createCommit(projectId!, {
        branch_id: currentBranch.id,
        file_id: openFile.id,
        message: msg,
        snapshot: encryptedSnapshot
      });
      toast(`Committed revision for ${openFile.name}`, "success");
      if (activeTab !== 'git') {
        setActiveTab('git');
      }
    } catch (e: any) {
      console.error(e);
      toast(e?.message || "Failed to commit revision", "error");
    }
  }

  async function handleCommitWorkspaceRequest() {
    const liveDoc = docRef.current;
    if (!currentBranch || !projectId) return;
    const msg = window.prompt("Enter commit message for workspace revision:");
    if (!msg) return;

    try {
      let count = 0;
      if (openFile && liveDoc) {
        const update = Y.encodeStateAsUpdate(liveDoc);
        const b64 = uint8ArrayToBase64(update);
        const encryptedSnapshot = encrypt(b64);

        await commitsApi.createCommit(projectId, {
          branch_id: currentBranch.id,
          file_id: openFile.id,
          message: `📦 Workspace: ${msg}`,
          snapshot: encryptedSnapshot
        });
        count++;
      }
      toast(`Committed workspace snapshot (${count} file${count === 1 ? '' : 's'})`, "success");
      if (activeTab !== 'git') {
        setActiveTab('git');
      }
    } catch (e: any) {
      console.error(e);
      toast(e?.message || "Failed to commit workspace", "error");
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
          if (pb) {
            defaultBranch = pb;
            setSessionPrivateBranch(savedPrivateBranchId);
          } else {
            sessionStorage.removeItem(`privatebranch-${projectId}`);
            setSessionPrivateBranch(null);
          }
        } else {
          setSessionPrivateBranch(null);
        }

        if (defaultBranch) setBranch(defaultBranch);
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

    const handler = (event: Y.YTextEvent) => {
      // Don't re-render React on our own local typing since Monaco handles it with zero latency
      if (event.transaction.origin === 'local-monaco') return;
      setEditorValue(text.toString());
    };
    text.observe(handler);
    return () => text.unobserve(handler);
  }, [text, doc, openFile]);

  function handleEditorChange(_val: string) {
    // Keystroke changes are already applied atomically to Y.Text via Monaco's onDidChangeModelContent!
    // No full delete & insert wipe needed here!
  }

  async function handleApplyAgentCode(fileName: string, code: string) {
    if (!projectId) return;

    const findNodeByPath = (nodes: DirectoryNode[], pathParts: string[]): DirectoryNode | null => {
      if (pathParts.length === 0) return null;
      const [currentPart, ...restParts] = pathParts;
      for (const n of nodes) {
        if (n.name === currentPart) {
          if (restParts.length === 0 && n.type === 'file') return n;
          if (restParts.length > 0 && n.type === 'dir' && n.children) {
            const found = findNodeByPath(n.children, restParts);
            if (found) return found;
          }
        }
      }
      return null;
    };

    let updatedTree = await refreshTree();
    const pathParts = fileName.replace(/\\/g, '/').split('/').filter(Boolean);
    let targetNode = findNodeByPath(updatedTree || tree, pathParts);

    if (!targetNode) {
      try {
        await (window as any).nulltorTools.writeFile(fileName, code);
        updatedTree = await refreshTree();
        targetNode = findNodeByPath(updatedTree || tree, pathParts);
      } catch (err) {
        console.error("Failed to auto-create file:", err);
      }
    }

    if (!targetNode) return;

    // 1. If the target file is already open, directly update its buffer
    if (openFile && openFile.id === targetNode.id) {
      if (text && doc) {
        doc.transact(() => {
          text.delete(0, text.length);
          text.insert(0, code);
        }, 'local');
      }
      setEditorValue(code);
      toast(`✦ AI updated ${fileName}`, 'success');
      return;
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
    }
  }

  // Load pending merge count for admin badge
  useEffect(() => {
    if (!projectId || !canReview) return;
    mergesApi.list(projectId, 'pending').then((data) => setPendingMergeCount(data.length)).catch(() => { });
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
      <header className="nexus-topbar" style={{
        height: '46px',
        background: '#111215',
        borderBottom: '1px solid #1f2128',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        gap: '12px'
      }}>
        {/* Left Section: Logo + Branch Pill + Live Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => navigate('/dashboard')} title="Back to Dashboard">
            <NulltorLogo size="sm" showText={true} />
          </div>

          <div style={{ width: '1px', height: '18px', background: '#252830' }}></div>

          {/* Branch Pill */}
          <BranchSelector
            branches={branches}
            currentBranch={currentBranch}
            projectId={projectId!}
            onBranchChange={handleBranchChange}
            onRefresh={handleBranchRefresh}
          />

          {/* Live Peer Indicator matching Mockup */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 600,
            color: '#10b981',
            padding: '2px 8px',
            borderRadius: '12px',
            background: 'rgba(16, 185, 129, 0.08)',
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 8px #10b981',
              display: 'inline-block'
            }}></span>
            {peers.length + 1} live
          </div>
        </div>

        {/* Right Actions: High-Contrast Run + Ghost Pull + Ghost Merge/PR + Icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Primary High-Contrast Run Button */}
          <button
            onClick={() => setRunTrigger((t) => t + 1)}
            disabled={isRunning}
            title={isRunning ? 'Executing code in sandbox...' : 'Execute Code (Run)'}
            style={{
              padding: '6px 18px',
              color: '#000000',
              background: '#ffffff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 700,
              fontSize: '12.5px',
              border: 'none',
              borderRadius: '20px',
              cursor: isRunning ? 'wait' : 'pointer',
              boxShadow: '0 1px 4px rgba(255, 255, 255, 0.2)',
              transition: 'all 0.15s ease',
            }}
          >
            {isRunning ? (
              <>
                <RefreshCw size={13} className="spin" color="#000000" />
                <span>Running...</span>
              </>
            ) : (
              <>
                <Play size={13} fill="#000000" color="#000000" />
                <span>Run</span>
              </>
            )}
          </button>

          {/* Dedicated Save Button */}
          <button
            onClick={handleManualSave}
            disabled={!openFile || isSaving}
            title={openFile ? `Save ${openFile.name} (Ctrl+S)` : 'Save File (Ctrl+S)'}
            style={{
              padding: '6px 14px',
              background: '#18191e',
              border: '1px solid #2a2d36',
              color: openFile ? '#38bdf8' : '#64748b',
              fontWeight: 600,
              fontSize: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              borderRadius: '8px',
              cursor: openFile ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s ease',
            }}
          >
            {isSaving ? (
              <>
                <RefreshCw size={13} className="spin" color="#38bdf8" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save size={13} color={openFile ? '#38bdf8' : '#64748b'} />
                <span>Save</span>
              </>
            )}
          </button>

          {/* Secondary Ghost Pull / Sync Button */}
          <button
            onClick={() => setShowPullSyncModal(true)}
            title={`Pull updates from another branch into ${currentBranch?.name ?? 'current branch'}`}
            style={{
              padding: '6px 14px',
              background: '#18191e',
              border: '1px solid #2a2d36',
              color: '#e2e8f0',
              fontWeight: 600,
              fontSize: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <ArrowDownCircle size={14} color="#94a3b8" />
            <span>Pull</span>
          </button>

          {/* Secondary Ghost Merge / PR Button */}
          <button
            onClick={() => setShowMergeModal(true)}
            title="Submit Merge / Pull Request"
            style={{
              padding: '6px 14px',
              background: '#18191e',
              border: '1px solid #2a2d36',
              color: '#e2e8f0',
              fontWeight: 600,
              fontSize: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <GitMerge size={14} color="#94a3b8" />
            <span>Merge / PR</span>
          </button>

          <div style={{ width: '1px', height: '18px', background: '#252830', margin: '0 2px' }}></div>

          {/* Review PR Button with Tooltip */}
          {canReview && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: '6px 8px', position: 'relative', borderRadius: '6px', color: '#94a3b8' }}
              title="Review Pending Merge Requests"
              onClick={() => { setShowMergeReview(true); setPendingMergeCount(0); }}
            >
              <ListChecks size={16} />
              {pendingMergeCount > 0 && (
                <span style={{ position: 'absolute', top: 2, right: 2, width: 14, height: 14, background: '#f59e0b', borderRadius: '50%', fontSize: 9, fontWeight: 800, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {pendingMergeCount}
                </span>
              )}
            </button>
          )}

          {/* Team Toggle Button with Tooltip */}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setShowTeamDrawer(!showTeamDrawer);
              if (!showTeamDrawer) setShowAgentPanel(false);
            }}
            title="Team & Collaborators"
            style={{
              padding: '6px 8px',
              borderRadius: '6px',
              color: showTeamDrawer ? '#3b82f6' : '#94a3b8',
              background: showTeamDrawer ? 'rgba(59, 130, 246, 0.15)' : 'transparent'
            }}
          >
            <Users size={16} />
          </button>

          {/* Agent Toggle Button with Tooltip */}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setShowAgentPanel(!showAgentPanel);
              if (!showAgentPanel) setShowTeamDrawer(false);
            }}
            title="Toggle Agent Assistant"
            style={{
              padding: '6px 8px',
              borderRadius: '6px',
              color: showAgentPanel ? '#3b82f6' : '#94a3b8',
              background: showAgentPanel ? 'rgba(59, 130, 246, 0.15)' : 'transparent'
            }}
          >
            <Bot size={16} />
          </button>

          {/* Theme Toggle Button with Tooltip */}
          <button
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            style={{ padding: '6px 8px', borderRadius: '6px', color: '#94a3b8' }}
          >
            {theme === 'dark' ? (
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            )}
          </button>
        </div>
      </header>

      {/* Main Multi-Pane Body */}
      <div className="ide-body">
        <ActivityBar
          activeTab={activeTab}
          onChangeTab={(tab) => {
            setActiveTab(tab);
          }}
          onBotClick={toggleBotpressChat}
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
                const liveDoc = docRef.current;
                if (!liveDoc) return null;
                try {
                  const update = Y.encodeStateAsUpdate(liveDoc);
                  const b64 = uint8ArrayToBase64(update);
                  return encrypt(b64);
                } catch { return null; }
              }}
              onRestore={(snapshotBase64) => {
                const liveDoc = docRef.current;
                if (!liveDoc) return;
                try {
                  const uint8Array = base64ToUint8Array(snapshotBase64);
                  const tempDoc = new Y.Doc();
                  Y.applyUpdate(tempDoc, uint8Array);

                  let restoredText = '';
                  if (tempDoc.getText('content').length > 0) restoredText = tempDoc.getText('content').toString();
                  else if (tempDoc.getText('monaco').length > 0) restoredText = tempDoc.getText('monaco').toString();

                  if (restoredText) {
                    const liveText = liveDoc.getText('content');
                    liveText.delete(0, liveText.length);
                    liveText.insert(0, restoredText);
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
          {activeTab !== 'explorer' && activeTab !== 'search' && activeTab !== 'git' && (
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
            projectName={currentProject?.name}
            branchId={currentBranch?.id}
            fileId={openFile?.id}
            tree={tree}
            getDoc={() => docRef.current}
            decrypt={decrypt}
            onSave={handleManualSave}
            isSaving={isSaving}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, minHeight: 0, marginTop: '8px', borderTop: '1px solid var(--border)', paddingTop: '12px', overflowY: 'auto', paddingRight: '4px' }}>
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

              {/* WebRTC Video Window */}
              <div style={{ flexShrink: 0, marginTop: '12px', background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                {!isVideoActive ? (
                  <div
                    onClick={startCall}
                    style={{ height: '110px', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', cursor: 'pointer', transition: 'background 0.2s' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-3)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-2)'}
                  >
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '22px', marginBottom: '4px', color: 'var(--aurora-mint)' }}><Video size={18} /></div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>Join Live Video Call</div>
                      <div style={{ fontSize: '10px', marginTop: '4px', opacity: 0.7 }}>E2EE Peer-to-Peer Mesh</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '4px', display: 'grid', gridTemplateColumns: remoteStreams.length > 0 ? '1fr 1fr' : '1fr', gap: '4px', background: '#000', maxHeight: '300px', overflowY: 'auto' }}>
                    <div style={{ position: 'relative', aspectRatio: '4/3' }}>
                      <VideoPlayer stream={localStream} muted autoPlay style={{ border: isMuted ? '2px solid #ef4444' : '2px solid var(--aurora-mint)' }} />
                      <div style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: 4, fontSize: '10px', color: '#fff' }}>
                        You {isMuted && '(Muted)'}
                      </div>
                    </div>
                    {remoteStreams.map(rs => (
                      <div key={rs.peerId} style={{ position: 'relative', aspectRatio: '4/3' }}>
                        <VideoPlayer stream={rs.stream} autoPlay controls style={{ border: '1px solid #333' }} />
                        <div style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: 4, fontSize: '10px', color: '#fff' }}>
                          Peer
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ padding: '8px 12px', background: 'var(--bg-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontWeight: 600 }}>{user?.username}'s Room</span>
                  {isVideoActive && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', color: isMuted ? '#ef4444' : 'inherit' }} onClick={toggleMute}>
                        <Mic size={14} /> {isMuted ? 'Unmute' : 'Mute'}
                      </button>
                      <button className="btn btn-danger btn-sm" style={{ padding: '2px 8px' }} onClick={leaveCall}>
                        Leave
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button
              className="btn btn-primary btn-full"
              onClick={() => setShowInviteSubroom(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontWeight: 700,
                fontSize: '12.5px',
                padding: '8px 14px',
                borderRadius: '8px',
              }}
            >
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
              onRefreshTree={refreshTree}
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

      {/* Real-Time Incoming Subroom Invitation Permission Dialog */}
      {incomingInvite && (
        <div style={{
          position: 'fixed',
          top: '56px',
          right: '24px',
          zIndex: 9999,
          background: '#15161a',
          border: '1px solid #3b82f6',
          borderRadius: '12px',
          padding: '16px 20px',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6), 0 0 24px rgba(59, 130, 246, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxWidth: '380px',
          animation: 'slideDown 0.25s ease',
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#3b82f6' }}>🤝</span> Subroom Invitation Request
            </div>
            <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '6px', lineHeight: '1.45' }}>
              <strong style={{ color: '#60a5fa' }}>{incomingInvite.inviterName}</strong> has invited you to join subroom <strong style={{ color: '#f8fafc' }}>"{incomingInvite.branchName}"</strong>. Do you want to join this collaboration session?
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                if (socket && incomingInvite) {
                  socket.emit('subroom-invite-response', {
                    targetUserId: user?.id,
                    inviterUserId: incomingInvite.inviterUserId,
                    inviterId: incomingInvite.inviterId,
                    accepted: false,
                    projectId,
                    branchId: incomingInvite.branchId,
                    branchName: incomingInvite.branchName,
                    responderName: user?.username || 'Peer',
                  });
                }
                setIncomingInvite(null);
                toast(`Invitation to "${incomingInvite.branchName}" declined.`, 'info');
              }}
              style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '6px' }}
            >
              Decline
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={async () => {
                const invite = incomingInvite;
                if (!invite) return;

                // Grant self-membership in subroom if not main
                if (invite.branchId && invite.branchId !== 'main' && user?.id) {
                  try {
                    await branchesApi.addMember(projectId, invite.branchId, user.id);
                  } catch (_) {}
                }

                if (socket) {
                  socket.emit('subroom-invite-response', {
                    targetUserId: user?.id,
                    inviterUserId: invite.inviterUserId,
                    inviterId: invite.inviterId,
                    accepted: true,
                    projectId,
                    branchId: invite.branchId,
                    branchName: invite.branchName,
                    responderName: user?.username || 'Peer',
                  });
                }
                
                await handleBranchRefresh();
                const target = branches.find(b => b.id === invite.branchId);
                if (target) {
                  handleBranchChange(target);
                }
                setIncomingInvite(null);
                toast(`Joined subroom "${invite.branchName}"!`, 'success');
              }}
              style={{ fontSize: '12px', padding: '6px 16px', borderRadius: '6px', fontWeight: 700 }}
            >
              Accept & Join
            </button>
          </div>
        </div>
      )}

      {showInviteSubroom && (
        <InviteSubroomModal
          isOpen={showInviteSubroom}
          projectId={projectId!}
          branchId={currentBranch?.id ?? 'main'}
          branchName={currentBranch?.name ?? 'main'}
          currentUserId={user?.id}
          inviterName={user?.username}
          socket={socket}
          onClose={() => setShowInviteSubroom(false)}
          onMemberAdded={() => {
            handleBranchRefresh();
          }}
        />
      )}

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
              const b64 = uint8ArrayToBase64(update);
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
              const b64 = uint8ArrayToBase64(update);
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
            refreshTree();
            useEditorStore.getState().setFile(null);
          }}
        />
      )}
    </div>
  );
}
