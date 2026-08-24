import { useState, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff,
  ScreenShare, StopCircle, Maximize2, Minimize2, Volume2,
  VolumeX, RefreshCw, Radio
} from 'lucide-react';
import { getSocket } from '../../lib/socket';
import toast from 'react-hot-toast';

// STUN configuration for WebRTC NAT traversal
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

// Web Audio API Ringtone & Chime synthesizer (zero asset dependencies)
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
          // Melodious triple-chime for incoming calls
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
          osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12); // E5
          osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.25); // G5
          gain.gain.setValueAtTime(0.2, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.85);
        } else {
          // Smooth ringing tone for outgoing calls
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

export default function CallOverlay({ callData, isIncoming, onEndCall }) {
  const [callStatus, setCallStatus] = useState(isIncoming ? 'incoming' : 'ringing');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callData.type === 'voice');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [networkQuality, setNetworkQuality] = useState('good');
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

  const isVideoCall = callData.type === 'video';

  // Ringtone sound effect
  useEffect(() => {
    let stopRingtone = () => {};
    if (callStatus === 'incoming') {
      stopRingtone = startRingtoneAudio('incoming');
    } else if (callStatus === 'ringing') {
      stopRingtone = startRingtoneAudio('outgoing');
    }
    return () => {
      stopRingtone();
    };
  }, [callStatus]);

  // Setup local stream
  const setupLocalStream = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Voice/Video calls require browser media support');
      return null;
    }

    let stream = null;

    if (isVideoCall) {
      // 1. Try high-definition video + audio
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 }, facingMode: 'user' },
        });
      } catch (hdErr) {
        console.warn('HD video request failed, trying standard video:', hdErr);
        // 2. Try basic video + audio
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        } catch (basicVideoErr) {
          console.warn('Camera not accessible, falling back to microphone only:', basicVideoErr);
          // 3. Fallback to audio only
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setIsVideoOff(true);
            toast('Camera unavailable — continuing with audio only', { icon: '🎙️' });
          } catch (audioErr) {
            console.error('Microphone also not accessible:', audioErr);
            toast.error('Please check microphone permissions in your browser bar');
            return null;
          }
        }
      }
    } else {
      // Voice call: audio only
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (audioErr) {
        console.error('Audio stream error:', audioErr);
        toast.error('Please check microphone permissions in your browser bar');
        return null;
      }
    }

    localStreamRef.current = stream;

    if (localVideoRef.current && isVideoCall && stream.getVideoTracks().length > 0) {
      localVideoRef.current.srcObject = stream;
    }

    // Add tracks to PeerConnection
    if (peerConnectionRef.current && stream) {
      stream.getTracks().forEach((track) => {
        try {
          peerConnectionRef.current.addTrack(track, stream);
        } catch (trackErr) {
          console.warn('Track add error:', trackErr);
        }
      });
    }

    return stream;
  };

  // Initialize WebRTC
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Create RTCPeerConnection
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionRef.current = pc;

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('call:ice-candidate', {
          to: callData.targetUserId,
          candidate: event.candidate,
          callId: callData.callId,
        });
      }
    };

    // Handle remote stream tracks
    pc.ontrack = (event) => {
      console.log('📡 WebRTC remote track received:', event.track?.kind);
      const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);

      if (event.track.kind === 'video' && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
        remoteVideoRef.current.play().catch((e) => console.warn('Remote video playback note:', e));
      }
      if (event.track.kind === 'audio' && remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.play().catch((e) => console.warn('Remote audio playback note:', e));
      }
    };

    // Socket signaling listeners
    socket.on('call:ringing', () => {
      setCallStatus('ringing');
    });

    // Caller receives acceptance -> Send offer
    socket.on('call:accepted', async () => {
      setCallStatus('ongoing');
      startTimer();
      try {
        await setupLocalStream();
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: isVideoCall,
        });
        await pc.setLocalDescription(offer);
        socket.emit('call:offer', {
          to: callData.targetUserId,
          offer,
          callId: callData.callId,
        });
      } catch (err) {
        console.error('Error creating offer:', err);
      }
    });

    // Receiver receives offer -> Send answer
    socket.on('call:offer', async ({ offer }) => {
      try {
        await setupLocalStream();
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        // Drain queued ICE candidates
        while (candidateQueueRef.current.length > 0) {
          const cand = candidateQueueRef.current.shift();
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch (e) {}
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call:answer', {
          to: callData.targetUserId,
          answer,
          callId: callData.callId,
        });
        setCallStatus('ongoing');
        startTimer();
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    });

    // Caller receives answer -> Set remote description
    socket.on('call:answer', async ({ answer }) => {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));

        // Drain queued ICE candidates
        while (candidateQueueRef.current.length > 0) {
          const cand = candidateQueueRef.current.shift();
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch (e) {}
        }
      } catch (err) {
        console.error('Error setting remote description:', err);
      }
    });

    // Both receive ICE candidates
    socket.on('call:ice-candidate', async ({ candidate }) => {
      try {
        if (!candidate) return;
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          candidateQueueRef.current.push(candidate);
        }
      } catch (err) {
        console.warn('ICE candidate error:', err);
      }
    });

    socket.on('call:missed', () => {
      toast('User is not answering');
      cleanupAndExit();
    });

    socket.on('call:error', ({ error }) => {
      toast.error(error || 'Call failed');
      cleanupAndExit();
    });

    socket.on('call:rejected', () => {
      toast.error('Call declined');
      cleanupAndExit();
    });

    socket.on('call:ended', () => {
      toast('Call ended');
      cleanupAndExit();
    });

    socket.on('call:timeout', () => {
      toast('Call timed out');
      cleanupAndExit();
    });

    // Start local media stream immediately
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
        localStreamRef.current.getTracks().forEach((t) => {
          try { t.stop(); } catch (e) {}
        });
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => {
          try { t.stop(); } catch (e) {}
        });
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
      localStreamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch (e) {}
      });
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch (e) {}
      });
      screenStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      try { peerConnectionRef.current.close(); } catch (e) {}
      peerConnectionRef.current = null;
    }
    onEndCall();
  };

  const handleAccept = () => {
    const socket = getSocket();
    if (socket) {
      socket.emit('call:accept', { callId: callData.callId });
      setCallStatus('ongoing');
      startTimer();
    }
  };

  const handleReject = () => {
    const socket = getSocket();
    if (socket) {
      socket.emit('call:reject', { callId: callData.callId });
    }
    cleanupAndExit();
  };

  const handleEndCall = () => {
    const socket = getSocket();
    if (socket) {
      socket.emit('call:end', { callId: callData.callId });
    }
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

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // Stop screen share
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
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        }

        screenTrack.onended = () => {
          toggleScreenShare();
        };

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

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-dark-bg/95 backdrop-blur-2xl flex flex-col items-center justify-between p-6 animate-fade-in"
    >
      {/* Remote Audio (for voice/video) */}
      <audio ref={remoteAudioRef} autoPlay />

      {/* Top bar */}
      <div className="w-full flex items-center justify-between text-surface-300 z-10">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-accent-green animate-pulse" />
          <span className="text-sm font-semibold tracking-wide text-white">
            {isVideoCall ? 'WebRTC Video Call' : 'WebRTC Voice Call'}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-400 border border-primary-500/30">
            End-to-End P2P
          </span>
        </div>

        {callStatus === 'ongoing' && (
          <div className="flex items-center gap-2 bg-dark-card px-4 py-1.5 rounded-full border border-dark-border">
            <Radio className="w-4 h-4 text-accent-green animate-pulse" />
            <span className="text-sm font-mono text-white font-medium">{formatTimer(callDuration)}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={toggleFullscreen}
            className="w-10 h-10 rounded-xl bg-dark-card hover:bg-dark-hover flex items-center justify-center border border-dark-border text-surface-400 hover:text-white transition-all"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Main Display Area */}
      <div className="relative w-full flex-1 flex items-center justify-center my-4 overflow-hidden rounded-3xl border border-dark-border bg-dark-card/40">
        {isVideoCall ? (
          <>
            {/* Remote Video Stream */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover rounded-3xl"
            />

            {/* Local Video Thumbnail */}
            <div className="absolute bottom-6 right-6 w-36 h-52 sm:w-48 sm:h-64 rounded-2xl overflow-hidden border-2 border-primary-500/60 shadow-2xl bg-black z-20">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : 'block'}`}
              />
              {isVideoOff && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-dark-card text-surface-500 text-xs">
                  <VideoOff className="w-6 h-6 mb-1" />
                  Camera off
                </div>
              )}
            </div>
          </>
        ) : (
          /* Voice Call Avatar & Waveform */
          <div className="flex flex-col items-center gap-6 animate-scale-in">
            <div className="relative">
              {callData.avatar?.url ? (
                <img
                  src={callData.avatar.url}
                  alt={callData.displayName}
                  className="w-32 h-32 rounded-full object-cover ring-4 ring-primary-500/40 shadow-2xl shadow-primary-500/30"
                />
              ) : (
                <div className="w-32 h-32 rounded-full gradient-primary flex items-center justify-center text-4xl font-bold text-white shadow-2xl shadow-primary-500/30">
                  {callData.displayName?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}

              {/* Animated rings for ringing */}
              {callStatus === 'ringing' && (
                <div className="absolute inset-0 rounded-full ring-4 ring-primary-400 animate-ping opacity-30" />
              )}
            </div>

            <div className="text-center">
              <h3 className="text-2xl font-bold text-white mb-1">{callData.displayName}</h3>
              <p className="text-surface-400 text-sm">
                {callStatus === 'incoming' && 'Incoming Call...'}
                {callStatus === 'ringing' && 'Ringing...'}
                {callStatus === 'ongoing' && 'Connected'}
              </p>
            </div>

            {/* Speaking Waveform Animation */}
            {callStatus === 'ongoing' && (
              <div className="flex items-center gap-1.5 h-10 px-6 py-2 rounded-2xl bg-dark-card border border-dark-border">
                <div className="w-1.5 h-4 bg-primary-400 rounded-full animate-wave" style={{ animationDelay: '0.1s' }} />
                <div className="w-1.5 h-7 bg-primary-500 rounded-full animate-wave" style={{ animationDelay: '0.3s' }} />
                <div className="w-1.5 h-9 bg-primary-400 rounded-full animate-wave" style={{ animationDelay: '0.2s' }} />
                <div className="w-1.5 h-5 bg-primary-600 rounded-full animate-wave" style={{ animationDelay: '0.4s' }} />
                <div className="w-1.5 h-8 bg-primary-400 rounded-full animate-wave" style={{ animationDelay: '0.25s' }} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Control Buttons Footer */}
      <div className="flex items-center justify-center gap-4 z-10 w-full max-w-xl pb-2">
        {callStatus === 'incoming' ? (
          /* Accept / Decline */
          <div className="flex items-center gap-8 animate-slide-up">
            <button
              onClick={handleReject}
              className="w-16 h-16 rounded-full bg-accent-red text-white flex items-center justify-center shadow-xl shadow-red-500/30 hover:scale-105 active:scale-95 transition-all"
              title="Decline"
            >
              <PhoneOff className="w-7 h-7" />
            </button>
            <button
              onClick={handleAccept}
              className="w-16 h-16 rounded-full bg-accent-green text-white flex items-center justify-center shadow-xl shadow-green-500/30 hover:scale-105 active:scale-95 transition-all animate-bounce-soft"
              title="Accept"
            >
              <Mic className="w-7 h-7" />
            </button>
          </div>
        ) : (
          /* Ongoing Call Controls */
          <div className="flex items-center gap-3 sm:gap-5 px-6 py-3.5 rounded-2xl bg-dark-card border border-dark-border shadow-2xl">
            {/* Mic Toggle */}
            <button
              onClick={toggleMute}
              className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                isMuted
                  ? 'bg-accent-red/20 text-accent-red border border-accent-red/30'
                  : 'bg-dark-hover text-surface-200 hover:text-white border border-dark-border'
              }`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* Video Toggle (if video call) */}
            {isVideoCall && (
              <button
                onClick={toggleVideo}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                  isVideoOff
                    ? 'bg-accent-red/20 text-accent-red border border-accent-red/30'
                    : 'bg-dark-hover text-surface-200 hover:text-white border border-dark-border'
                }`}
                title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
              >
                {isVideoOff ? <VideoOff className="w-5 h-5" /> : <VideoIcon className="w-5 h-5" />}
              </button>
            )}

            {/* Screen Sharing (if video call) */}
            {isVideoCall && (
              <button
                onClick={toggleScreenShare}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                  isScreenSharing
                    ? 'bg-primary-500 text-white'
                    : 'bg-dark-hover text-surface-200 hover:text-white border border-dark-border'
                }`}
                title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
              >
                {isScreenSharing ? <StopCircle className="w-5 h-5" /> : <ScreenShare className="w-5 h-5" />}
              </button>
            )}

            {/* Speaker Toggle */}
            <button
              onClick={() => setIsSpeakerOn(!isSpeakerOn)}
              className="w-12 h-12 rounded-xl bg-dark-hover text-surface-200 hover:text-white border border-dark-border flex items-center justify-center transition-all"
              title="Speaker"
            >
              {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>

            {/* End Call Button */}
            <button
              onClick={handleEndCall}
              className="w-14 h-12 rounded-xl bg-accent-red text-white flex items-center justify-center shadow-lg shadow-red-500/30 hover:bg-red-600 active:scale-95 transition-all"
              title="End Call"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
