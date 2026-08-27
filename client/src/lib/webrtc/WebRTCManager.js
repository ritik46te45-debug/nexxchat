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
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
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
   * Fetch latest authenticated ICE servers from backend
   */
  async getIceConfiguration() {
    try {
      const { data } = await api.get('/calls/ice-servers');
      if (data?.config?.iceServers?.length > 0) {
        return data.config;
      }
    } catch (e) {
      console.warn('Using default ICE fallback servers:', e.message);
    }
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
        facingMode: this.activeFacingMode,
        deviceId: this.activeVideoDeviceId ? { exact: this.activeVideoDeviceId } : undefined,
      };

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: videoConstraints,
        });
      } catch (err) {
        // Fallback to basic video/audio if ideal HD fails
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints,
            video: true,
          });
        } catch (videoErr) {
          // Audio only fallback
          stream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints,
            video: false,
          });
          this.isVideo = false;
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

    // 1. Monitor Connection State
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(state);
      }

      if (state === 'connected') {
        this.qualityController.start(1500);
      } else if (state === 'failed') {
        this.attemptIceRestart();
      } else if (state === 'disconnected') {
        // Wait briefly for auto-recovery before triggering ICE restart
        setTimeout(() => {
          if (this.pc && (this.pc.connectionState === 'disconnected' || this.pc.connectionState === 'failed')) {
            this.attemptIceRestart();
          }
        }, 3000);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        this.attemptIceRestart();
      }
    };

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

      if (this.onRemoteStream) {
        this.onRemoteStream(stream, event.track);
      }
    };

    // Add local tracks to PeerConnection
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });
    }

    // Set Codec Preferences (Opus for Audio, VP9/VP8/H264 for Video)
    this.optimizeCodecPreferences();

    return pc;
  }

  /**
   * Codec Optimization: Prioritize Opus and VP9/VP8/H.264
   */
  optimizeCodecPreferences() {
    if (!this.pc) return;

    try {
      const transceivers = this.pc.getTransceivers ? this.pc.getTransceivers() : [];
      transceivers.forEach((transceiver) => {
        if (transceiver.setCodecPreferences && RTCRtpSender.getCapabilities) {
          const kind = transceiver.sender?.track?.kind || transceiver.receiver?.track?.kind;
          if (kind === 'audio') {
            const caps = RTCRtpSender.getCapabilities('audio');
            if (caps?.codecs) {
              const opus = caps.codecs.filter((c) => c.mimeType.toLowerCase() === 'audio/opus');
              const others = caps.codecs.filter((c) => c.mimeType.toLowerCase() !== 'audio/opus');
              transceiver.setCodecPreferences([...opus, ...others]);
            }
          } else if (kind === 'video') {
            const caps = RTCRtpSender.getCapabilities('video');
            if (caps?.codecs) {
              const vp9 = caps.codecs.filter((c) => c.mimeType.toLowerCase() === 'video/vp9');
              const vp8 = caps.codecs.filter((c) => c.mimeType.toLowerCase() === 'video/vp8');
              const h264 = caps.codecs.filter((c) => c.mimeType.toLowerCase() === 'video/h264');
              const others = caps.codecs.filter(
                (c) => !['video/vp9', 'video/vp8', 'video/h264'].includes(c.mimeType.toLowerCase())
              );
              transceiver.setCodecPreferences([...vp9, ...vp8, ...h264, ...others]);
            }
          }
        }
      });
    } catch (e) {
      console.warn('Codec optimization note:', e.message);
    }
  }

  /**
   * Tune Opus parameters in SDP
   */
  tuneAudioSDP(sdp) {
    if (!sdp) return sdp;
    // Optimize Opus for high speech clarity, in-band FEC, and 48kHz
    return sdp.replace(
      /a=fmtp:(\d+) minptime=\d+/g,
      'a=fmtp:$1 minptime=10;useinbandfec=1;maxaveragebitrate=64000;stereo=0'
    );
  }

  /**
   * Initiate Call Offer (Caller)
   */
  async createAndSendOffer(isIceRestart = false) {
    if (!this.pc) return;

    try {
      this.makingOffer = true;
      const offerOptions = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: this.isVideo,
        iceRestart: Boolean(isIceRestart),
      };

      const offer = await this.pc.createOffer(offerOptions);
      offer.sdp = this.tuneAudioSDP(offer.sdp);
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
    if (!this.pc) await this.initializePeerConnection();

    try {
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

      const answer = await this.pc.createAnswer();
      answer.sdp = this.tuneAudioSDP(answer.sdp);
      await this.pc.setLocalDescription(answer);

      this.socket.emit('call:answer', {
        to: this.targetUserId,
        answer,
        callId: this.callId,
      });
    } catch (err) {
      console.error('Error handling offer:', err);
    }
  }

  /**
   * Handle incoming Answer
   */
  async handleAnswer(answer) {
    if (!this.pc) return;

    try {
      this.isSettingRemoteAnswerPending = true;
      await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
      this.isSettingRemoteAnswerPending = false;
      await this.drainCandidateQueue();
    } catch (err) {
      console.error('Error setting remote answer:', err);
    }
  }

  /**
   * Handle incoming ICE Candidate
   */
  async handleIceCandidate(candidate) {
    if (!candidate) return;

    try {
      if (this.pc && this.pc.remoteDescription?.type) {
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

      // Re-attach audio analyzer
      this.audioAnalyzer.start(newAudioTrack, this.onWaveformUpdate, this.onSpeakingChange);
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
      const videoConstraints = {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 30 },
        facingMode: this.activeFacingMode,
        deviceId: deviceId ? { exact: deviceId } : undefined,
      };

      const newStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) return false;

      if (this.pc && !this.isScreenSharing) {
        const videoSender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(newVideoTrack);
        }
      }

      const oldTrack = this.localStream?.getVideoTracks()[0];
      if (oldTrack) oldTrack.stop();

      if (this.localStream) {
        if (oldTrack) this.localStream.removeTrack(oldTrack);
        this.localStream.addTrack(newVideoTrack);
      }

      return newVideoTrack;
    } catch (err) {
      console.error('Switch camera error:', err);
      return null;
    }
  }

  /**
   * Flip mobile camera (front <-> rear)
   */
  async flipCamera() {
    const nextFacing = this.activeFacingMode === 'user' ? 'environment' : 'user';
    return await this.switchCamera(null, nextFacing);
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
