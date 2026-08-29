import { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Eye, Trash2, Heart, Smile, Sparkles } from 'lucide-react';
import api from '../../lib/api';
import { getSocket } from '../../lib/socket';
import toast from 'react-hot-toast';

export default function StatusViewerModal({ feed, onClose, onStatusDeleted }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [viewersTab, setViewersTab] = useState('all'); // 'all', 'reactions', 'views'
  const [liveReactions, setLiveReactions] = useState({});
  const progressTimerRef = useRef(null);

  const currentStatus = feed.statuses[currentIndex];
  const duration = 5000; // 5 seconds per story

  useEffect(() => {
    // Record view on backend
    if (currentStatus) {
      api.post(`/status/${currentStatus._id}/view`).catch(console.error);
    }
  }, [currentIndex, currentStatus]);

  // Real-time socket listener for incoming reactions
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onReaction = ({ statusId, user, emoji, reactions }) => {
      setLiveReactions((prev) => ({
        ...prev,
        [statusId]: reactions || [
          ...(prev[statusId] || []),
          { user, emoji, createdAt: new Date() },
        ],
      }));
    };

    socket.on('status:reaction', onReaction);
    return () => socket.off('status:reaction', onReaction);
  }, []);

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

  // Active status reactions (either live updated or from database)
  const activeReactions = liveReactions[currentStatus._id] || currentStatus.reactions || [];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-3 sm:p-4 select-none animate-fade-in"
      onMouseDown={() => setIsPaused(true)}
      onMouseUp={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
    >
      <div className="relative w-full max-w-md h-[88vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col justify-between bg-dark-card border border-dark-border/50">
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

        {/* Floating Live Reactions Pill (Top Right below header) */}
        {activeReactions.length > 0 && (
          <div className="absolute top-18 right-4 z-30 flex items-center gap-1 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 shadow-lg animate-bounce-soft">
            <span className="text-xs">❤️</span>
            <span className="text-xs font-bold text-white">{activeReactions.length}</span>
            <div className="flex -space-x-1.5 ml-1">
              {activeReactions.slice(-3).map((r, i) => (
                <span key={i} className="text-sm transform hover:scale-125 transition-transform">
                  {r.emoji}
                </span>
              ))}
            </div>
          </div>
        )}

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
        <div className="p-4 z-30 flex items-center justify-between bg-gradient-to-t from-black/85 via-black/50 to-transparent">
          {feed.isSelf ? (
            <div className="relative w-full">
              {(() => {
                const viewersList = Array.isArray(currentStatus.viewers) ? currentStatus.viewers : [];
                const uniqueMap = new Map();
                viewersList.forEach((v) => {
                  if (!v) return;
                  const uId = (v.user?._id || v.user || v)?.toString();
                  if (uId && !uniqueMap.has(uId)) {
                    uniqueMap.set(uId, v);
                  }
                });
                const uniqueViewers = Array.from(uniqueMap.values());

                return (
                  <div className="flex items-center justify-between w-full">
                    {/* Viewers & Reactions Popup Trigger */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowViewers(!showViewers);
                          setViewersTab('all');
                        }}
                        className="flex items-center gap-2 text-white text-xs bg-black/60 hover:bg-black/90 px-3.5 py-2 rounded-full border border-white/20 transition-all cursor-pointer shadow-lg"
                      >
                        <Eye className="w-4 h-4 text-primary-400" />
                        <span className="font-semibold">
                          {uniqueViewers.length} {uniqueViewers.length === 1 ? 'view' : 'views'}
                        </span>
                        {activeReactions.length > 0 && (
                          <span className="flex items-center gap-1 pl-1.5 border-l border-white/20 text-accent-green font-bold">
                            <span>❤️</span> {activeReactions.length}
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Popover List for Viewers AND Reactions */}
                    {showViewers && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute bottom-full mb-3 left-0 right-0 bg-dark-card border border-dark-border rounded-3xl p-3 shadow-2xl z-50 animate-scale-in max-h-64 flex flex-col"
                      >
                        {/* Tabs: All / Reactions / Views */}
                        <div className="flex items-center justify-between border-b border-dark-border pb-2 mb-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setViewersTab('all')}
                              className={`text-xs font-bold px-2 py-0.5 rounded-lg transition-all ${
                                viewersTab === 'all' ? 'bg-primary-500 text-white' : 'text-surface-400 hover:text-white'
                              }`}
                            >
                              All ({uniqueViewers.length})
                            </button>
                            <button
                              onClick={() => setViewersTab('reactions')}
                              className={`text-xs font-bold px-2 py-0.5 rounded-lg transition-all ${
                                viewersTab === 'reactions' ? 'bg-primary-500 text-white' : 'text-surface-400 hover:text-white'
                              }`}
                            >
                              Reactions ({activeReactions.length})
                            </button>
                          </div>
                          <button onClick={() => setShowViewers(false)} className="text-surface-400 hover:text-white text-xs">
                            ✕
                          </button>
                        </div>

                        {/* Scrollable Viewers & Reactions List */}
                        <div className="overflow-y-auto hide-scrollbar space-y-1.5 flex-1">
                          {viewersTab === 'reactions' ? (
                            activeReactions.length === 0 ? (
                              <p className="text-xs text-surface-500 text-center py-4">No reactions yet</p>
                            ) : (
                              activeReactions.map((r, i) => {
                                const u = r.user || {};
                                return (
                                  <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-dark-input/50">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center font-bold text-white text-xs">
                                        {u.displayName?.charAt(0) || '?'}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-xs font-semibold text-white truncate">{u.displayName || 'User'}</p>
                                        <p className="text-[10px] text-surface-400">
                                          {r.createdAt ? new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                        </p>
                                      </div>
                                    </div>
                                    <span className="text-xl animate-bounce-soft">{r.emoji}</span>
                                  </div>
                                );
                              })
                            )
                          ) : (
                            uniqueViewers.length === 0 ? (
                              <p className="text-xs text-surface-500 text-center py-4">No views yet</p>
                            ) : (
                              uniqueViewers.map((vw, i) => {
                                const u = vw.user || vw;
                                const uId = (u._id || u).toString();
                                const reaction = activeReactions.find((r) => (r.user?._id || r.user || r).toString() === uId);

                                return (
                                  <div key={i} className="flex items-center justify-between p-2 rounded-xl hover:bg-dark-hover">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center font-bold text-white text-xs">
                                        {u.displayName?.charAt(0) || '?'}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-xs font-semibold text-white truncate">{u.displayName || 'User'}</p>
                                        <p className="text-[10px] text-surface-500">
                                          {vw.viewedAt ? new Date(vw.viewedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                        </p>
                                      </div>
                                    </div>
                                    {reaction && (
                                      <span className="text-lg bg-dark-input px-2 py-0.5 rounded-full border border-dark-border">
                                        {reaction.emoji}
                                      </span>
                                    )}
                                  </div>
                                );
                              })
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="flex items-center gap-2.5 w-full justify-center">
              {['❤️', '😂', '😮', '👏', '🔥', '🎉'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReact(emoji);
                  }}
                  className="w-11 h-11 rounded-full bg-black/60 hover:bg-black/90 hover:scale-125 text-2xl flex items-center justify-center transition-all cursor-pointer border border-white/10 shadow-lg"
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
