/**
 * High-Quality Production-Grade WebRTC Connection Manager
 * Encapsulates RTCPeerConnection lifecycle, Perfect Negotiation,
 * codec optimization, mid-call device switching, screen sharing,
 * automatic connection recovery, and ICE restarts.
 */

import { AudioAnalyzer } from './AudioAnalyzer';
import { CallQualityController } from './CallQualityController';
import api from '../api';

const DEFAULT_ICE_CONFIG = {
  iceServers: [
    { urls: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun2.l.google.com:19302',
      'stun:stun3.l.google.com:19302',
      'stun:stun4.l.google.com:19302'
    ] },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceTransportPolicy: 'all',
};

export class WebRTCManager {
  constructor({
    socket,
    callId,
    targetUserId,
    isCaller,
    isVideo,
    onRemoteStream,
    onConnectionStateChange,
    onStatsUpdate,
    onSpeakingChange,
    onWaveformUpdate,
  }) {
    this.socket = socket;
    this.callId = callId;
    this.targetUserId = targetUserId;
    this.isCaller = isCaller;
    this.isPolite = !isCaller; // Polite peer in Perfect Negotiation
    this.isVideo = isVideo;

    // Callbacks
    this.onRemoteStream = onRemoteStream;
    this.onConnectionStateChange = onConnectionStateChange;
    this.onStatsUpdate = onStatsUpdate;
    this.onSpeakingChange = onSpeakingChange;
    this.onWaveformUpdate = onWaveformUpdate;

    // State
    this.pc = null;
    this.localStream = null;
    this.screenStream = null;
    this.remoteStream = null;
    this.candidateQueue = [];
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.isSettingRemoteAnswerPending = false;
    this.isScreenSharing = false;
    this.activeFacingMode = 'user';
    this.activeAudioDeviceId = null;
    this.activeVideoDeviceId = null;

    // Helpers
    this.audioAnalyzer = new AudioAnalyzer();
    this.qualityController = null;

    // Network status listener
    this.boundHandleOnline = this.handleNetworkOnline.bind(this);
    window.addEventListener('online', this.boundHandleOnline);
  }

  /**
   * Fetch latest authenticated ICE servers from backend (Instant 0ms with non-blocking refresh)
   */
  async getIceConfiguration() {
    if (WebRTCManager.cachedIceConfig) {
      return WebRTCManager.cachedIceConfig;
    }
    // Asynchronously cache for next calls without blocking current call setup
    api.get('/calls/ice-servers').then(({ data }) => {
      if (data?.config?.iceServers?.length > 0) {
        WebRTCManager.cachedIceConfig = data.config;
      }
    }).catch(() => {});

    return DEFAULT_ICE_CONFIG;
  }

  /**
   * Initialize Local Media Stream
   */
  async setupLocalMedia() {
    if (this.localStream) return this.localStream;

    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 48000,
      deviceId: this.activeAudioDeviceId ? { exact: this.activeAudioDeviceId } : undefined,
    };

    let stream = null;

