import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, RotateCcw, Camera } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CircularVideoRecorder({ onSendVideoNote, onClose }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [videoBlob, setVideoBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const MAX_DURATION = 60; // 60 seconds max

  // Start camera preview
  useEffect(() => {
    let active = true;

    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 480 },
            height: { ideal: 480 },
            aspectRatio: 1,
          },
          audio: true,
        });

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        console.error('Camera access error:', err);
        toast.error('Could not access camera for video note');
        onClose();
      }
    }

    initCamera();

    return () => {
      active = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, []);

  // Start Recording
  const startRecording = useCallback(() => {
    if (!streamRef.current) return;

    try {
      chunksRef.current = [];
      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm',
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        setVideoBlob(blob);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      };

      mediaRecorder.start(250);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setRecordDuration(0);

      timerRef.current = setInterval(() => {
        setRecordDuration((prev) => {
          if (prev >= MAX_DURATION - 1) {
            stopRecording();
            return MAX_DURATION;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error('Recording start error:', err);
      toast.error('Failed to start video recording');
    }
  }, []);

  // Stop Recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const handleRetake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setVideoBlob(null);
    setRecordDuration(0);
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleSend = () => {
    if (!videoBlob) return;
    onSendVideoNote(videoBlob, recordDuration);
    onClose();
  };

  const formatTimer = (secs) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins}:${String(rem).padStart(2, '0')}`;
  };

  const progressPct = (recordDuration / MAX_DURATION) * 100;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fade-in">
      {/* Top close */}
      <div className="absolute top-6 right-6">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-dark-card/80 border border-dark-border text-surface-400 hover:text-white flex items-center justify-center transition-all"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex flex-col items-center gap-5 max-w-sm w-full">
        <div className="text-center">
          <h3 className="text-base font-bold text-white mb-0.5">Circular Video Note</h3>
          <p className="text-xs text-surface-400">
            {previewUrl ? 'Review your video note' : isRecording ? `Recording... ${formatTimer(recordDuration)}` : 'Tap the record button to start'}
          </p>
        </div>

        {/* Circular Video Preview Frame */}
        <div className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-full overflow-hidden border-4 border-primary-500/60 shadow-2xl bg-black flex items-center justify-center">
          {previewUrl ? (
            <video
              src={previewUrl}
              autoPlay
              loop
              playsInline
              className="w-full h-full object-cover rounded-full"
            />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover rounded-full -scale-x-100"
            />
          )}

          {/* Recording Progress Ring */}
          {isRecording && (
            <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none">
              <circle
                cx="50%"
                cy="50%"
                r="48%"
                fill="none"
                stroke="#ef4444"
                strokeWidth="4"
                strokeDasharray="1000"
                strokeDashoffset={1000 - (1000 * progressPct) / 100}
                className="transition-all duration-1000 ease-linear"
              />
            </svg>
          )}

          {/* Recording Badge */}
          {isRecording && (
            <div className="absolute top-4 bg-red-600/90 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 animate-pulse">
              <div className="w-2 h-2 rounded-full bg-white" />
              {formatTimer(recordDuration)}
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-6 mt-2">
          {previewUrl ? (
            <>
              <button
                onClick={handleRetake}
                className="px-4 py-2.5 rounded-xl bg-dark-card border border-dark-border text-surface-300 hover:text-white flex items-center gap-2 text-xs font-semibold transition-all hover:bg-dark-hover"
              >
                <RotateCcw className="w-4 h-4" /> Retake
              </button>
              <button
                onClick={handleSend}
                className="px-6 py-2.5 rounded-xl gradient-primary text-white flex items-center gap-2 text-xs font-bold shadow-lg shadow-primary-500/30 hover:opacity-95 active:scale-95 transition-all"
              >
                <Send className="w-4 h-4" /> Send Note
              </button>
            </>
          ) : isRecording ? (
            <button
              onClick={stopRecording}
              className="w-16 h-16 rounded-full bg-accent-red text-white flex items-center justify-center shadow-xl shadow-red-500/40 hover:scale-105 active:scale-95 transition-all animate-pulse"
              title="Stop Recording"
            >
              <div className="w-6 h-6 rounded-md bg-white" />
            </button>
          ) : (
            <button
              onClick={startRecording}
              className="w-16 h-16 rounded-full gradient-primary text-white flex items-center justify-center shadow-xl shadow-primary-500/40 hover:scale-105 active:scale-95 transition-all"
              title="Start Recording"
            >
              <Camera className="w-7 h-7" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
