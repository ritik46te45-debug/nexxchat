import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Trash2, Send, Pause, Play, Lock, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function VoiceRecorder({ onSendVoice, onCancel }) {
  const [duration, setDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [waveBars, setWaveBars] = useState([15, 25, 40, 60, 30, 20, 45, 70, 35, 20]);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);

  // Initialize recording on mount
  useEffect(() => {
    startRecording();
    return () => {
      stopAndCleanup();
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Audio analysis for real reactive waveform
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyserRef.current = analyser;

        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateWave = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);

          const bars = [];
          for (let i = 0; i < 12; i++) {
            const val = dataArray[i * 2] || 0;
            bars.push(Math.max(15, Math.min(100, (val / 255) * 100)));
          }
          setWaveBars(bars);
          animFrameRef.current = requestAnimationFrame(updateWave);
        };
        updateWave();
      }

      // MediaRecorder setup
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(200);

      // Start duration timer
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Voice recording error:', err);
      toast.error('Microphone permission required for voice recording');
      onCancel();
    }
  };

  const togglePauseResume = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    if (isPaused) {
      recorder.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } else {
      recorder.pause();
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleFinishAndSend = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    recorder.onstop = () => {
      const mimeType = recorder.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
      if (audioBlob.size > 0 && duration > 0) {
        onSendVoice(audioBlob, duration);
      } else {
        toast.error('Voice note too short');
        onCancel();
      }
      stopAndCleanup();
    };

    recorder.stop();
  };

  const handleDiscard = () => {
    stopAndCleanup();
    onCancel();
  };

  const stopAndCleanup = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (e) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} });
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { audioContextRef.current.close(); } catch (e) {}
      audioContextRef.current = null;
    }
  };

  const formatTimer = (secs) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 flex items-center justify-between gap-3 px-3 py-2 bg-dark-card border border-primary-500/40 rounded-2xl animate-scale-in shadow-xl select-none">
      {/* Trash / Discard Button */}
      <button
        onClick={handleDiscard}
        className="w-9 h-9 rounded-xl bg-dark-input hover:bg-accent-red/20 text-surface-400 hover:text-accent-red flex items-center justify-center transition-all border border-dark-border flex-shrink-0"
        title="Discard recording"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {/* Center Recording Info & Live Waveform */}
      <div className="flex-1 flex items-center gap-3 min-w-0">
        {/* Pulsing Recording Indicator */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`w-2.5 h-2.5 rounded-full ${isPaused ? 'bg-yellow-400' : 'bg-accent-red animate-pulse'}`} />
          <span className="text-xs font-mono font-bold text-white">{formatTimer(duration)}</span>
        </div>

        {/* Live Audio Spectrum Bars */}
        <div className="flex-1 flex items-center gap-1 h-7 overflow-hidden px-2">
          {waveBars.map((height, i) => (
            <div
              key={i}
              className={`flex-1 rounded-full transition-all duration-75 ${
                isPaused
                  ? 'bg-surface-600'
                  : 'bg-gradient-to-t from-primary-500 to-accent-purple'
              }`}
              style={{ height: isPaused ? '4px' : `${Math.max(4, (height / 100) * 24)}px` }}
            />
          ))}
        </div>
      </div>

      {/* Pause / Resume Button */}
      <button
        onClick={togglePauseResume}
        className="w-9 h-9 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-300 hover:text-white flex items-center justify-center transition-all border border-dark-border flex-shrink-0"
        title={isPaused ? 'Resume' : 'Pause'}
      >
        {isPaused ? <Play className="w-4 h-4 text-accent-green fill-accent-green" /> : <Pause className="w-4 h-4" />}
      </button>

      {/* Send Button */}
      <button
        onClick={handleFinishAndSend}
        disabled={duration < 1}
        className="w-9 h-9 rounded-xl gradient-primary text-white flex items-center justify-center shadow-lg shadow-primary-500/30 hover:opacity-90 active:scale-95 transition-all flex-shrink-0 disabled:opacity-40"
        title="Send voice note"
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
}
