import { useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';

export interface RemoteStream {
  peerId: string;
  stream: MediaStream;
}

export function useWebRTC(socket: Socket | null, roomId: string | null) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoActive, setIsVideoActive] = useState(false);
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const isVideoActiveRef = useRef(false);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidates = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const iceServersRef = useRef<RTCIceServer[]>([
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]);

  useEffect(() => {
    let isMounted = true;
    fetch('/api/webrtc/ice-servers')
      .then(res => {
        if (res.ok) return res.json();
        throw new Error(`Status ${res.status}`);
      })
      .then(data => {
        if (isMounted && data) {
          const servers = data.iceServers || data.ice_servers;
          if (Array.isArray(servers) && servers.length > 0) {
            iceServersRef.current = servers;
          }
        }
      })
      .catch(err => {
        console.warn("[WebRTC] Using default STUN servers:", err);
      });
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    isVideoActiveRef.current = isVideoActive;
  }, [isVideoActive]);

  // Clean up all connections
  const cleanup = useCallback(() => {
    peerConnections.current.forEach((pc) => {
      try {
        pc.close();
      } catch (e) {}
    });
    peerConnections.current.clear();
    pendingCandidates.current.clear();
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => {
        try {
          t.stop();
        } catch (e) {}
      });
    }
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStreams([]);
    setIsVideoActive(false);
    setIsMuted(false);
  }, []);

  // Create or get RTCPeerConnection
  const createPeerConnection = useCallback((peerId: string) => {
    if (peerConnections.current.has(peerId)) {
      return peerConnections.current.get(peerId)!;
    }

    const pc = new RTCPeerConnection({
      iceServers: iceServersRef.current
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('webrtc-signal', {
          targetId: peerId,
          signal: { type: 'ice', candidate: event.candidate }
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        const stream = event.streams[0];
        setRemoteStreams(prev => {
          const filtered = prev.filter(s => s.peerId !== peerId);
          return [...filtered, { peerId, stream }];
        });
      }
    };

    // Add local tracks using ref to avoid closure issues
    const currentStream = localStreamRef.current;
    if (currentStream) {
      currentStream.getTracks().forEach(track => {
        try {
          pc.addTrack(track, currentStream);
        } catch (e) {
          console.warn("[WebRTC] addTrack error:", e);
        }
      });
    }

    peerConnections.current.set(peerId, pc);
    return pc;
  }, [socket]);

  // Start local video/audio
  const startCall = useCallback(async () => {
    if (!socket) {
      alert("Real-time signaling connection is not active yet.");
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Camera and microphone access requires HTTPS or localhost (127.0.0.1).\n\nIf you are accessing this over the local network (HTTP), please visit http://localhost:3330 on the host machine or enable HTTPS.");
      return;
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsVideoActive(true);
      
      // Broadcast to room that we are active in call
      socket.emit('webrtc-join-call', { roomId });
      
    } catch (err: any) {
      console.error("Failed to get local media", err);
      alert(`Could not start video call: ${err.message}\n\nPlease check camera/microphone permissions in your browser.`);
    }
  }, [socket, roomId]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => {
        t.enabled = !t.enabled;
      });
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      setIsMuted(audioTrack ? !audioTrack.enabled : false);
    }
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handlePeerJoinedCall = async ({ senderId }: { senderId?: string }) => {
      const peerId = senderId;
      if (!peerId || peerId === socket.id) return;
      if (!isVideoActiveRef.current) return; // Only initiate if active in call

      const pc = createPeerConnection(peerId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc-signal', {
          targetId: peerId,
          signal: { type: 'offer', sdp: offer }
        });
      } catch (err) {
        console.error("[WebRTC] Error creating offer", err);
      }
    };

    const handlePeerLeft = ({ id }: { id: string }) => {
      const pc = peerConnections.current.get(id);
      if (pc) {
        pc.close();
        peerConnections.current.delete(id);
      }
      pendingCandidates.current.delete(id);
      setRemoteStreams(prev => prev.filter(s => s.peerId !== id));
    };

    const handleWebRTCSignal = async ({ senderId, signal }: { senderId: string, signal: any }) => {
      if (!senderId || !signal) return;
      if (!isVideoActiveRef.current) return;

      let pc = peerConnections.current.get(senderId);
      if (!pc && signal.type === 'offer') {
        pc = createPeerConnection(senderId);
      }
      if (!pc) return;

      try {
        if (signal.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          
          // Drain pending ICE candidates
          const queued = pendingCandidates.current.get(senderId) || [];
          for (const cand of queued) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (e) {}
          }
          pendingCandidates.current.delete(senderId);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('webrtc-signal', {
            targetId: senderId,
            signal: { type: 'answer', sdp: answer }
          });
        } else if (signal.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          
          // Drain pending ICE candidates
          const queued = pendingCandidates.current.get(senderId) || [];
          for (const cand of queued) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (e) {}
          }
          pendingCandidates.current.delete(senderId);
        } else if (signal.type === 'ice' && signal.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } else {
            const list = pendingCandidates.current.get(senderId) || [];
            list.push(signal.candidate);
            pendingCandidates.current.set(senderId, list);
          }
        }
      } catch (err) {
        console.error("[WebRTC] Error handling signal", err);
      }
    };

    socket.on('webrtc-join-call', handlePeerJoinedCall);
    socket.on('peer-joined', handlePeerJoinedCall);
    socket.on('peer-left', handlePeerLeft);
    socket.on('webrtc-signal', handleWebRTCSignal);

    return () => {
      socket.off('webrtc-join-call', handlePeerJoinedCall);
      socket.off('peer-joined', handlePeerJoinedCall);
      socket.off('peer-left', handlePeerLeft);
      socket.off('webrtc-signal', handleWebRTCSignal);
    };
  }, [socket, createPeerConnection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    localStream,
    remoteStreams,
    isMuted,
    isVideoActive,
    startCall,
    toggleMute,
    leaveCall: cleanup
  };
}
