/**
 * Real-Time WebRTC Call Quality Controller & Adaptive Bitrate (ABR) Engine
 * Continuously polls getStats() to monitor RTT, packet loss, jitter, bitrates,
 * codecs, and automatically adapts video resolution, framerate, and bitrates.
 */

export class CallQualityController {
  constructor(peerConnection, onStatsUpdate) {
    this.pc = peerConnection;
    this.onStatsUpdate = onStatsUpdate;
    this.intervalId = null;
    this.lastStats = null;
    this.lastTimestamp = null;
    this.mode = 'auto'; // 'auto' | 'saver' | 'high'
    this.currentTier = 'good'; // 'excellent' | 'good' | 'fair' | 'poor'
    this.hysteresisCounter = 0;
    this.isAdapting = false;
  }

  start(intervalMs = 1500) {
    this.stop();
    if (!this.pc) return;

    this.intervalId = setInterval(async () => {
      await this.pollStats();
    }, intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.lastStats = null;
    this.lastTimestamp = null;
  }

  setMode(mode) {
    this.mode = mode;
    this.applyQualityTier(this.currentTier, true);
  }

  async pollStats() {
    if (!this.pc || this.pc.connectionState === 'closed' || this.pc.signalingState === 'closed') {
      return;
    }

    try {
      const statsReport = await this.pc.getStats();
      const now = Date.now();
      const timeDelta = this.lastTimestamp ? (now - this.lastTimestamp) / 1000 : 1;

      let rtt = null;
      let jitter = null;
      let audioPacketsLost = 0;
      let audioPacketsReceived = 0;
      let videoPacketsLost = 0;
      let videoPacketsReceived = 0;
      let bytesReceived = 0;
      let bytesSent = 0;
      let videoWidth = 0;
      let videoHeight = 0;
      let fps = 0;
      let audioCodec = 'Opus';
      let videoCodec = 'VP8 / H.264';
      let candidateType = 'Direct (P2P)';
      let transportProtocol = 'UDP';
      let framesDropped = 0;

      statsReport.forEach((report) => {
        // Nominated candidate pair
        if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
          if (report.currentRoundTripTime) {
            rtt = Math.round(report.currentRoundTripTime * 1000);
          }
          if (report.availableOutgoingBitrate) {
            // available bandwidth metric
          }
        }

        // Local & Remote candidates
        if (report.type === 'local-candidate' && report.candidateType) {
          if (report.candidateType === 'relay') candidateType = 'Relay (TURN)';
          else if (report.candidateType === 'srflx') candidateType = 'STUN (Reflexive)';
          else if (report.candidateType === 'host') candidateType = 'Direct (Host P2P)';
          if (report.protocol) transportProtocol = report.protocol.toUpperCase();
        }

        // Inbound RTP (Remote media arriving)
        if (report.type === 'inbound-rtp') {
          if (report.bytesReceived) bytesReceived += report.bytesReceived;

          if (report.kind === 'audio') {
            audioPacketsLost = report.packetsLost || 0;
            audioPacketsReceived = report.packetsReceived || 0;
            if (report.jitter) jitter = Math.round(report.jitter * 1000);
          } else if (report.kind === 'video') {
            videoPacketsLost = report.packetsLost || 0;
            videoPacketsReceived = report.packetsReceived || 0;
            videoWidth = report.frameWidth || videoWidth;
            videoHeight = report.frameHeight || videoHeight;
            fps = report.framesPerSecond || fps;
            framesDropped = report.framesDropped || framesDropped;
          }
        }

        // Outbound RTP (Media sent)
        if (report.type === 'outbound-rtp') {
          if (report.bytesSent) bytesSent += report.bytesSent;
          if (report.kind === 'video' && report.frameWidth) {
            videoWidth = report.frameWidth;
            videoHeight = report.frameHeight;
            fps = report.framesPerSecond || fps;
          }
        }

        // Codecs
        if (report.type === 'codec') {
          if (report.mimeType?.includes('audio')) audioCodec = report.mimeType.split('/')[1] || audioCodec;
          if (report.mimeType?.includes('video')) videoCodec = report.mimeType.split('/')[1] || videoCodec;
        }
      });

      // Calculate bitrates (kbps)
      let bitrateIn = 0;
      let bitrateOut = 0;
      if (this.lastStats && timeDelta > 0) {
        bitrateIn = Math.max(0, Math.round(((bytesReceived - (this.lastStats.bytesReceived || 0)) * 8) / (timeDelta * 1000)));
        bitrateOut = Math.max(0, Math.round(((bytesSent - (this.lastStats.bytesSent || 0)) * 8) / (timeDelta * 1000)));
      }

      // Calculate packet loss percentage
      const totalPackets = (audioPacketsReceived + audioPacketsLost) + (videoPacketsReceived + videoPacketsLost);
      const totalLost = audioPacketsLost + videoPacketsLost;
      const packetLossPct = totalPackets > 0 ? Math.min(100, Math.max(0, (totalLost / totalPackets) * 100)) : 0;

      // Evaluate Quality Score
      let rating = 'good';
      const effectiveRtt = rtt || 60;
      const effectiveLoss = packetLossPct;
      const effectiveJitter = jitter || 15;

      if (effectiveLoss < 1 && effectiveRtt < 120 && effectiveJitter < 30) {
        rating = 'excellent';
      } else if (effectiveLoss < 3.5 && effectiveRtt < 220 && effectiveJitter < 60) {
        rating = 'good';
      } else if (effectiveLoss < 7 && effectiveRtt < 380 && effectiveJitter < 100) {
        rating = 'fair';
      } else {
        rating = 'poor';
      }

      const metrics = {
        rtt: effectiveRtt,
        packetLossPct: parseFloat(packetLossPct.toFixed(1)),
        jitter: effectiveJitter,
        bitrateIn,
        bitrateOut,
        videoWidth,
        videoHeight,
        fps: Math.round(fps),
        audioCodec,
        videoCodec,
        candidateType,
        transportProtocol,
        framesDropped,
        rating,
        mode: this.mode,
      };

      this.lastStats = { bytesReceived, bytesSent };
      this.lastTimestamp = now;

      // Adaptive Quality Adjustment
      this.checkAndAdapt(rating);

      if (this.onStatsUpdate) {
        this.onStatsUpdate(metrics);
      }
    } catch (err) {
      console.warn('Stats poll error:', err);
    }
  }

