import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, Mic } from 'lucide-react';

export default function AudioWaveformPlayer({ src, duration: initialDuration, isOwn }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef(null);
  const waveformRef = useRef(null);

  // Generate 28 pseudo-random bars for visual waveform representation
  const [barHeights] = useState(() => {
    return Array.from({ length: 28 }, (_, i) => {
      const seed = ((i * 7 + 13) % 23) / 23;
      return Math.max(0.2, Math.min(0.95, 0.3 + 0.65 * Math.sin(seed * Math.PI) * (0.8 + 0.4 * ((i % 3) / 3))));
    });
  });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.playbackRate = playbackRate;
      audio.play().catch((err) => console.warn('Audio play note:', err));
      setIsPlaying(true);
    }
  }, [isPlaying, playbackRate]);

  const toggleSpeed = (e) => {
    e.stopPropagation();
    const speeds = [1, 1.5, 2];
    const nextIndex = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const nextSpeed = speeds[nextIndex];
    setPlaybackRate(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const handleSeek = (e) => {
    if (!waveformRef.current || !duration) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const seekTime = pct * duration;
    if (audioRef.current) {
      audioRef.current.currentTime = seekTime;
      setCurrentTime(seekTime);
    }
  };

  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return '0:00';
    const mins = Math.floor(secs / 60);
    const rem = Math.floor(secs % 60);
    return `${mins}:${String(rem).padStart(2, '0')}`;
  };

  const progressPct = duration > 0 ? (currentTime / duration) : 0;

  return (
    <div className="flex items-center gap-3 py-1.5 px-2 rounded-2xl max-w-xs sm:max-w-sm select-none">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause Button */}
      <button
        onClick={togglePlay}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0 shadow-md ${
          isOwn
            ? 'bg-white text-primary-600 hover:bg-white/90 active:scale-95'
            : 'gradient-primary text-white hover:opacity-95 active:scale-95'
        }`}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
      </button>

      {/* Waveform Visualization & Scrubber */}
      <div className="flex-1 min-w-[120px] sm:min-w-[150px]">
        <div
          ref={waveformRef}
          onClick={handleSeek}
          className="flex items-center gap-[2.5px] h-8 cursor-pointer py-1"
        >
          {barHeights.map((heightPct, index) => {
            const barPct = (index + 0.5) / barHeights.length;
            const isPassed = barPct <= progressPct;

            return (
              <div
                key={index}
                className="flex-1 rounded-full transition-all duration-75"
                style={{
                  height: `${Math.max(4, heightPct * 26)}px`,
                  backgroundColor: isPassed
                    ? (isOwn ? '#ffffff' : '#8b5cf6')
                    : (isOwn ? 'rgba(255, 255, 255, 0.35)' : 'rgba(148, 163, 184, 0.3)'),
                }}
              />
            );
          })}
        </div>

        {/* Timers & Speed pill */}
        <div className="flex items-center justify-between text-[10px] mt-0.5">
          <span className={isOwn ? 'text-white/80' : 'text-surface-400'}>
            {isPlaying ? formatTime(currentTime) : formatTime(duration)}
          </span>

          <button
            onClick={toggleSpeed}
            className={`px-1.5 py-0.2 rounded-md font-bold text-[9px] transition-all border ${
              isOwn
                ? 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                : 'bg-dark-hover text-primary-400 border-primary-500/30 hover:bg-primary-500/20'
            }`}
            title="Playback Speed"
          >
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
}
