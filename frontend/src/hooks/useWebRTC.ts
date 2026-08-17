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
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);
  
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());

  // Clean up all connections
  const cleanup = useCallback(() => {
    peerConnections.current.forEach((pc) => pc.close());
    peerConnections.current.clear();
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
    }
    setLocalStream(null);
    setRemoteStreams([]);
    setIsVideoActive(false);
    setIsMuted(false);
  }, []);

  // Start local video/audio
  const startCall = useCallback(async () => {
    if (!socket || !roomId) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream; // Update synchronously
      setLocalStream(stream);
      setIsVideoActive(true);
      
      // Signal to the room that we just joined the video call
      socket.emit('webrtc-join-call');
      
    } catch (err: any) {
      console.error("Failed to get local media", err);
      alert(`Could not start video call. Please ensure your camera/microphone are connected and you have granted permissions. If you are accessing this over the local network via HTTP, modern browsers require HTTPS (or localhost) for camera access.\n\nError: ${err.message}`);
    }
  }, [socket, roomId]);

  const toggleMute = useCallback(() => {
    setLocalStream((prevStream) => {
        if (prevStream) {
            prevStream.getAudioTracks().forEach(t => {
                t.enabled = !t.enabled;
            });
            setIsMuted(!prevStream.getAudioTracks()[0]?.enabled);
        }
        return prevStream;
    });
  }, []);

  // Create a new RTCPeerConnection
  const createPeerConnection = useCallback((peerId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
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
      setRemoteStreams(prev => {
        const existing = prev.find(s => s.peerId === peerId);
        if (existing) return prev;
        return [...prev, { peerId, stream: event.streams[0] }];
      });
    };

    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    peerConnections.current.set(peerId, pc);
    return pc;
  }, [socket, localStream]);

  useEffect(() => {
    if (!socket) return;

    const handlePeerJoined = async ({ id, senderId }: { id?: string, senderId?: string }) => {
      if (!isVideoActive) return; // Only initiate if we are in a call
      
      const peerId = id || senderId; // Handle both peer-joined and webrtc-join-call
      if (!peerId) return;

      // If we already have a connection, don't recreate
      if (peerConnections.current.has(peerId)) return;

      const pc = createPeerConnection(peerId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc-signal', {
          targetId: peerId,
          signal: { type: 'offer', sdp: offer }
        });
      } catch (err) {
        console.error("Error creating offer", err);
      }
    };

    const handlePeerLeft = ({ id }: { id: string }) => {
      const pc = peerConnections.current.get(id);
      if (pc) {
        pc.close();
        peerConnections.current.delete(id);
      }
      setRemoteStreams(prev => prev.filter(s => s.peerId !== id));
    };

    const handleWebRTCSignal = async ({ senderId, signal }: { senderId: string, signal: any }) => {
      if (!isVideoActive) return;

      let pc = peerConnections.current.get(senderId);
      
      if (!pc && signal.type === 'offer') {
        pc = createPeerConnection(senderId);
      }
      if (!pc) return;

      try {
        if (signal.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('webrtc-signal', {
            targetId: senderId,
            signal: { type: 'answer', sdp: answer }
          });
        } else if (signal.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } else if (signal.type === 'ice') {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (err) {
        console.error("Error handling webrtc signal", err);
      }
    };

    socket.on('peer-joined', handlePeerJoined);
    socket.on('webrtc-join-call', handlePeerJoined);
    socket.on('peer-left', handlePeerLeft);
    socket.on('webrtc-signal', handleWebRTCSignal);

    return () => {
      socket.off('peer-joined', handlePeerJoined);
      socket.off('webrtc-join-call', handlePeerJoined);
      socket.off('peer-left', handlePeerLeft);
      socket.off('webrtc-signal', handleWebRTCSignal);
    };
  }, [socket, isVideoActive, createPeerConnection]);

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