  /**
   * Adjust encoding parameters on RTCRtpSender based on network conditions
   */
  async checkAndAdapt(newRating) {
    if (this.mode === 'saver') {
      await this.applyQualityTier('saver');
      return;
    }
    if (this.mode === 'high') {
      await this.applyQualityTier('high');
      return;
    }

    const tierRank = { poor: 0, fair: 1, good: 2, excellent: 3 };
    const isDowngrade = tierRank[newRating] < tierRank[this.currentTier];

    if (newRating !== this.currentTier) {
      if (isDowngrade) {
        // React immediately to bad conditions
        this.currentTier = newRating;
        this.hysteresisCounter = 0;
        await this.applyQualityTier(newRating);
      } else {
        // Require 2 consistent polls before upgrading
        this.hysteresisCounter++;
        if (this.hysteresisCounter >= 2) {
          this.currentTier = newRating;
          this.hysteresisCounter = 0;
          await this.applyQualityTier(newRating);
        }
      }
    } else {
      this.hysteresisCounter = 0;
    }
  }

  async applyQualityTier(tier, force = false) {
    if (!this.pc || this.isAdapting) return;
    this.isAdapting = true;

    try {
      const senders = this.pc.getSenders();
      const videoSender = senders.find((s) => s.track && s.track.kind === 'video');

      if (!videoSender || !videoSender.getParameters) {
        this.isAdapting = false;
        return;
      }

      const params = videoSender.getParameters();
      if (!params || !params.encodings || params.encodings.length === 0) {
        this.isAdapting = false;
        return;
      }

      // Quality Profiles
      let maxBitrate = 1400000; // 1.4 Mbps default
      let maxFramerate = 30;
      let scaleResolutionDownBy = 1.0;
      let degradationPreference = 'balanced';

      switch (tier) {
        case 'high':
        case 'excellent':
          maxBitrate = 2200000; // 2.2 Mbps (1080p/720p HD)
          maxFramerate = 30;
          scaleResolutionDownBy = 1.0;
          degradationPreference = 'maintain-framerate';
          break;

        case 'good':
          maxBitrate = 1800000; // 1.8 Mbps (720p 30 FPS)
          maxFramerate = 30;
          scaleResolutionDownBy = 1.0;
          degradationPreference = 'maintain-framerate';
          break;

        case 'fair':
          maxBitrate = 550000; // 550 kbps (480p)
          maxFramerate = 24;
          scaleResolutionDownBy = 1.5;
          degradationPreference = 'balanced';
          break;

        case 'saver':
        case 'poor':
          // AUDIO PRIORITY CONGESTION MODE
          // Heavily throttle video so Opus audio stays crystal clear
          maxBitrate = 180000; // 180 kbps (360p)
          maxFramerate = 15;
          scaleResolutionDownBy = 2.5;
          degradationPreference = 'maintain-resolution';
          break;

        default:
          maxBitrate = 1200000;
          break;
      }

      params.encodings[0].maxBitrate = maxBitrate;
      params.encodings[0].maxFramerate = maxFramerate;
      params.encodings[0].scaleResolutionDownBy = scaleResolutionDownBy;
      if ('degradationPreference' in params) {
        params.degradationPreference = degradationPreference;
      }

      await videoSender.setParameters(params);
    } catch (err) {
      console.warn('Set encoding parameters note:', err.message);
    } finally {
      this.isAdapting = false;
    }
  }
}
