/**
 * useYjsDoc — Yjs collaborative document synced via Socket.IO
 * 
 * Rooms are namespaced as `${fileId}::${branchId}` to give each branch
 * an independent edit history. Encrypted Yjs deltas travel over the wire —
 * the server sees only opaque encrypted strings.
 * 
 * Usage:
 *   const { text, content, isConnected, cursors } = useYjsDoc({ fileId, branchId, encrypt, decrypt });
 *   // bind `text` (Y.Text) to Monaco Editor via y-monaco or MonacoBinding
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { io, Socket } from 'socket.io-client';

interface UseYjsDocOptions {
  fileId: string;
  branchId: string;
  encrypt: (plaintext: string) => string;
  decrypt: (ciphertext: string) => string;
  username?: string;
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
  text: Y.Text | null;
  isConnected: boolean;
  peers: Peer[];
  cursors: RemoteCursor[];
  emitCursor: (line: number, column: number) => void;
}

export function useYjsDoc({
  fileId,
  branchId,
  encrypt,
  decrypt,
  username = 'Anonymous',
  color = '#6366f1',
}: UseYjsDocOptions): UseYjsDocResult {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);

  const socketRef = useRef<Socket | null>(null);

  const roomKey = `${fileId}::${branchId}`;

  useEffect(() => {
    if (!fileId || !branchId || fileId === '__none__') {
      setDoc(null);
      return;
    }

    // Create Yjs document
    const newDoc = new Y.Doc();
    setDoc(newDoc);

    // Connect to Node.js Socket.IO server
    const socket = io('/', { path: '/socket.io', transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('join-file', { fileId, branchId });
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      setCursors([]);
    });

    // Receive approved event: load snapshot and register peer
    socket.on('approved', ({ snapshot }: { snapshot: string | null }) => {
      if (snapshot) {
        try {
          const decrypted = decrypt(snapshot);
          const update = Uint8Array.from(atob(decrypted), (c) => c.charCodeAt(0));
          Y.applyUpdate(newDoc, update);
        } catch (_) {
          // Snapshot may be empty or from a different key — ignore
        }
      }
      socket.emit('register-peer', { name: username, color });
    });

    // Receive delta from other peers
    socket.on('y-delta', (payload: string) => {
      try {
        const decrypted = decrypt(payload);
        const update = Uint8Array.from(atob(decrypted), (c) => c.charCodeAt(0));
        Y.applyUpdate(newDoc, update);
      } catch (_) {/* ignore decrypt errors from key mismatch */}
    });

    // Sync response (full snapshot from another peer)
    socket.on('sync-response', ({ snapshot }: { snapshot: string }) => {
      try {
        const decrypted = decrypt(snapshot);
        const update = Uint8Array.from(atob(decrypted), (c) => c.charCodeAt(0));
        Y.applyUpdate(newDoc, update);
      } catch (_) {}
    });

    // Someone needs our snapshot
    socket.on('sync-needed', ({ requesterId }: { requesterId: string }) => {
      const update = Y.encodeStateAsUpdate(newDoc);
      const b64 = btoa(String.fromCharCode(...update));
      try {
        const payload = encrypt(b64);
        socket.emit('y-sync-offer', { targetId: requesterId, payload });
      } catch (_) {}
    });

    // Peer presence
    socket.on('presence', ({ peers: p }: { peers: Peer[] }) => setPeers(p));
    socket.on('peer-left', ({ id }: { id: string }) => {
      setPeers((prev) => prev.filter((p) => p.id !== id));
      // Remove this peer's cursor
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
    newDoc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return; // don't re-broadcast received updates
      const b64 = btoa(String.fromCharCode(...update));
      try {
        const payload = encrypt(b64);
        socket.emit('y-delta', payload);

        // Persist full snapshot every 30 updates (debounce in practice)
        const fullUpdate = Y.encodeStateAsUpdate(newDoc);
        const fullB64 = btoa(String.fromCharCode(...fullUpdate));
        const fullPayload = encrypt(fullB64);
        socket.emit('y-snapshot', fullPayload);
      } catch (_) {}
    });

    socket.emit('request-sync');

    return () => {
      socket.disconnect();
      newDoc.destroy();
      setDoc(null);
      socketRef.current = null;
      setIsConnected(false);
      setPeers([]);
      setCursors([]);
    };
  }, [roomKey, username, color]); // eslint-disable-line react-hooks/exhaustive-deps

  const emitCursor = useCallback((line: number, column: number) => {
    socketRef.current?.emit('cursor-update', { line, column });
  }, []);

  return {
    doc,
    text: doc ? doc.getText('content') : null,
    isConnected,
    peers,
    cursors,
    emitCursor,
  };
}