    if (this.isVideo) {
      const videoConstraints = {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 30 },
        facingMode: this.activeFacingMode ? { ideal: this.activeFacingMode } : { ideal: 'user' },
        deviceId: this.activeVideoDeviceId ? { exact: this.activeVideoDeviceId } : undefined,
      };

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: videoConstraints,
        });
      } catch (err) {
        // Fallback to basic user-facing video if HD constraints fail
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints,
            video: { facingMode: 'user' },
          });
        } catch (videoErr) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: audioConstraints,
              video: true,
            });
          } catch (e) {
            // Audio only fallback if camera unavailable
            stream = await navigator.mediaDevices.getUserMedia({
              audio: audioConstraints,
              video: false,
            });
            this.isVideo = false;
          }
        }
      }
    } else {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });
    }

    this.localStream = stream;

    // Start Audio Analysis on local mic
    const micTrack = stream.getAudioTracks()[0];
    if (micTrack) {
      this.audioAnalyzer.start(
        micTrack,
        this.onWaveformUpdate,
        this.onSpeakingChange
      );
    }

    return stream;
  }

  /**
   * Create and configure RTCPeerConnection
   */
  async initializePeerConnection() {
    if (this.pc) return this.pc;

    const iceConfig = await this.getIceConfiguration();
    const pc = new RTCPeerConnection(iceConfig);
    this.pc = pc;

    // Attach Quality Controller
    this.qualityController = new CallQualityController(pc, this.onStatsUpdate);

    // 1. Monitor Connection & ICE State (dual check for immediate connection detection)
    const checkConnectedState = () => {
      const connState = pc.connectionState;
      const iceState = pc.iceConnectionState;

      if (connState === 'connected' || iceState === 'connected' || iceState === 'completed') {
        if (this.onConnectionStateChange) {
          this.onConnectionStateChange('connected');
        }
        this.qualityController.start(1500);
      } else if (connState === 'failed' || iceState === 'failed') {
        if (this.onConnectionStateChange) {
          this.onConnectionStateChange('failed');
        }
        this.attemptIceRestart();
      } else if (connState === 'disconnected' || iceState === 'disconnected') {
        if (this.onConnectionStateChange) {
          this.onConnectionStateChange('disconnected');
        }
        setTimeout(() => {
          if (this.pc && (this.pc.connectionState === 'disconnected' || this.pc.iceConnectionState === 'disconnected')) {
            this.attemptIceRestart();
          }
        }, 3000);
      } else if (connState === 'connecting' || iceState === 'checking') {
        if (this.onConnectionStateChange) {
          this.onConnectionStateChange('connecting');
        }
      }
    };

    pc.onconnectionstatechange = checkConnectedState;
    pc.oniceconnectionstatechange = checkConnectedState;

    // 2. ICE Candidates Dispatch
    pc.onicecandidate = ({ candidate }) => {
      if (candidate && this.socket) {
        this.socket.emit('call:ice-candidate', {
          to: this.targetUserId,
          candidate,
          callId: this.callId,
        });
      }
    };

    // 3. Remote Tracks Received
    pc.ontrack = (event) => {
      let stream = event.streams?.[0];
      if (!stream) {
        if (!this.remoteStream) this.remoteStream = new MediaStream();
        this.remoteStream.addTrack(event.track);
        stream = this.remoteStream;
      } else {
        this.remoteStream = stream;
      }

      if (this.onConnectionStateChange) {
        this.onConnectionStateChange('connected');
      }

      if (this.onRemoteStream) {
        this.onRemoteStream(stream, event.track);
      }
    };

    // Add local tracks to PeerConnection
    this.addLocalTracksToPeerConnection();

    return pc;
  }

  /**
   * Helper to ensure all local media tracks are attached to RTCPeerConnection
   */
  addLocalTracksToPeerConnection() {
    if (!this.pc || !this.localStream) return;
    const currentSenders = this.pc.getSenders ? this.pc.getSenders() : [];
    this.localStream.getTracks().forEach((track) => {
      const alreadyAdded = currentSenders.some(
        (s) => s.track === track || (s.track && s.track.id === track.id)
      );
      if (!alreadyAdded) {
        try {
          const sender = this.pc.addTrack(track, this.localStream);
          if (track.kind === 'video' && sender.setParameters) {
            const params = sender.getParameters();
            if (!params.encodings) params.encodings = [{}];
            params.encodings[0].maxBitrate = 1200000;
            params.encodings[0].maxFramerate = 30;
            sender.setParameters(params).catch(() => {});
          }
        } catch (e) {
          console.warn('Track add note:', e.message);
        }
      }
    });
  }

  /**
   * Initiate Call Offer (Caller)
   */
  async createAndSendOffer(isIceRestart = false) {
    if (!this.localStream) {
      await this.setupLocalMedia();
    }
    if (!this.pc) {
      await this.initializePeerConnection();
    }
    if (!this.pc) return;

    try {
      this.addLocalTracksToPeerConnection();
      this.makingOffer = true;

      const offerOptions = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: this.isVideo,
        iceRestart: Boolean(isIceRestart),
      };

      const offer = await this.pc.createOffer(offerOptions);
      await this.pc.setLocalDescription(offer);

      const eventName = isIceRestart ? 'call:renegotiate' : 'call:offer';
      this.socket.emit(eventName, {
        to: this.targetUserId,
        offer,
        callId: this.callId,
      });
    } catch (err) {
      console.error('Error creating offer:', err);
    } finally {
      this.makingOffer = false;
    }
  }

  /**
   * Handle incoming Offer (Receiver or Renegotiation)
   */
  async handleOffer(offer) {
    if (!this.localStream) {
      await this.setupLocalMedia();
    }
    if (!this.pc) {
      await this.initializePeerConnection();
    }
    if (!offer || !this.pc) return;

    try {
      this.addLocalTracksToPeerConnection();

      const readyForOffer =
        !this.makingOffer &&
        (this.pc.signalingState === 'stable' || this.isSettingRemoteAnswerPending);
      const offerCollision = !readyForOffer;

      this.ignoreOffer = !this.isPolite && offerCollision;
      if (this.ignoreOffer) {
        console.warn('Glare detected: Impolite peer ignoring collision offer');
        return;
      }

      await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
      await this.drainCandidateQueue();

      if (this.pc.remoteDescription?.type === 'offer' && this.pc.signalingState === 'have-remote-offer') {
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);

        this.socket.emit('call:answer', {
          to: this.targetUserId,
          answer,
          callId: this.callId,
        });
      }
    } catch (err) {
      console.error('Error handling offer:', err);
    }
  }

  /**
   * Handle incoming Answer
   */
  async handleAnswer(answer) {
    if (!this.pc || !answer) return;

    try {
      if (this.pc.signalingState !== 'have-local-offer') {
        console.warn('Ignoring answer in state:', this.pc.signalingState);
        return;
      }
      this.isSettingRemoteAnswerPending = true;
      await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
      await this.drainCandidateQueue();
    } catch (err) {
      console.error('Error setting remote answer:', err);
    } finally {
      this.isSettingRemoteAnswerPending = false;
    }
  }

  /**
   * Handle incoming ICE Candidate
   */
  async handleIceCandidate(candidate) {
    if (!candidate) return;

    try {
      if (this.pc && this.pc.remoteDescription?.type && this.pc.signalingState !== 'closed') {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        this.candidateQueue.push(candidate);
      }
    } catch (err) {
      console.warn('Error adding ICE candidate:', err);
    }
  }

  async drainCandidateQueue() {
    while (this.candidateQueue.length > 0) {
      const cand = this.candidateQueue.shift();
      try {
        if (this.pc) await this.pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        console.warn('Candidate queue drain note:', e.message);
      }
    }
  }

  /**
   * Connection Recovery: Attempt ICE Restart
   */
  async attemptIceRestart() {
    if (!this.pc || this.pc.connectionState === 'closed') return;

    try {
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange('reconnecting');
      }
      this.pc.restartIce();
      await this.createAndSendOffer(true);
    } catch (e) {
      console.warn('ICE restart attempt error:', e);
    }
  }

  handleNetworkOnline() {
    // Network changed (e.g. Wi-Fi connected or mobile switched)
    if (this.pc && this.pc.connectionState !== 'closed') {
      this.attemptIceRestart();
    }
  }

  /**
   * Set Audio Mute state
   */
  setAudioMuted(isMuted) {
    this.isAudioMuted = isMuted;

    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
    }

    if (this.pc) {
      this.pc.getSenders().forEach((sender) => {
        if (sender.track && sender.track.kind === 'audio') {
          sender.track.enabled = !isMuted;
        }
      });
    }

    if (isMuted) {
      this.audioAnalyzer.stop();
      if (this.onSpeakingChange) this.onSpeakingChange(false);
      if (this.onWaveformUpdate) this.onWaveformUpdate([10, 10, 10, 10, 10], 0);
    } else {
      const micTrack = this.localStream?.getAudioTracks()[0];
      if (micTrack) {
        this.audioAnalyzer.start(micTrack, this.onWaveformUpdate, this.onSpeakingChange);
      }
    }

    return isMuted;
  }

  /**
   * Set Video Disabled state
   */
  async setVideoDisabled(isDisabled) {
    this.isVideoDisabled = isDisabled;

    if (this.localStream) {
      const videoTracks = this.localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        videoTracks.forEach((track) => {
          track.enabled = !isDisabled;
        });
      } else if (!isDisabled) {
        // Video wasn't originally requested, dynamically capture camera track
        try {
          const vStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280, max: 1920 },
              height: { ideal: 720, max: 1080 },
              frameRate: { ideal: 30, max: 30 },
              facingMode: this.activeFacingMode ? { ideal: this.activeFacingMode } : { ideal: 'user' },
            },
          });
          const newVTrack = vStream.getVideoTracks()[0];
          if (newVTrack) {
            this.localStream.addTrack(newVTrack);
            if (this.pc) {
              const videoSender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
              if (videoSender) {
                await videoSender.replaceTrack(newVTrack);
              } else {
                this.pc.addTrack(newVTrack, this.localStream);
                await this.createAndSendOffer();
              }
            }
          }
        } catch (e) {
          console.warn('Turn on camera note:', e.message);
        }
      }
    }

    if (this.pc) {
      this.pc.getSenders().forEach((sender) => {
        if (sender.track && sender.track.kind === 'video') {
          sender.track.enabled = !isDisabled;
        }
      });
    }

    return isDisabled;
  }

  /**
   * In-Call Device Switching: Microphone
   */
  async switchMicrophone(deviceId) {
    this.activeAudioDeviceId = deviceId;
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          deviceId: { exact: deviceId },
        },
      });

      const newAudioTrack = newStream.getAudioTracks()[0];
      if (!newAudioTrack) return false;

      // Preserve current mute state on the new track
      if (this.isAudioMuted) {
        newAudioTrack.enabled = false;
      }

      // Replace track on RTCRtpSender without renegotiating
      if (this.pc) {
        const audioSender = this.pc.getSenders().find((s) => s.track?.kind === 'audio');
        if (audioSender) {
          await audioSender.replaceTrack(newAudioTrack);
        }
      }

      // Stop old audio track
      const oldTrack = this.localStream?.getAudioTracks()[0];
      if (oldTrack) oldTrack.stop();

      // Update local stream
      if (this.localStream) {
        this.localStream.removeTrack(oldTrack);
        this.localStream.addTrack(newAudioTrack);
      }

      // Re-attach audio analyzer if unmuted
      if (!this.isAudioMuted) {
        this.audioAnalyzer.start(newAudioTrack, this.onWaveformUpdate, this.onSpeakingChange);
      }
      return true;
    } catch (err) {
      console.error('Switch microphone error:', err);
      return false;
    }
  }

  /**
   * In-Call Device Switching: Camera
   */
  async switchCamera(deviceId, facingMode) {
    if (deviceId) this.activeVideoDeviceId = deviceId;
    if (facingMode) this.activeFacingMode = facingMode;

    try {
      // 1. Stop existing video track first to release hardware lock on mobile/laptops
      const oldTrack = this.localStream?.getVideoTracks()[0];
      if (oldTrack) {
        oldTrack.stop();
        if (this.localStream) this.localStream.removeTrack(oldTrack);
      }

      const videoConstraints = {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 30 },
        facingMode: this.activeFacingMode ? { ideal: this.activeFacingMode } : undefined,
        deviceId: deviceId ? { exact: deviceId } : undefined,
      };

      const newStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) return null;

      if (this.localStream) {
        this.localStream.addTrack(newVideoTrack);
      } else {
        this.localStream = newStream;
      }

      if (this.pc && !this.isScreenSharing) {
        const videoSender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(newVideoTrack);
        }
      }

      return newVideoTrack;
    } catch (err) {
      console.error('Switch camera error:', err);
      // Automatic fallback recovery
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const fallbackTrack = fallbackStream.getVideoTracks()[0];
        if (fallbackTrack) {
          if (this.localStream) this.localStream.addTrack(fallbackTrack);
          if (this.pc && !this.isScreenSharing) {
            const videoSender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
            if (videoSender) await videoSender.replaceTrack(fallbackTrack);
          }
          return fallbackTrack;
        }
      } catch (fallbackErr) {
        console.error('Camera fallback recovery failed:', fallbackErr);
      }
      return null;
    }
  }

  /**
   * Flip mobile camera (front <-> rear) or cycle laptop webcams
   */
  async flipCamera() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');

      let nextDeviceId = null;
      let nextFacing = this.activeFacingMode === 'user' ? 'environment' : 'user';

      if (videoDevices.length > 1) {
        const currentIdx = videoDevices.findIndex(
          (d) => d.deviceId === this.activeVideoDeviceId
        );
        const nextIdx = (currentIdx + 1) % videoDevices.length;
        nextDeviceId = videoDevices[nextIdx].deviceId;
      }

      return await this.switchCamera(nextDeviceId, nextFacing);
    } catch (e) {
      const nextFacing = this.activeFacingMode === 'user' ? 'environment' : 'user';
      return await this.switchCamera(null, nextFacing);
    }
  }

  /**
   * Screen Sharing
   */
  async startScreenShare(onEnded) {
    if (this.isScreenSharing) return true;

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always', frameRate: { ideal: 30, max: 30 } },
        audio: false,
      });

      this.screenStream = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) return false;

      this.isScreenSharing = true;

      // Replace video sender track
      if (this.pc) {
        const videoSender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(screenTrack);
        }
      }

      // Socket notification
      this.socket.emit('call:screen-share', {
        to: this.targetUserId,
        enabled: true,
        callId: this.callId,
      });

      screenTrack.onended = () => {
        this.stopScreenShare();
        if (onEnded) onEnded();
      };

      return screenStream;
    } catch (err) {
      console.error('Screen sharing error:', err);
      return null;
    }
  }

  async stopScreenShare() {
    if (!this.isScreenSharing) return;
    this.isScreenSharing = false;

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }

    // Restore camera video track on sender
    const cameraTrack = this.localStream?.getVideoTracks()[0];
    if (cameraTrack && this.pc) {
      const videoSender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(cameraTrack);
      }
    }

    if (this.socket) {
      this.socket.emit('call:screen-share', {
        to: this.targetUserId,
        enabled: false,
        callId: this.callId,
      });
    }
  }

  /**
   * Audio Output Sink Selection
   */
  async setAudioOutputDevice(audioElement, deviceId) {
    if (!audioElement || !('setSinkId' in audioElement)) return false;
    try {
      await audioElement.setSinkId(deviceId);
      return true;
    } catch (err) {
      console.warn('SetSinkId note:', err.message);
      return false;
    }
  }

  /**
   * Quality Mode Selector (Data Saver / High Quality)
   */
  setQualityMode(mode) {
    if (this.qualityController) {
      this.qualityController.setMode(mode);
    }
  }

  /**
   * Complete Clean Resource Teardown
   */
  destroy() {
    window.removeEventListener('online', this.boundHandleOnline);

    if (this.qualityController) {
      this.qualityController.stop();
      this.qualityController = null;
    }

    if (this.audioAnalyzer) {
      this.audioAnalyzer.stop();
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => {
        try { t.stop(); } catch (e) {}
      });
      this.localStream = null;
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => {
        try { t.stop(); } catch (e) {}
      });
      this.screenStream = null;
    }

    if (this.pc) {
      try {
        this.pc.ontrack = null;
        this.pc.onicecandidate = null;
        this.pc.onconnectionstatechange = null;
        this.pc.oniceconnectionstatechange = null;
        this.pc.close();
      } catch (e) {}
      this.pc = null;
    }

    this.candidateQueue = [];
    this.remoteStream = null;
  }
}
