/**
 * Real Web Audio API Audio Analyzer & Voice Activity Detection (VAD)
 * Analyzes microphone and remote audio streams to compute live decibel levels,
 * normalized waveform bars, and true speaking state (no fake timers).
 */

export class AudioAnalyzer {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.sourceNode = null;
    this.dataArray = null;
    this.isAnalyzing = false;
    this.speakingThreshold = 0.035; // RMS threshold for speech
    this.onVolumeChange = null;
    this.onSpeakingChange = null;
    this.isSpeaking = false;
    this.animFrameId = null;
  }

  /**
   * Attach a MediaStreamTrack (audio) or MediaStream to analyze
   */
  start(streamOrTrack, onVolumeChange, onSpeakingChange) {
    this.stop();

    if (!streamOrTrack) return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      this.audioContext = new AudioCtx();
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.65;

      const stream = streamOrTrack instanceof MediaStream
        ? streamOrTrack
        : new MediaStream([streamOrTrack]);

      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.sourceNode.connect(this.analyser);

      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.onVolumeChange = onVolumeChange;
      this.onSpeakingChange = onSpeakingChange;
      this.isAnalyzing = true;

      this.loop();
    } catch (err) {
      console.warn('AudioAnalyzer start error:', err);
    }
  }

  loop = () => {
    if (!this.isAnalyzing || !this.analyser) return;

    this.analyser.getByteFrequencyData(this.dataArray);

    // Compute RMS / Average volume level
    let sum = 0;
    const len = this.dataArray.length;
    for (let i = 0; i < len; i++) {
      const val = this.dataArray[i] / 255;
      sum += val * val;
    }
    const rms = Math.sqrt(sum / len);

    // Voice Activity Detection
    const currentlySpeaking = rms > this.speakingThreshold;
    if (currentlySpeaking !== this.isSpeaking) {
      this.isSpeaking = currentlySpeaking;
      if (this.onSpeakingChange) {
        this.onSpeakingChange(this.isSpeaking);
      }
    }

    // Generate 5-bar normalized waveform values (0–100%)
    if (this.onVolumeChange) {
      const bars = [
        Math.min(100, Math.max(15, (this.dataArray[1] / 255) * 100)),
        Math.min(100, Math.max(20, (this.dataArray[3] / 255) * 100)),
        Math.min(100, Math.max(25, (this.dataArray[6] / 255) * 100)),
        Math.min(100, Math.max(20, (this.dataArray[9] / 255) * 100)),
        Math.min(100, Math.max(15, (this.dataArray[12] / 255) * 100)),
      ];
      this.onVolumeChange(bars, rms);
    }

    this.animFrameId = requestAnimationFrame(this.loop);
  };

  stop() {
    this.isAnalyzing = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch (e) {}
      this.sourceNode = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try { this.audioContext.close(); } catch (e) {}
      this.audioContext = null;
    }
    this.analyser = null;
    this.isSpeaking = false;
  }
}
