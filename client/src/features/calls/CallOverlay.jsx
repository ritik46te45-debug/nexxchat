import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff,
  ScreenShare, StopCircle, Maximize2, Minimize2, Volume2,
  VolumeX, Radio, Wifi, WifiOff, Activity, RefreshCw,
  Camera, Settings, Sparkles, Check, ChevronDown, PictureInPicture
} from 'lucide-react';
import { getSocket } from '../../lib/socket';
import { WebRTCManager } from '../../lib/webrtc/WebRTCManager';
import ConnectionInfoModal from './ConnectionInfoModal';
import toast from 'react-hot-toast';

// Web Audio API Ringtone generator
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
        console.warn('Ringtone tone note:', err);
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
  const [callStatus, setCallStatus] = useState(isIncoming ? 'incoming' : 'calling');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callData.type === 'voice');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRemoteScreenSharing, setIsRemoteScreenSharing] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [connectionState, setConnectionState] = useState('new');
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [stats, setStats] = useState(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const [qualityMode, setQualityMode] = useState('auto'); // 'auto' | 'saver' | 'high'

  // Device lists
  const [devices, setDevices] = useState({ audioInputs: [], videoInputs: [], audioOutputs: [] });
  const [selectedAudioId, setSelectedAudioId] = useState('');
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState('');

  // Audio VAD & Waveform
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [waveformBars, setWaveformBars] = useState([20, 35, 45, 30, 20]);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const containerRef = useRef(null);
  const timerRef = useRef(null);
  const webrtcManagerRef = useRef(null);
  const callIdRef = useRef(callData.callId);

  const isVideoCall = callData.type === 'video';

  useEffect(() => {
    callIdRef.current = callData.callId;
  }, [callData.callId]);

  // Load available devices
  const loadDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const deviceList = await navigator.mediaDevices.enumerateDevices();
      setDevices({
        audioInputs: deviceList.filter((d) => d.kind === 'audioinput'),
        videoInputs: deviceList.filter((d) => d.kind === 'videoinput'),
        audioOutputs: deviceList.filter((d) => d.kind === 'audiooutput'),
      });
    } catch (e) {
      console.warn('Enumerate devices note:', e.message);
    }
  }, []);

  useEffect(() => {
    loadDevices();
    navigator.mediaDevices?.addEventListener('devicechange', loadDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', loadDevices);
    };
  }, [loadDevices]);

  // Ringtone synthesizer
  useEffect(() => {
    let stopRingtone = () => {};
    if (callStatus === 'incoming') {
      stopRingtone = startRingtoneAudio('incoming');
    } else if (callStatus === 'calling' || callStatus === 'ringing') {
      stopRingtone = startRingtoneAudio('outgoing');
    }
    return () => stopRingtone();
  }, [callStatus]);

  // Timer
  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  const cleanupAndExit = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.destroy();
      webrtcManagerRef.current = null;
    }
    onEndCall();
  }, [onEndCall]);

  // Initialize WebRTC Manager & Socket Signaling
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const manager = new WebRTCManager({
      socket,
      callId: callIdRef.current,
      targetUserId: callData.targetUserId,
      isCaller: !isIncoming,
      isVideo: isVideoCall,
      onRemoteStream: (stream, track) => {
        if (track.kind === 'video' && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          remoteVideoRef.current.play().catch(() => {});
        }
        if (track.kind === 'audio' && remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream;
          remoteAudioRef.current.play().catch(() => {});
        }
      },
      onConnectionStateChange: (state) => {
        setConnectionState(state);
        if (state === 'connected') {
          setCallStatus('ongoing');
          startTimer();
        }
      },
      onStatsUpdate: (metrics) => {
        setStats(metrics);
      },
      onSpeakingChange: (speaking) => {
        setIsSpeaking(speaking);
      },
      onWaveformUpdate: (bars) => {
        setWaveformBars(bars);
      },
    });

    webrtcManagerRef.current = manager;

    // Caller initiates media preparation immediately
    if (!isIncoming) {
      manager.setupLocalMedia().then((stream) => {
        if (stream && localVideoRef.current && isVideoCall) {
          localVideoRef.current.srcObject = stream;
        }
      });
    }

    // Socket listeners
    const onRinging = ({ callId }) => {
      if (callId && onCallIdUpdate) {
        callIdRef.current = callId;
        manager.callId = callId;
        onCallIdUpdate(callId);
      }
      setCallStatus('ringing');
    };

    const onAccepted = async ({ callId }) => {
      if (callId) {
        callIdRef.current = callId;
        manager.callId = callId;
      }
      setCallStatus('connecting');
      await manager.initializePeerConnection();
      await manager.createAndSendOffer();
    };

    const onOffer = async ({ offer, callId }) => {
      if (callId) {
        callIdRef.current = callId;
        manager.callId = callId;
      }
      await manager.handleOffer(offer);
    };

    const onAnswer = async ({ answer }) => {
      await manager.handleAnswer(answer);
    };

    const onIceCandidate = async ({ candidate }) => {
      await manager.handleIceCandidate(candidate);
    };

    const onRenegotiate = async ({ offer }) => {
      await manager.handleOffer(offer);
    };

    const onIceRestart = async () => {
      await manager.attemptIceRestart();
    };

    const onScreenShare = ({ enabled }) => {
      setIsRemoteScreenSharing(Boolean(enabled));
      toast(enabled ? 'Remote screen sharing started' : 'Remote screen sharing ended', { icon: '🖥️' });
    };

    const onBusy = () => {
      toast.error('User is currently on another call');
      cleanupAndExit();
    };

    const onRejected = () => {
      toast.error('Call declined');
      cleanupAndExit();
    };

    const onEnded = () => {
      toast('Call ended');
      cleanupAndExit();
    };

    const onTimeout = () => {
      toast('Call timed out — no answer');
      cleanupAndExit();
    };

    const onError = ({ error }) => {
      toast.error(error || 'Call error');
      cleanupAndExit();
    };

    socket.on('call:ringing', onRinging);
    socket.on('call:accepted', onAccepted);
    socket.on('call:offer', onOffer);
    socket.on('call:answer', onAnswer);
    socket.on('call:ice-candidate', onIceCandidate);
    socket.on('call:renegotiate', onRenegotiate);
    socket.on('call:ice-restart', onIceRestart);
    socket.on('call:screen-share', onScreenShare);
    socket.on('call:busy', onBusy);
    socket.on('call:rejected', onRejected);
    socket.on('call:ended', onEnded);
    socket.on('call:timeout', onTimeout);
    socket.on('call:error', onError);

    return () => {
      socket.off('call:ringing', onRinging);
      socket.off('call:accepted', onAccepted);
      socket.off('call:offer', onOffer);
      socket.off('call:answer', onAnswer);
      socket.off('call:ice-candidate', onIceCandidate);
      socket.off('call:renegotiate', onRenegotiate);
      socket.off('call:ice-restart', onIceRestart);
      socket.off('call:screen-share', onScreenShare);
      socket.off('call:busy', onBusy);
      socket.off('call:rejected', onRejected);
      socket.off('call:ended', onEnded);
      socket.off('call:timeout', onTimeout);
      socket.off('call:error', onError);
      manager.destroy();
    };
  }, [callData.targetUserId, isIncoming, isVideoCall, onCallIdUpdate, startTimer, cleanupAndExit]);

  // Answer call (Receiver)
  const handleAccept = async () => {
    const socket = getSocket();
    if (!socket || !webrtcManagerRef.current) return;

    setCallStatus('connecting');
    const manager = webrtcManagerRef.current;
    const stream = await manager.setupLocalMedia();

    if (stream && localVideoRef.current && isVideoCall) {
      localVideoRef.current.srcObject = stream;
    }

    await manager.initializePeerConnection();
    socket.emit('call:accept', { callId: callIdRef.current });
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

  // Track toggles
  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    const manager = webrtcManagerRef.current;
    if (manager) {
      manager.setAudioMuted(nextMuted);
    }

    toast(nextMuted ? 'Microphone muted' : 'Microphone unmuted', {
      icon: nextMuted ? '🔇' : '🎙️',
      duration: 1500,
    });
  };

  const toggleVideo = async () => {
    const nextVideoOff = !isVideoOff;
    setIsVideoOff(nextVideoOff);

    const manager = webrtcManagerRef.current;
    if (manager) {
      await manager.setVideoDisabled(nextVideoOff);
      if (!nextVideoOff && localVideoRef.current && manager.localStream) {
        localVideoRef.current.srcObject = manager.localStream;
        localVideoRef.current.play().catch(() => {});
      }
    }

    toast(nextVideoOff ? 'Camera turned off' : 'Camera turned on', {
      icon: nextVideoOff ? '📷' : '🎥',
      duration: 1500,
    });
  };

  const toggleSpeaker = () => {
    const newState = !isSpeakerOn;
    setIsSpeakerOn(newState);
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !newState;
    }
  };

  const toggleScreenShare = async () => {
    const manager = webrtcManagerRef.current;
    if (!manager) return;

    if (isScreenSharing) {
      await manager.stopScreenShare();
      setIsScreenSharing(false);
    } else {
      const screenStream = await manager.startScreenShare(() => {
        setIsScreenSharing(false);
      });
      if (screenStream) {
        setIsScreenSharing(true);
      }
    }
  };

  const flipCamera = async () => {
    const manager = webrtcManagerRef.current;
    if (!manager) return;
    const newTrack = await manager.flipCamera();
    if (newTrack && localVideoRef.current) {
      localVideoRef.current.srcObject = new MediaStream([newTrack]);
    }
    toast('Camera flipped', { icon: '🔄' });
  };

  const handleSwitchMic = async (deviceId) => {
    setSelectedAudioId(deviceId);
    const manager = webrtcManagerRef.current;
    if (manager) {
      const ok = await manager.switchMicrophone(deviceId);
      if (ok) toast.success('Microphone switched');
    }
  };

  const handleSwitchCamera = async (deviceId) => {
    setSelectedVideoId(deviceId);
    const manager = webrtcManagerRef.current;
    if (manager) {
      const newTrack = await manager.switchCamera(deviceId);
      if (newTrack && localVideoRef.current) {
        localVideoRef.current.srcObject = new MediaStream([newTrack]);
        toast.success('Camera switched');
      }
    }
  };

  const handleSwitchSpeaker = async (deviceId) => {
    setSelectedSpeakerId(deviceId);
    const manager = webrtcManagerRef.current;
    if (manager && remoteAudioRef.current) {
      const ok = await manager.setAudioOutputDevice(remoteAudioRef.current, deviceId);
      if (ok) toast.success('Speaker output switched');
    }
  };

  const handleChangeQualityMode = (mode) => {
    setQualityMode(mode);
    const manager = webrtcManagerRef.current;
    if (manager) {
      manager.setQualityMode(mode);
      toast.success(mode === 'saver' ? 'Data Saver mode enabled' : mode === 'high' ? 'High Quality mode enabled' : 'Auto Adaptive mode enabled');
    }
  };

  const togglePiP = async () => {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (remoteVideoRef.current) {
      try {
        await remoteVideoRef.current.requestPictureInPicture();
      } catch (e) {
        toast.error('Picture-in-Picture not supported');
      }
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  const formatTimer = (secs) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const getStatusBadge = () => {
    if (connectionState === 'reconnecting') {
      return { text: 'Reconnecting...', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' };
    }
    if (connectionState === 'failed') {
      return { text: 'Connection Failed', color: 'bg-accent-red/20 text-accent-red border-accent-red/30' };
    }
    if (callStatus === 'ongoing') {
      if (stats?.rating === 'poor') {
        return { text: 'Poor (Audio Priority)', color: 'bg-accent-red/20 text-accent-red border-accent-red/30' };
      }
      return { text: 'Connected (HD)', color: 'bg-accent-green/20 text-accent-green border-accent-green/30' };
    }
    if (callStatus === 'connecting') return { text: 'Connecting...', color: 'bg-primary-500/20 text-primary-400 border-primary-500/30' };
    if (callStatus === 'ringing') return { text: 'Ringing...', color: 'bg-primary-500/20 text-primary-400 border-primary-500/30' };
    return { text: 'Calling...', color: 'bg-surface-800 text-surface-400 border-surface-700' };
  };

  const statusBadge = getStatusBadge();

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-dark-bg/98 backdrop-blur-2xl flex flex-col items-center justify-between p-3 sm:p-5 animate-fade-in select-none safe-top safe-bottom"
    >
      {/* Remote Audio Track (always autoPlay) */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Top Header Bar */}
      <div className="w-full flex items-center justify-between z-10 flex-shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2.5 h-2.5 rounded-full ${callStatus === 'ongoing' ? 'bg-accent-green animate-pulse' : 'bg-primary-400'}`} />
          <span className="text-xs sm:text-sm font-bold tracking-wide text-white truncate">
            {isVideoCall ? 'Video Call' : 'Voice Call'}
          </span>

          {/* Connection Status Badge */}
          <span className={`text-[10px] sm:text-[11px] px-2.5 py-0.5 rounded-full font-semibold border flex items-center gap-1 ${statusBadge.color}`}>
            {connectionState === 'reconnecting' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}
            {statusBadge.text}
          </span>
        </div>

        {/* Live Call Duration */}
        {callStatus === 'ongoing' && (
          <div className="flex items-center gap-1.5 bg-dark-card/90 px-3 py-1 rounded-full border border-dark-border shadow-sm">
            <Radio className="w-3.5 h-3.5 text-accent-green animate-pulse" />
            <span className="text-xs sm:text-sm font-mono text-white font-bold">{formatTimer(callDuration)}</span>
          </div>
        )}

        {/* Header Actions: Stats Diagnostics, Device Settings, Fullscreen */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Stats Button */}
          {callStatus === 'ongoing' && (
            <button
              onClick={() => setShowStatsModal(true)}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-dark-card hover:bg-dark-hover flex items-center justify-center border border-dark-border text-surface-400 hover:text-primary-400 transition-all"
              title="Connection Stats & Metrics"
            >
              <Activity className="w-4 h-4" />
            </button>
          )}

          {/* In-Call Settings Menu */}
          <div className="relative">
            <button
              onClick={() => setShowDeviceMenu(!showDeviceMenu)}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-dark-card hover:bg-dark-hover flex items-center justify-center border border-dark-border text-surface-400 hover:text-white transition-all"
              title="Device Settings & Quality"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Device Selector Popover */}
            {showDeviceMenu && (
              <div className="absolute right-0 top-11 w-72 bg-dark-card border border-dark-border rounded-3xl p-3.5 shadow-2xl z-50 animate-scale-in space-y-3">
                <div className="flex items-center justify-between border-b border-dark-border pb-2">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Call Settings</h4>
                  <button onClick={() => setShowDeviceMenu(false)} className="text-surface-400 hover:text-white">
                    ✕
                  </button>
                </div>

                {/* Quality Mode */}
                <div>
                  <label className="text-[10px] font-bold text-surface-400 uppercase tracking-wider block mb-1">Quality Mode</label>
                  <div className="grid grid-cols-3 gap-1 bg-dark-input p-1 rounded-xl border border-dark-border text-[11px]">
                    {['auto', 'saver', 'high'].map((m) => (
                      <button
                        key={m}
                        onClick={() => handleChangeQualityMode(m)}
                        className={`py-1 rounded-lg font-semibold capitalize transition-all ${
                          qualityMode === m ? 'bg-primary-500 text-white shadow-sm' : 'text-surface-400 hover:text-white'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Microphones */}
                {devices.audioInputs.length > 0 && (
                  <div>
                    <label className="text-[10px] font-bold text-surface-400 uppercase tracking-wider block mb-1">Microphone</label>
                    <select
                      value={selectedAudioId}
                      onChange={(e) => handleSwitchMic(e.target.value)}
                      className="w-full bg-dark-input border border-dark-border text-white text-xs p-2 rounded-xl focus:outline-none"
                    >
                      {devices.audioInputs.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Microphone ${d.deviceId.slice(0, 5)}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Cameras */}
                {isVideoCall && devices.videoInputs.length > 0 && (
                  <div>
                    <label className="text-[10px] font-bold text-surface-400 uppercase tracking-wider block mb-1">Camera</label>
                    <select
                      value={selectedVideoId}
                      onChange={(e) => handleSwitchCamera(e.target.value)}
                      className="w-full bg-dark-input border border-dark-border text-white text-xs p-2 rounded-xl focus:outline-none"
                    >
                      {devices.videoInputs.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Camera ${d.deviceId.slice(0, 5)}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Speaker Audio Output */}
                {devices.audioOutputs.length > 0 && (
                  <div>
                    <label className="text-[10px] font-bold text-surface-400 uppercase tracking-wider block mb-1">Audio Output</label>
                    <select
                      value={selectedSpeakerId}
                      onChange={(e) => handleSwitchSpeaker(e.target.value)}
                      className="w-full bg-dark-input border border-dark-border text-white text-xs p-2 rounded-xl focus:outline-none"
                    >
                      {devices.audioOutputs.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Speaker ${d.deviceId.slice(0, 5)}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={toggleFullscreen}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-dark-card hover:bg-dark-hover flex items-center justify-center border border-dark-border text-surface-400 hover:text-white transition-all"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Display Area */}
      <div className="relative w-full flex-1 flex items-center justify-center my-2 sm:my-3 overflow-hidden rounded-3xl border border-dark-border bg-dark-card/40 min-h-0">
        {isVideoCall ? (
          <>
            {/* Remote Video Stream */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={`w-full h-full ${isRemoteScreenSharing ? 'object-contain' : 'object-cover'} rounded-3xl bg-black`}
            />

            {/* Local Video Picture-in-Picture Thumbnail */}
            <div className="absolute bottom-3 right-3 sm:bottom-5 sm:right-5 w-28 h-36 sm:w-40 sm:h-52 rounded-2xl overflow-hidden border-2 border-primary-500/70 shadow-2xl bg-black z-20 transition-all">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : 'block'}`}
              />
              {isVideoOff && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-dark-card text-surface-400 text-xs">
                  <VideoOff className="w-5 h-5 mb-1 text-accent-red" />
                  Camera off
                </div>
              )}
            </div>
          </>
        ) : (
          /* Voice Call Center Avatar with Live Speaking Glow */
          <div className="flex flex-col items-center gap-4 sm:gap-6 animate-scale-in px-4">
            <div className="relative">
              {callData.avatar?.url ? (
                <img
                  src={callData.avatar.url}
                  alt={callData.displayName}
                  className={`w-28 h-28 sm:w-36 sm:h-36 rounded-full object-cover ring-4 shadow-2xl transition-all duration-300 ${
                    isSpeaking
                      ? 'ring-accent-green shadow-accent-green/40 scale-105'
                      : 'ring-primary-500/40 shadow-primary-500/30'
                  }`}
                />
              ) : (
                <div
                  className={`w-28 h-28 sm:w-36 sm:h-36 rounded-full gradient-primary flex items-center justify-center text-4xl sm:text-5xl font-bold text-white shadow-2xl transition-all duration-300 ${
                    isSpeaking
                      ? 'ring-4 ring-accent-green shadow-accent-green/40 scale-105'
                      : 'shadow-primary-500/30'
                  }`}
                >
                  {callData.displayName?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}

              {/* Ping Ring for Ringing / Calling */}
              {(callStatus === 'ringing' || callStatus === 'calling') && (
                <div className="absolute inset-0 rounded-full ring-4 ring-primary-400 animate-ping opacity-30 pointer-events-none" />
              )}
            </div>

            <div className="text-center">
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-1">{callData.displayName}</h3>
              <p className="text-surface-400 text-xs sm:text-sm">
                {callStatus === 'incoming' && 'Incoming Call...'}
                {callStatus === 'calling' && 'Calling...'}
                {callStatus === 'ringing' && 'Ringing...'}
                {callStatus === 'connecting' && 'Connecting WebRTC...'}
                {callStatus === 'ongoing' && (isSpeaking ? 'Speaking...' : 'Connected')}
              </p>
            </div>

            {/* Live Reacting Web Audio Waveform */}
            {callStatus === 'ongoing' && (
              <div className="flex items-center gap-1.5 h-10 px-5 py-2 rounded-2xl bg-dark-card border border-dark-border shadow-inner">
                {waveformBars.map((height, i) => (
                  <div
                    key={i}
                    className="w-1.5 rounded-full bg-gradient-to-t from-primary-600 to-primary-400 transition-all duration-75"
                    style={{ height: `${Math.max(6, (height / 100) * 28)}px` }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Control Bar */}
      <div className="flex items-center justify-center z-10 w-full max-w-xl pb-1 flex-shrink-0">
        {callStatus === 'incoming' ? (
          <div className="flex items-center gap-6 sm:gap-8 animate-slide-up">
            <button
              onClick={handleReject}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-accent-red text-white flex items-center justify-center shadow-xl shadow-red-500/30 hover:scale-105 active:scale-95 transition-all cursor-pointer"
              title="Decline"
            >
              <PhoneOff className="w-6 h-6 sm:w-7 sm:h-7" />
            </button>
            <button
              onClick={handleAccept}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-accent-green text-white flex items-center justify-center shadow-xl shadow-green-500/30 hover:scale-105 active:scale-95 transition-all animate-bounce-soft cursor-pointer"
              title="Accept"
            >
              <Mic className="w-6 h-6 sm:w-7 sm:h-7" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5 sm:gap-3 px-2.5 sm:px-6 py-2 sm:py-3.5 rounded-3xl bg-dark-card/90 backdrop-blur-xl border border-dark-border shadow-2xl overflow-x-auto max-w-full hide-scrollbar">
            {/* Mic Toggle */}
            <button
              onClick={toggleMute}
              className={`w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all flex-shrink-0 ${
                isMuted ? 'bg-accent-red/20 text-accent-red border border-accent-red/30' : 'bg-dark-hover text-surface-200 hover:text-white border border-dark-border'
              }`}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>

            {/* Video Toggle */}
            {isVideoCall && (
              <button
                onClick={toggleVideo}
                className={`w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all flex-shrink-0 ${
                  isVideoOff ? 'bg-accent-red/20 text-accent-red border border-accent-red/30' : 'bg-dark-hover text-surface-200 hover:text-white border border-dark-border'
                }`}
                title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
              >
                {isVideoOff ? <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <VideoIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
            )}

            {/* Mobile Camera Flip */}
            {isVideoCall && (
              <button
                onClick={flipCamera}
                className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-dark-hover text-surface-200 hover:text-white border border-dark-border flex items-center justify-center transition-all flex-shrink-0"
                title="Flip Camera (Front / Rear)"
              >
                <Camera className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}

            {/* Screen Share (Visible on all screens including Mobile) */}
            {isVideoCall && (
              <button
                onClick={toggleScreenShare}
                className={`w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all flex-shrink-0 ${
                  isScreenSharing ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/30' : 'bg-dark-hover text-surface-200 hover:text-white border border-dark-border'
                }`}
                title={isScreenSharing ? 'Stop screen sharing' : 'Share screen'}
              >
                {isScreenSharing ? <StopCircle className="w-4 h-4 sm:w-5 sm:h-5" /> : <ScreenShare className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
            )}

            {/* PiP button for Video (Visible on all screens including Mobile) */}
            {isVideoCall && (
              <button
                onClick={togglePiP}
                className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-dark-hover text-surface-200 hover:text-white border border-dark-border flex items-center justify-center transition-all flex-shrink-0"
                title="Picture in Picture"
              >
                <PictureInPicture className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}

            {/* Speaker Output Mute/Unmute */}
            <button
              onClick={toggleSpeaker}
              className={`w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all border flex-shrink-0 ${
                !isSpeakerOn ? 'bg-accent-red/20 text-accent-red border-accent-red/30' : 'bg-dark-hover text-surface-200 hover:text-white border border-dark-border'
              }`}
              title="Speaker Audio"
            >
              {isSpeakerOn ? <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" /> : <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>

            {/* End Call Button */}
            <button
              onClick={handleEndCall}
              className="w-11 h-9 sm:w-14 sm:h-12 rounded-xl sm:rounded-2xl bg-accent-red text-white flex items-center justify-center shadow-lg shadow-red-500/30 hover:bg-red-600 active:scale-95 transition-all cursor-pointer flex-shrink-0 ml-0.5"
              title="End Call"
            >
              <PhoneOff className="w-4 h-4 sm:w-6 sm:h-6" />
            </button>
          </div>
        )}
      </div>

      {/* Connection Info Modal */}
      {showStatsModal && (
        <ConnectionInfoModal
          stats={stats}
          onClose={() => setShowStatsModal(false)}
        />
      )}
    </div>
  );
}
