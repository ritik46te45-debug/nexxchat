import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff,
  ScreenShare, StopCircle, Maximize2, Minimize2, Volume2,
  VolumeX, Radio, Wifi, WifiOff
} from 'lucide-react';
import { getSocket } from '../../lib/socket';
import toast from 'react-hot-toast';

// ICE servers with free TURN for NAT traversal on mobile & corporate networks
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    // Free TURN servers for mobile/symmetric NAT traversal
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

// Web Audio API Ringtone synthesizer
const startRingtoneAudio = (type = 'incoming') => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return () => {};
    const ctx = new AudioCtx();
    let isPlaying = true;

    const playTone = () => {
      if (!isPlaying || ctx.state === 'closed') return;
      try {
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        if (type === 'incoming') {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523.25, ctx.currentTime);
          osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12);
          osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.25);
          gain.gain.setValueAtTime(0.2, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.85);
        } else {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, ctx.currentTime);
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.1);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 1.2);
        }
      } catch (err) {
        console.warn('Ringtone tone error:', err);
      }
    };

    playTone();
    const interval = setInterval(playTone, type === 'incoming' ? 1800 : 3000);

    return () => {
      isPlaying = false;
      clearInterval(interval);
      try { ctx.close(); } catch (e) {}
    };
  } catch (e) {
    return () => {};
  }
};

