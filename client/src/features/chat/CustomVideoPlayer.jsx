import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Maximize2, Minimize2,
  PictureInPicture, SkipBack, SkipForward, Loader2, Download, X
} from 'lucide-react';
import { downloadFile } from '../../lib/fileDownload';

const formatTime = (secs) => {
  if (isNaN(secs) || secs <= 0) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export default function CustomVideoPlayer({ src, poster, isOwn, fileName }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [showFullscreenPlayer, setShowFullscreenPlayer] = useState(false);

  const videoRef = useRef(null);
  const fullscreenVideoRef = useRef(null);
  const containerRef = useRef(null);
  const fullscreenContainerRef = useRef(null);
  const hideControlsTimer = useRef(null);
  const progressRef = useRef(null);

  // Get the active video element
  const getActiveVideo = useCallback(() => {
    return showFullscreenPlayer ? fullscreenVideoRef.current : videoRef.current;
  }, [showFullscreenPlayer]);

  const togglePlay = useCallback(() => {
    const video = getActiveVideo();
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [getActiveVideo]);

  const handleTimeUpdate = useCallback(() => {
    const video = getActiveVideo();
    if (video && !isSeeking) {
      setCurrentTime(video.currentTime);
      // Update buffered
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    }
  }, [getActiveVideo, isSeeking]);

  const handleLoadedMetadata = useCallback(() => {
    const video = getActiveVideo();
    if (video) {
      setDuration(video.duration);
      setIsLoading(false);
    }
  }, [getActiveVideo]);

  const handleProgressClick = useCallback((e) => {
    const video = getActiveVideo();
    if (!video || !progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = percent * duration;
    video.currentTime = newTime;
    setCurrentTime(newTime);
  }, [getActiveVideo, duration]);

  const seekBy = useCallback((seconds) => {
    const video = getActiveVideo();
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(duration, video.currentTime + seconds));
  }, [getActiveVideo, duration]);

  const toggleMute = useCallback(() => {
    const video = getActiveVideo();
    if (!video) return;
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    video.muted = newMuted;
  }, [getActiveVideo, isMuted]);

  const handleVolumeChange = useCallback((e) => {
    const video = getActiveVideo();
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (video) {
      video.volume = newVolume;
      setIsMuted(newVolume === 0);
      video.muted = newVolume === 0;
    }
  }, [getActiveVideo]);

  const handleSpeedCycle = useCallback(() => {
    const speeds = [0.5, 1, 1.25, 1.5, 2];
    const nextIndex = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const newSpeed = speeds[nextIndex];
    setPlaybackSpeed(newSpeed);
    const video = getActiveVideo();
    if (video) video.playbackRate = newSpeed;
  }, [getActiveVideo, playbackSpeed]);

  const togglePiP = useCallback(async () => {
    const video = getActiveVideo();
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (e) {
      console.warn('PiP not available:', e.message);
    }
  }, [getActiveVideo]);

  const openFullscreenPlayer = useCallback(() => {
    setShowFullscreenPlayer(true);
  }, []);

  const closeFullscreenPlayer = useCallback(() => {
    const video = fullscreenVideoRef.current;
    if (video) video.pause();
    setShowFullscreenPlayer(false);
    setIsPlaying(false);
    // Sync time back to inline player
    if (videoRef.current && fullscreenVideoRef.current) {
      videoRef.current.currentTime = fullscreenVideoRef.current.currentTime;
    }
  }, []);

  const handleDownload = useCallback(() => {
    const name = fileName || src.split('/').pop() || 'video.mp4';
    downloadFile(src, name, 'video/mp4');
  }, [src, fileName]);

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  }, [isPlaying]);

  // Keyboard shortcuts for fullscreen player
  useEffect(() => {
    if (!showFullscreenPlayer) return;
    const handleKey = (e) => {
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekBy(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekBy(10);
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
          e.preventDefault();
          closeFullscreenPlayer();
          break;
        case 'Escape':
          e.preventDefault();
          closeFullscreenPlayer();
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showFullscreenPlayer, togglePlay, seekBy, toggleMute, closeFullscreenPlayer]);

  // Sync fullscreen video to inline player's time when opening
  useEffect(() => {
    if (showFullscreenPlayer && fullscreenVideoRef.current && videoRef.current) {
      fullscreenVideoRef.current.currentTime = videoRef.current.currentTime;
      fullscreenVideoRef.current.playbackRate = playbackSpeed;
      fullscreenVideoRef.current.volume = volume;
      fullscreenVideoRef.current.muted = isMuted;
    }
  }, [showFullscreenPlayer]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedProgress = duration > 0 ? (buffered / duration) * 100 : 0;

  // Shared controls renderer
  const renderControls = (isModal = false) => (
    <div
      className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent transition-opacity duration-300 ${
        showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
      } ${isModal ? 'p-4 sm:p-6' : 'p-3'}`}
    >
      {/* Progress Bar */}
      <div
        ref={progressRef}
        className={`relative w-full ${isModal ? 'h-2' : 'h-1.5'} bg-white/20 rounded-full cursor-pointer mb-3 group/progress`}
        onClick={handleProgressClick}
      >
        {/* Buffered */}
        <div
          className="absolute inset-y-0 left-0 bg-white/30 rounded-full"
          style={{ width: `${bufferedProgress}%` }}
        />
        {/* Played */}
        <div
          className="absolute inset-y-0 left-0 bg-primary-500 rounded-full transition-[width] duration-75"
          style={{ width: `${progress}%` }}
        />
        {/* Thumb */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 ${isModal ? 'w-4 h-4' : 'w-3 h-3'} rounded-full bg-primary-400 shadow-lg shadow-primary-500/50 opacity-0 group-hover/progress:opacity-100 transition-opacity`}
          style={{ left: `calc(${progress}% - ${isModal ? 8 : 6}px)` }}
        />
      </div>

      {/* Control Buttons */}
      <div className="flex items-center justify-between text-white">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Skip Back */}
          {isModal && (
            <button onClick={() => seekBy(-10)} className="p-1.5 hover:text-primary-400 transition-colors" title="Back 10s">
              <SkipBack className="w-4 h-4" />
            </button>
          )}

          {/* Play / Pause */}
          <button onClick={togglePlay} className="hover:text-primary-400 transition-colors">
            {isPlaying ? <Pause className={`${isModal ? 'w-5 h-5' : 'w-4 h-4'} fill-white`} /> : <Play className={`${isModal ? 'w-5 h-5' : 'w-4 h-4'} fill-white`} />}
          </button>

          {/* Skip Forward */}
          {isModal && (
            <button onClick={() => seekBy(10)} className="p-1.5 hover:text-primary-400 transition-colors" title="Forward 10s">
              <SkipForward className="w-4 h-4" />
            </button>
          )}

          {/* Volume */}
          <div className="relative flex items-center" onMouseEnter={() => setShowVolumeSlider(true)} onMouseLeave={() => setShowVolumeSlider(false)}>
            <button onClick={toggleMute} className="hover:text-primary-400 transition-colors">
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-accent-red" /> : <Volume2 className="w-4 h-4" />}
            </button>
            {showVolumeSlider && (
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="ml-2 w-16 sm:w-20 h-1 accent-primary-500 cursor-pointer"
              />
            )}
          </div>

          {/* Time Display */}
          <span className={`font-mono ${isModal ? 'text-xs' : 'text-[10px]'} text-surface-300`}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Speed */}
          <button
            onClick={handleSpeedCycle}
            className={`px-1.5 py-0.5 rounded bg-white/10 border border-white/20 ${isModal ? 'text-xs' : 'text-[10px]'} font-mono hover:text-primary-400 transition-colors`}
            title="Playback speed"
          >
            {playbackSpeed}x
          </button>

          {/* Download */}
          {isModal && (
            <button onClick={handleDownload} className="p-1.5 hover:text-primary-400 transition-colors" title="Download">
              <Download className="w-4 h-4" />
            </button>
          )}

          {/* PiP */}
          <button onClick={togglePiP} className="hover:text-primary-400 transition-colors hidden sm:block" title="Picture in Picture">
            <PictureInPicture className="w-3.5 h-3.5" />
          </button>

          {/* Fullscreen / Close */}
          {isModal ? (
            <button onClick={closeFullscreenPlayer} className="hover:text-primary-400 transition-colors" title="Close">
              <Minimize2 className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={openFullscreenPlayer} className="hover:text-primary-400 transition-colors" title="Fullscreen">
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Inline Player (in chat bubble) ── */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => isPlaying && setShowControls(false)}
        className="relative rounded-2xl overflow-hidden bg-black max-w-sm sm:max-w-md border border-dark-border group select-none shadow-xl"
      >
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          playsInline
          preload="metadata"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onWaiting={() => setIsLoading(true)}
          onPlaying={() => setIsLoading(false)}
          onEnded={() => setIsPlaying(false)}
          onClick={togglePlay}
          className="w-full h-auto max-h-80 object-contain cursor-pointer"
        />

        {/* Loading Spinner */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
            <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
          </div>
        )}

        {/* Big Play Button Overlay (when paused) */}
        {!isPlaying && !isLoading && (
          <button
            onClick={togglePlay}
            className="absolute inset-0 m-auto w-14 h-14 rounded-full gradient-primary text-white flex items-center justify-center shadow-2xl shadow-primary-500/50 hover:scale-110 active:scale-95 transition-all cursor-pointer z-10"
          >
            <Play className="w-6 h-6 ml-0.5 fill-white" />
          </button>
        )}

        {/* Controls Overlay */}
        {renderControls(false)}
      </div>

      {/* ── Fullscreen Modal Player ── */}
      {showFullscreenPlayer && (
        <div
          className="fixed inset-0 z-50 bg-black flex flex-col animate-fade-in"
          onMouseMove={handleMouseMove}
          onClick={(e) => { if (e.target === e.currentTarget) togglePlay(); }}
        >
          {/* Close button top-right */}
          <button
            onClick={closeFullscreenPlayer}
            className="absolute top-4 right-4 z-30 p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Video Element */}
          <div className="flex-1 flex items-center justify-center relative" ref={fullscreenContainerRef}>
            <video
              ref={fullscreenVideoRef}
              src={src}
              poster={poster}
              playsInline
              autoPlay
              preload="metadata"
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onWaiting={() => setIsLoading(true)}
              onPlaying={() => { setIsLoading(false); setIsPlaying(true); }}
              onEnded={() => setIsPlaying(false)}
              onClick={togglePlay}
              className="max-w-full max-h-full w-auto h-auto object-contain cursor-pointer"
            />

            {/* Loading Spinner */}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Loader2 className="w-12 h-12 animate-spin text-primary-400" />
              </div>
            )}

            {/* Big Play Button */}
            {!isPlaying && !isLoading && (
              <button
                onClick={togglePlay}
                className="absolute inset-0 m-auto w-20 h-20 rounded-full gradient-primary text-white flex items-center justify-center shadow-2xl shadow-primary-500/50 hover:scale-110 active:scale-95 transition-all cursor-pointer z-10"
              >
                <Play className="w-8 h-8 ml-1 fill-white" />
              </button>
            )}

            {/* Controls */}
            {renderControls(true)}
          </div>
        </div>
      )}
    </>
  );
}
