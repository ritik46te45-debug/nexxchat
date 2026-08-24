import { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Eye, Trash2, Heart, Smile } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function StatusViewerModal({ feed, onClose, onStatusDeleted }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const progressTimerRef = useRef(null);

  const currentStatus = feed.statuses[currentIndex];
  const duration = 5000; // 5 seconds per story

  useEffect(() => {
    // Record view on backend
    if (currentStatus) {
      api.post(`/status/${currentStatus._id}/view`).catch(console.error);
    }
  }, [currentIndex, currentStatus]);

  useEffect(() => {
    if (isPaused) {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      return;
    }

    const interval = 50; // update progress every 50ms
    const step = (interval / duration) * 100;

    progressTimerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          handleNext();
          return 0;
        }
        return prev + step;
      });
    }, interval);

    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, [currentIndex, isPaused]);

  const handleNext = () => {
    if (currentIndex < feed.statuses.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setProgress(0);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setProgress(0);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/status/${currentStatus._id}`);
      toast.success('Story deleted');
      onStatusDeleted();
    } catch (err) {
      toast.error('Failed to delete story');
    }
  };

  const handleReact = async (emoji) => {
    try {
      await api.post(`/status/${currentStatus._id}/react`, { emoji });
      toast.success(`Reacted with ${emoji}`);
    } catch (err) {
      console.error(err);
    }
  };

  if (!currentStatus) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 select-none animate-fade-in"
      onMouseDown={() => setIsPaused(true)}
      onMouseUp={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
    >
      <div className="relative w-full max-w-md h-[85vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col justify-between bg-dark-card border border-dark-border/50">
        {/* Progress bars on top */}
        <div className="absolute top-3 left-3 right-3 flex items-center gap-1.5 z-30">
          {feed.statuses.map((s, idx) => (
            <div key={s._id} className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full bg-white transition-all"
                style={{
                  width: `${
                    idx < currentIndex ? 100 : idx === currentIndex ? progress : 0
                  }%`,
                }}
              />
            </div>
          ))}
        </div>

        {/* User Info Header */}
        <div className="absolute top-6 left-4 right-4 flex items-center justify-between z-30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center font-bold text-white shadow-md">
              {feed.user?.displayName?.charAt(0) || '?'}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{feed.user?.displayName}</p>
              <p className="text-[11px] text-white/70">
                {new Date(currentStatus.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {feed.isSelf && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                className="p-2 rounded-full bg-black/40 text-white hover:text-accent-red transition-colors"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-2 rounded-full bg-black/40 text-white hover:text-surface-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Story Body */}
        <div className="flex-1 flex items-center justify-center overflow-hidden">
          {currentStatus.type === 'text' ? (
            <div
              className="w-full h-full flex items-center justify-center p-8 text-center"
              style={{ backgroundColor: currentStatus.backgroundColor || '#1e1b4b' }}
            >
              <p className="text-white text-2xl font-bold leading-relaxed">{currentStatus.content}</p>
            </div>
          ) : currentStatus.type === 'image' ? (
            <div className="relative w-full h-full flex flex-col items-center justify-center bg-black">
              <img
                src={currentStatus.media?.url}
                alt=""
                className="w-full h-full object-contain"
              />
              {currentStatus.content && (
                <div className="absolute bottom-6 left-0 right-0 bg-black/60 backdrop-blur-md p-4 text-center text-white text-sm">
                  {currentStatus.content}
                </div>
              )}
            </div>
          ) : (
            <div className="relative w-full h-full flex flex-col items-center justify-center bg-black">
              <video
                src={currentStatus.media?.url}
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
              {currentStatus.content && (
                <div className="absolute bottom-6 left-0 right-0 bg-black/60 backdrop-blur-md p-4 text-center text-white text-sm">
                  {currentStatus.content}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Left / Right Click Navigators */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePrev();
          }}
          className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition-all z-20"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleNext();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition-all z-20"
        >
          <ChevronRight className="w-6 h-6" />
        </button>

        {/* Bottom Reaction & Viewers Bar */}
        <div className="p-4 z-30 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent">
          {feed.isSelf ? (
            <div className="relative">
              {(() => {
                const viewersList = Array.isArray(currentStatus.viewers) ? currentStatus.viewers : [];
                const uniqueMap = new Map();
                viewersList.forEach(v => {
                  if (!v) return;
                  const uId = (v.user?._id || v.user || v)?.toString();
                  if (uId && !uniqueMap.has(uId)) {
                    uniqueMap.set(uId, v);
                  }
                });
                const uniqueViewers = Array.from(uniqueMap.values());

                return (
                  <div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowViewers(!showViewers);
                      }}
                      className="flex items-center gap-2 text-white text-xs bg-black/50 hover:bg-black/80 px-3 py-1.5 rounded-full border border-white/10 transition-all cursor-pointer"
                    >
                      <Eye className="w-4 h-4 text-primary-400" />
                      <span className="font-medium">{uniqueViewers.length} {uniqueViewers.length === 1 ? 'view' : 'views'}</span>
                    </button>

                    {/* Viewers Dropdown List */}
                    {showViewers && (
                      <div className="absolute bottom-full mb-2 left-0 w-64 max-h-48 overflow-y-auto bg-dark-card border border-dark-border rounded-2xl p-2.5 shadow-2xl z-40 animate-scale-in">
                        <p className="text-[11px] font-semibold text-surface-400 mb-2 px-1">Viewed by ({uniqueViewers.length})</p>
                        {uniqueViewers.length === 0 ? (
                          <p className="text-xs text-surface-500 text-center py-2">No views yet</p>
                        ) : (
                          uniqueViewers.map((vw, i) => {
                            const u = vw.user || vw;
                            return (
                              <div key={i} className="flex items-center gap-2 py-1 px-1.5 rounded-lg hover:bg-dark-hover">
                                <div className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center text-[10px] font-bold text-white">
                                  {u?.displayName?.charAt(0) || '?'}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium text-white truncate">{u?.displayName || 'User'}</p>
                                  <p className="text-[9px] text-surface-500">{vw.viewedAt ? new Date(vw.viewedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</p>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="flex items-center gap-2 w-full justify-center">
              {['❤️', '😂', '😮', '👏', '🔥'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReact(emoji);
                  }}
                  className="w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 hover:scale-125 text-xl flex items-center justify-center transition-all cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