export default function CallOverlay({ callData, isIncoming, onEndCall, onCallIdUpdate }) {
  const [callStatus, setCallStatus] = useState(isIncoming ? 'incoming' : 'ringing');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callData.type === 'voice');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [connectionState, setConnectionState] = useState('new');
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const timerRef = useRef(null);
  const containerRef = useRef(null);
  const candidateQueueRef = useRef([]);
  const callIdRef = useRef(callData.callId);

  const isVideoCall = callData.type === 'video';

  // Keep callId ref in sync
  useEffect(() => {
    callIdRef.current = callData.callId;
  }, [callData.callId]);

  // Ringtone sound
  useEffect(() => {
    let stopRingtone = () => {};
    if (callStatus === 'incoming') {
      stopRingtone = startRingtoneAudio('incoming');
    } else if (callStatus === 'ringing') {
      stopRingtone = startRingtoneAudio('outgoing');
    }
    return () => stopRingtone();
  }, [callStatus]);

  // Setup local media stream
  const setupLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Voice/Video calls require browser media support');
      return null;
    }

    let stream = null;

    if (isVideoCall) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: { width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 }, facingMode: 'user' },
        });
      } catch (hdErr) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        } catch (basicVideoErr) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setIsVideoOff(true);
            toast('Camera unavailable — continuing with audio only', { icon: '🎙️' });
          } catch (audioErr) {
            toast.error('Please check microphone permissions');
            return null;
          }
        }
      }
    } else {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
      } catch (audioErr) {
        toast.error('Please check microphone permissions');
        return null;
      }
    }

    localStreamRef.current = stream;

    if (localVideoRef.current && isVideoCall && stream.getVideoTracks().length > 0) {
      localVideoRef.current.srcObject = stream;
    }

    return stream;
  }, [isVideoCall]);

  // Add local tracks to peer connection
  const addLocalTracksToPeer = useCallback((pc, stream) => {
    if (!pc || !stream) return;
    const existingSenders = pc.getSenders();
    stream.getTracks().forEach((track) => {
      const alreadyAdded = existingSenders.some(s => s.track === track);
      if (!alreadyAdded) {
        try {
          pc.addTrack(track, stream);
        } catch (err) {
          console.warn('Track add error:', err);
        }
      }
    });
  }, []);

  // Initialize WebRTC
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionRef.current = pc;

    // Monitor connection state for UI feedback
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      setConnectionState(state);
      if (state === 'failed') {
        toast.error('Call connection failed. Retrying...');
        // Attempt ICE restart
        try {
          pc.restartIce();
        } catch (e) {
          console.warn('ICE restart failed:', e);
        }
      }
      if (state === 'disconnected') {
        toast('Connection interrupted, reconnecting...', { icon: '🔄' });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        try { pc.restartIce(); } catch (e) {}
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('call:ice-candidate', {
          to: callData.targetUserId,
          candidate: event.candidate,
          callId: callIdRef.current,
        });
      }
    };

    // Handle remote stream
    pc.ontrack = (event) => {
      const stream = event.streams?.[0] || new MediaStream([event.track]);
      if (event.track.kind === 'video' && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
        remoteVideoRef.current.play().catch(() => {});
      }
      if (event.track.kind === 'audio' && remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.play().catch(() => {});
      }
    };

    // Handle server callId update (for caller)
    socket.on('call:ringing', ({ callId }) => {
      if (callId && onCallIdUpdate) {
        callIdRef.current = callId;
        onCallIdUpdate(callId);
      }
      setCallStatus('ringing');
    });

    // Caller: received acceptance → create offer
    socket.on('call:accepted', async () => {
      setCallStatus('ongoing');
      startTimer();
      try {
        const stream = await setupLocalStream();
        if (stream) addLocalTracksToPeer(pc, stream);

        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: isVideoCall,
        });
        await pc.setLocalDescription(offer);
        socket.emit('call:offer', {
          to: callData.targetUserId,
          offer,
          callId: callIdRef.current,
        });
      } catch (err) {
        console.error('Error creating offer:', err);
      }
    });

    // Receiver: got offer → create answer
    socket.on('call:offer', async ({ offer }) => {
      try {
        const stream = await setupLocalStream();
        if (stream) addLocalTracksToPeer(pc, stream);

        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        // Drain queued ICE candidates
        while (candidateQueueRef.current.length > 0) {
          const cand = candidateQueueRef.current.shift();
          try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call:answer', {
          to: callData.targetUserId,
          answer,
          callId: callIdRef.current,
        });
        setCallStatus('ongoing');
        startTimer();
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    });

    // Caller: got answer
    socket.on('call:answer', async ({ answer }) => {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        while (candidateQueueRef.current.length > 0) {
          const cand = candidateQueueRef.current.shift();
          try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
        }
      } catch (err) {
        console.error('Error setting remote description:', err);
      }
    });

    // ICE candidates
    socket.on('call:ice-candidate', async ({ candidate }) => {
      try {
        if (!candidate) return;
        if (pc.remoteDescription?.type) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          candidateQueueRef.current.push(candidate);
        }
      } catch (err) {
        console.warn('ICE candidate error:', err);
      }
    });

    socket.on('call:missed', () => { toast('User is not answering'); cleanupAndExit(); });
    socket.on('call:error', ({ error }) => { toast.error(error || 'Call failed'); cleanupAndExit(); });
    socket.on('call:rejected', () => { toast.error('Call declined'); cleanupAndExit(); });
    socket.on('call:ended', () => { toast('Call ended'); cleanupAndExit(); });
    socket.on('call:timeout', () => { toast('Call timed out'); cleanupAndExit(); });

    // Get local stream ready (but don't add to PC yet — that happens in offer/answer flow)
    setupLocalStream();

    return () => {
      socket.off('call:ringing');
      socket.off('call:accepted');
      socket.off('call:offer');
      socket.off('call:answer');
      socket.off('call:ice-candidate');
      socket.off('call:missed');
      socket.off('call:error');
      socket.off('call:rejected');
      socket.off('call:ended');
      socket.off('call:timeout');
      if (timerRef.current) clearInterval(timerRef.current);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} });
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} });
      }
      if (peerConnectionRef.current) {
        try { peerConnectionRef.current.close(); } catch (e) {}
      }
    };
  }, []);

  const startTimer = () => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  };

  const cleanupAndExit = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} });
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} });
      screenStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      try { peerConnectionRef.current.close(); } catch (e) {}
      peerConnectionRef.current = null;
    }
    onEndCall();
  };

  const handleAccept = async () => {
    const socket = getSocket();
    if (socket) {
      // Get stream ready BEFORE emitting accept
      const stream = await setupLocalStream();
      if (stream && peerConnectionRef.current) {
        addLocalTracksToPeer(peerConnectionRef.current, stream);
      }
      socket.emit('call:accept', { callId: callIdRef.current });
      setCallStatus('ongoing');
      startTimer();
    }
  };

  const handleReject = () => {
    const socket = getSocket();
    if (socket) socket.emit('call:reject', { callId: callIdRef.current });
    cleanupAndExit();
  };

  const handleEndCall = () => {
    const socket = getSocket();
    if (socket) socket.emit('call:end', { callId: callIdRef.current });
    cleanupAndExit();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const toggleSpeaker = () => {
    const newState = !isSpeakerOn;
    setIsSpeakerOn(newState);
    // Actually mute/unmute remote audio
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !newState;
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      const videoTrack = localStreamRef.current?.getVideoTracks()[0];
      if (videoTrack && peerConnectionRef.current) {
        const sender = peerConnectionRef.current.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack);
      }
      setIsScreenSharing(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        if (peerConnectionRef.current) {
          const sender = peerConnectionRef.current.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
        }
        screenTrack.onended = () => toggleScreenShare();
        setIsScreenSharing(true);
      } catch (err) {
        console.error('Screen sharing error:', err);
      }
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const formatTimer = (secs) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const connectionLabel = connectionState === 'connecting' ? 'Connecting...'
    : connectionState === 'disconnected' ? 'Reconnecting...'
    : connectionState === 'failed' ? 'Connection Failed'
    : null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-dark-bg/95 backdrop-blur-2xl flex flex-col items-center justify-between p-3 sm:p-6 animate-fade-in safe-top safe-bottom"
    >
      {/* Remote Audio */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Top bar */}
      <div className="w-full flex items-center justify-between text-surface-300 z-10 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full bg-accent-green animate-pulse flex-shrink-0" />
          <span className="text-xs sm:text-sm font-semibold tracking-wide text-white truncate">
            {isVideoCall ? 'Video Call' : 'Voice Call'}
          </span>
          {connectionLabel && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 flex items-center gap-1 flex-shrink-0">
              <WifiOff className="w-3 h-3" /> {connectionLabel}
            </span>
          )}
        </div>

        {callStatus === 'ongoing' && (
          <div className="flex items-center gap-2 bg-dark-card px-3 py-1 rounded-full border border-dark-border flex-shrink-0">
            <Radio className="w-3.5 h-3.5 text-accent-green animate-pulse" />
            <span className="text-xs sm:text-sm font-mono text-white font-medium">{formatTimer(callDuration)}</span>
          </div>
        )}

        <button
          onClick={toggleFullscreen}
          className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-dark-card hover:bg-dark-hover flex items-center justify-center border border-dark-border text-surface-400 hover:text-white transition-all flex-shrink-0"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Main Display Area */}
      <div className="relative w-full flex-1 flex items-center justify-center my-2 sm:my-4 overflow-hidden rounded-2xl sm:rounded-3xl border border-dark-border bg-dark-card/40 min-h-0">
        {isVideoCall ? (
          <>
            {/* Remote Video */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover rounded-2xl sm:rounded-3xl"
            />
            {/* Local Video Thumbnail — responsive sizing */}
            <div className="absolute bottom-3 right-3 sm:bottom-6 sm:right-6 w-24 h-32 sm:w-36 sm:h-48 md:w-48 md:h-64 rounded-xl sm:rounded-2xl overflow-hidden border-2 border-primary-500/60 shadow-2xl bg-black z-20">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : 'block'}`}
              />
              {isVideoOff && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-dark-card text-surface-500 text-xs">
                  <VideoOff className="w-5 h-5 mb-1" />
                  Camera off
                </div>
              )}
            </div>
          </>
        ) : (
          /* Voice Call Avatar */
          <div className="flex flex-col items-center gap-4 sm:gap-6 animate-scale-in px-4">
            <div className="relative">
              {callData.avatar?.url ? (
                <img
                  src={callData.avatar.url}
                  alt={callData.displayName}
                  className="w-24 h-24 sm:w-32 sm:h-32 rounded-full object-cover ring-4 ring-primary-500/40 shadow-2xl shadow-primary-500/30"
                />
              ) : (
                <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full gradient-primary flex items-center justify-center text-3xl sm:text-4xl font-bold text-white shadow-2xl shadow-primary-500/30">
                  {callData.displayName?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}
              {callStatus === 'ringing' && (
                <div className="absolute inset-0 rounded-full ring-4 ring-primary-400 animate-ping opacity-30" />
              )}
            </div>

            <div className="text-center">
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-1">{callData.displayName}</h3>
              <p className="text-surface-400 text-xs sm:text-sm">
                {callStatus === 'incoming' && 'Incoming Call...'}
                {callStatus === 'ringing' && 'Ringing...'}
                {callStatus === 'ongoing' && 'Connected'}
              </p>
            </div>

            {/* Waveform */}
            {callStatus === 'ongoing' && (
              <div className="flex items-center gap-1.5 h-10 px-6 py-2 rounded-2xl bg-dark-card border border-dark-border">
                {[4, 7, 9, 5, 8].map((h, i) => (
                  <div key={i} className={`w-1.5 rounded-full bg-primary-${400 + (i % 3) * 100} animate-wave`} style={{ height: `${h * 4}px`, animationDelay: `${0.1 + i * 0.08}s` }} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Control Buttons */}
      <div className="flex items-center justify-center z-10 w-full max-w-xl pb-1 flex-shrink-0">
        {callStatus === 'incoming' ? (
          <div className="flex items-center gap-6 sm:gap-8 animate-slide-up">
            <button
              onClick={handleReject}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-accent-red text-white flex items-center justify-center shadow-xl shadow-red-500/30 hover:scale-105 active:scale-95 transition-all"
              title="Decline"
            >
              <PhoneOff className="w-6 h-6 sm:w-7 sm:h-7" />
            </button>
            <button
              onClick={handleAccept}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-accent-green text-white flex items-center justify-center shadow-xl shadow-green-500/30 hover:scale-105 active:scale-95 transition-all animate-bounce-soft"
              title="Accept"
            >
              <Mic className="w-6 h-6 sm:w-7 sm:h-7" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 py-2.5 sm:py-3.5 rounded-2xl bg-dark-card border border-dark-border shadow-2xl">
            <button
              onClick={toggleMute}
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center transition-all ${
                isMuted ? 'bg-accent-red/20 text-accent-red border border-accent-red/30' : 'bg-dark-hover text-surface-200 hover:text-white border border-dark-border'
              }`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>

            {isVideoCall && (
              <button
                onClick={toggleVideo}
                className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center transition-all ${
                  isVideoOff ? 'bg-accent-red/20 text-accent-red border border-accent-red/30' : 'bg-dark-hover text-surface-200 hover:text-white border border-dark-border'
                }`}
                title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
              >
                {isVideoOff ? <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <VideoIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
            )}

            {isVideoCall && (
              <button
                onClick={toggleScreenShare}
                className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center transition-all hidden sm:flex ${
                  isScreenSharing ? 'bg-primary-500 text-white' : 'bg-dark-hover text-surface-200 hover:text-white border border-dark-border'
                }`}
                title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
              >
                {isScreenSharing ? <StopCircle className="w-4 h-4 sm:w-5 sm:h-5" /> : <ScreenShare className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
            )}

            <button
              onClick={toggleSpeaker}
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center transition-all border ${
                !isSpeakerOn ? 'bg-accent-red/20 text-accent-red border-accent-red/30' : 'bg-dark-hover text-surface-200 hover:text-white border-dark-border'
              }`}
              title="Speaker"
            >
              {isSpeakerOn ? <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" /> : <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>

            <button
              onClick={handleEndCall}
              className="w-12 h-10 sm:w-14 sm:h-12 rounded-xl bg-accent-red text-white flex items-center justify-center shadow-lg shadow-red-500/30 hover:bg-red-600 active:scale-95 transition-all"
              title="End Call"
            >
              <PhoneOff className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
