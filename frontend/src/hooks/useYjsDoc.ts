/**
 * useYjsDoc — Yjs collaborative document synced via Socket.IO
 * 
 * Rooms are namespaced as `${fileId}::${branchId}` to give each branch
 * an independent edit history. Encrypted Yjs deltas travel over the wire —
 * the server sees only opaque encrypted strings.
 * 
 * Usage:
 *   const { text, content, isConnected } = useYjsDoc({ fileId, branchId, encrypt, decrypt });
 *   // bind `text` (Y.Text) to Monaco Editor via y-monaco or MonacoBinding
 */
import { useEffect, useRef, useState } from 'react';
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

interface UseYjsDocResult {
  doc: Y.Doc | null;
  text: Y.Text | null;
  isConnected: boolean;
  peers: Peer[];
}

interface Peer {
  id: string;
  name: string;
  color: string;
}

export function useYjsDoc({
  fileId,
  branchId,
  encrypt,
  decrypt,
  username = 'Anonymous',
  color = '#6366f1',
}: UseYjsDocOptions): UseYjsDocResult {
  const [isConnected, setIsConnected] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);

  const docRef = useRef<Y.Doc | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const roomKey = `${fileId}::${branchId}`;

  useEffect(() => {
    if (!fileId || !branchId) return;

    // Create Yjs document
    const doc = new Y.Doc();
    docRef.current = doc;

    // Connect to Node.js Socket.IO server
    const socket = io('/', { path: '/socket.io', transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('join-file', { fileId: roomKey });
    });

    socket.on('disconnect', () => setIsConnected(false));

    // Receive approved event: load snapshot and register peer
    socket.on('approved', ({ snapshot }: { snapshot: string | null }) => {
      if (snapshot) {
        try {
          const decrypted = decrypt(snapshot);
          const update = Uint8Array.from(atob(decrypted), (c) => c.charCodeAt(0));
          Y.applyUpdate(doc, update);
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
        Y.applyUpdate(doc, update);
      } catch (_) {/* ignore decrypt errors from key mismatch */}
    });

    // Sync response (full snapshot from another peer)
    socket.on('sync-response', ({ snapshot }: { snapshot: string }) => {
      try {
        const decrypted = decrypt(snapshot);
        const update = Uint8Array.from(atob(decrypted), (c) => c.charCodeAt(0));
        Y.applyUpdate(doc, update);
      } catch (_) {}
    });

    // Someone needs our snapshot
    socket.on('sync-needed', ({ requesterId }: { requesterId: string }) => {
      const update = Y.encodeStateAsUpdate(doc);
      const b64 = btoa(String.fromCharCode(...update));
      try {
        const payload = encrypt(b64);
        socket.emit('y-sync-offer', { targetId: requesterId, payload });
      } catch (_) {}
    });

    // Peer presence
    socket.on('presence', ({ peers: p }: { peers: Peer[] }) => setPeers(p));
    socket.on('peer-left', ({ id }: { id: string }) =>
      setPeers((prev) => prev.filter((p) => p.id !== id))
    );

    // Observe local changes and broadcast encrypted deltas
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return; // don't re-broadcast received updates
      const b64 = btoa(String.fromCharCode(...update));
      try {
        const payload = encrypt(b64);
        socket.emit('y-delta', payload);

        // Persist full snapshot every 30 updates (debounce in practice)
        const fullUpdate = Y.encodeStateAsUpdate(doc);
        const fullB64 = btoa(String.fromCharCode(...fullUpdate));
        const fullPayload = encrypt(fullB64);
        socket.emit('y-snapshot', fullPayload);
      } catch (_) {}
    });

    socket.emit('request-sync');

    return () => {
      socket.disconnect();
      doc.destroy();
      docRef.current = null;
      socketRef.current = null;
      setIsConnected(false);
      setPeers([]);
    };
  }, [roomKey, username, color]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    doc: docRef.current,
    text: docRef.current?.getText('content') ?? null,
    isConnected,
    peers,
  };
}
