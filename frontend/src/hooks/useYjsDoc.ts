/**
 * useYjsDoc — Yjs collaborative document synced via Socket.IO
 * 
 * Rooms are namespaced as `${fileId}::${branchId}` to give each branch
 * an independent edit history. Encrypted Yjs deltas travel over the wire —
 * the server sees only opaque encrypted strings.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { io, Socket } from 'socket.io-client';

interface UseYjsDocOptions {
  fileId: string;
  branchId: string;
  projectId?: string;
  encrypt: (plaintext: string) => string;
  decrypt: (ciphertext: string) => string;
  username?: string;
  userId?: string;
  color?: string;
}

export interface Peer {
  id: string;
  name: string;
  color: string;
}

export interface RemoteCursor {
  socketId: string;
  name: string;
  color: string;
  line: number;
  column: number;
}

interface UseYjsDocResult {
  doc: Y.Doc | null;
  docRef: React.MutableRefObject<Y.Doc | null>;
  text: Y.Text | null;
  isConnected: boolean;
  peers: Peer[];
  cursors: RemoteCursor[];
  emitCursor: (line: number, column: number) => void;
  saveSnapshot: () => boolean;
  socket: Socket | null;
  decryptionError: boolean;
}

// Safe chunked Base64 encoding/decoding to prevent call stack size exceeded errors
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + chunkSize, len))));
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function useYjsDoc({
  fileId,
  branchId,
  projectId,
  encrypt,
  decrypt,
  username = 'Anonymous',
  userId,
  color = '#6366f1',
}: UseYjsDocOptions): UseYjsDocResult {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);
  const [activeSocket, setActiveSocket] = useState<Socket | null>(null);
  const [decryptionError, setDecryptionError] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  // Always-current refs so saveSnapshot never captures a stale closure
  const docRef = useRef<Y.Doc | null>(null);
  const encryptRef = useRef<(plaintext: string) => string>(encrypt);
  const decryptionErrorRef = useRef(false);

  // Keep encryptRef in sync every render
  encryptRef.current = encrypt;

  const isRealFile = Boolean(fileId && fileId !== '__none__');
  const effectiveFileId = isRealFile
    ? fileId
    : (projectId ? `${projectId}::__workspace__` : '__workspace__');
  const effectiveBranchId = branchId || 'main';
  const roomKey = `${effectiveFileId}::${effectiveBranchId}`;

  useEffect(() => {
    // Reset decryption error state on room/file switch
    setDecryptionError(false);
    decryptionErrorRef.current = false;

    // Create Yjs document for real files
    let newDoc: Y.Doc | null = null;
    if (isRealFile) {
      newDoc = new Y.Doc();
      docRef.current = newDoc;  // keep ref in sync immediately (before async setState)
      setDoc(newDoc);
    } else {
      docRef.current = null;
      setDoc(null);
    }

    let snapshotTimer: ReturnType<typeof setTimeout> | null = null;
    const flushSnapshot = () => {
      if (!newDoc || !socketRef.current || decryptionErrorRef.current) return;
      try {
        const fullUpdate = Y.encodeStateAsUpdate(newDoc);
        const fullB64 = uint8ArrayToBase64(fullUpdate);
        const fullPayload = encrypt(fullB64);
        socketRef.current.emit('y-snapshot', fullPayload);
      } catch (_) {}
    };

    const applyEncryptedSnapshot = (rawSnapshot: string) => {
      if (!rawSnapshot || !newDoc) return;
      try {
        const decrypted = decrypt(rawSnapshot);
        setDecryptionError(false);
        decryptionErrorRef.current = false;
        try {
          const update = base64ToUint8Array(decrypted);
          Y.applyUpdate(newDoc, update);
        } catch {
          const ytext = newDoc.getText('content');
          newDoc.transact(() => {
            ytext.delete(0, ytext.length);
            ytext.insert(0, decrypted);
          }, 'local');
        }
      } catch (err: any) {
        console.error('[Yjs] Decryption failed — invalid passphrase or corrupted payload:', err?.message);
        setDecryptionError(true);
        decryptionErrorRef.current = true;
        // Guard: DO NOT dump raw ciphertext into Monaco!
      }
    };

    // Connect to Node.js Socket.IO server with aggressive self-healing reconnection settings
    const socket = io('/', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
      timeout: 10000,
    });
    socketRef.current = socket;
    setActiveSocket(socket);

    socket.on('connect', () => {
      setIsConnected(true);
      // Re-join and re-sync on every connect
      socket.emit('join-file', { fileId: effectiveFileId, branchId: effectiveBranchId });
      socket.emit('register-peer', { name: username, color, userId });
      if (isRealFile) {
        socket.emit('request-sync');
      }
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      setCursors([]);
    });

    // Receive approved event: load snapshot and register peer
    socket.on('approved', ({ snapshot }: { snapshot: string | null }) => {
      if (snapshot && newDoc) {
        applyEncryptedSnapshot(snapshot);
      }
      socket.emit('register-peer', { name: username, color, userId });
      // If we have local edits that accumulated while disconnected, flush them now
      if (newDoc && newDoc.getText('content').length > 0) {
        flushSnapshot();
      }
    });

    // Auto-wake & reconnect on window focus / tab visibility change (after laptop sleep or tab inactive)
    const handleWakeup = () => {
      if (document.visibilityState === 'visible') {
        if (!socket.connected) {
          console.log('[Yjs] Tab active after inactivity/sleep — restoring socket connection...');
          socket.connect();
        } else {
          // Re-verify room membership and sync
          socket.emit('join-file', { fileId: effectiveFileId, branchId: effectiveBranchId });
          socket.emit('register-peer', { name: username, color, userId });
          if (isRealFile) {
            socket.emit('request-sync');
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleWakeup);
    window.addEventListener('focus', handleWakeup);
    window.addEventListener('online', handleWakeup);

    // Periodic lightweight heartbeat (every 30s) to prevent browser background timer death
    const heartbeatTimer = setInterval(() => {
      if (socket.connected && document.visibilityState === 'visible') {
        socket.emit('register-peer', { name: username, color, userId });
      } else if (!socket.connected && document.visibilityState === 'visible') {
        socket.connect();
      }
    }, 30000);

    // Receive delta from other peers
    socket.on('y-delta', (payload: string) => {
      if (!newDoc || decryptionErrorRef.current) return;
      try {
        const decrypted = decrypt(payload);
        const update = base64ToUint8Array(decrypted);
        Y.applyUpdate(newDoc, update);
      } catch (_) {}
    });

    // Sync response (full snapshot from another peer)
    socket.on('sync-response', ({ snapshot }: { snapshot: string }) => {
      if (snapshot && newDoc) {
        applyEncryptedSnapshot(snapshot);
      }
    });

    // Someone needs our snapshot
    socket.on('sync-needed', ({ requesterId }: { requesterId: string }) => {
      if (!newDoc || decryptionErrorRef.current) return;
      try {
        const update = Y.encodeStateAsUpdate(newDoc);
        const b64 = uint8ArrayToBase64(update);
        const payload = encrypt(b64);
        socket.emit('y-sync-offer', { targetId: requesterId, payload });
      } catch (_) {}
    });

    // Peer presence (filter out local user so peers only reflects remote collaborators)
    socket.on('presence', ({ peers: p }: { peers: Peer[] }) => {
      setPeers((p || []).filter((peer) => peer.id !== socket.id));
    });
    socket.on('peer-left', ({ id }: { id: string }) => {
      setPeers((prev) => prev.filter((p) => p.id !== id));
      setCursors((prev) => prev.filter((c) => c.socketId !== id));
    });

    // Remote cursor updates
    socket.on('cursor-update', (cursor: RemoteCursor) => {
      setCursors((prev) => {
        const filtered = prev.filter((c) => c.socketId !== cursor.socketId);
        return [...filtered, cursor];
      });
    });

    // Observe local changes and broadcast encrypted deltas
    if (newDoc) {
      newDoc.on('update', (update: Uint8Array, origin: unknown) => {
        if (origin === 'remote') return;
        try {
          const b64 = uint8ArrayToBase64(update);
          const payload = encrypt(b64);
          socket.emit('y-delta', payload);

          if (snapshotTimer) clearTimeout(snapshotTimer);
          snapshotTimer = setTimeout(flushSnapshot, 2500);
        } catch (_) {}
      });
    }

    if (isRealFile) {
      socket.emit('request-sync');
    }

    return () => {
      clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', handleWakeup);
      window.removeEventListener('focus', handleWakeup);
      window.removeEventListener('online', handleWakeup);
      if (snapshotTimer) {
        clearTimeout(snapshotTimer);
        flushSnapshot();
      }
      socket.disconnect();
      if (newDoc) {
        newDoc.destroy();
      }
      docRef.current = null;  // clear ref so saveSnapshot doesn't use a destroyed doc
      setDoc(null);
      socketRef.current = null;
      setActiveSocket(null);
      setIsConnected(false);
      setPeers([]);
      setCursors([]);
    };
  }, [roomKey, username, color]); // eslint-disable-line react-hooks/exhaustive-deps

  const emitCursor = useCallback((line: number, column: number) => {
    socketRef.current?.emit('cursor-update', { line, column });
  }, []);

  const saveSnapshot = useCallback(() => {
    // Use refs so we always get the LIVE doc and encrypt fn, not stale closure values
    const liveDoc = docRef.current;
    const liveSocket = socketRef.current;
    if (!liveDoc || !liveSocket || decryptionErrorRef.current) return false;
    try {
      const fullUpdate = Y.encodeStateAsUpdate(liveDoc);
      const fullB64 = uint8ArrayToBase64(fullUpdate);
      const fullPayload = encryptRef.current(fullB64);
      liveSocket.emit('y-snapshot', fullPayload);
      return true;
    } catch (_) {
      return false;
    }
  }, []); // stable — reads everything from refs

  return {
    doc,
    docRef,
    text: doc ? doc.getText('content') : null,
    isConnected,
    peers,
    cursors,
    emitCursor,
    saveSnapshot,
    socket: activeSocket,
    decryptionError,
  };
}
