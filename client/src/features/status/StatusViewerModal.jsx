import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Eye, Trash2, Heart, Smile, Sparkles, Plus } from 'lucide-react';
import api from '../../lib/api';
import { getSocket } from '../../lib/socket';
import useAuthStore from '../../stores/authStore';
import EmojiPickerPopover from '../chat/EmojiPickerPopover';
import toast from 'react-hot-toast';

export default function StatusViewerModal({ feed, onClose, onStatusDeleted }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [viewersTab, setViewersTab] = useState('all'); // 'all', 'reactions', 'views'
  const [liveReactions, setLiveReactions] = useState({});
  const [floatingParticles, setFloatingParticles] = useState([]);
  const progressTimerRef = useRef(null);

  const { user } = useAuthStore();
  const myId = (user?._id || user)?.toString();

  const currentStatus = feed.statuses[currentIndex];
  const currentStatusRef = useRef(currentStatus);
  currentStatusRef.current = currentStatus;
  const duration = 5000; // 5 seconds per story

  // Trigger floating animated reaction particles
  const triggerFloatingReaction = (emoji) => {
    if (!emoji) return;
    const batchId = `${Date.now()}_${Math.random()}`;
    const newParticles = Array.from({ length: 8 }).map((_, i) => ({
      id: `${batchId}_${i}`,
      emoji,
      left: 15 + Math.random() * 70, // 15% to 85% horizontal spread
      delay: i * 60,
      scale: 0.8 + Math.random() * 0.7,
      rotate: (Math.random() - 0.5) * 50,
    }));

    setFloatingParticles((prev) => [...prev, ...newParticles]);

    setTimeout(() => {
      setFloatingParticles((prev) => prev.filter((p) => !p.id.startsWith(batchId)));
    }, 2500);
  };

  // Preload all media in current feed for instant 0ms transition delay
  useEffect(() => {
    if (!feed?.statuses) return;
    feed.statuses.forEach((st) => {
      if (st.type === 'image' && st.media?.url) {
        const img = new Image();
        img.src = st.media.url;
      } else if (st.type === 'video' && st.media?.url) {
        const video = document.createElement('video');
        video.preload = 'auto';
        video.src = st.media.url;
      }
    });
  }, [feed]);

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

    const onReaction = ({ statusId, user: sender, emoji, reactions }) => {
      if (currentStatusRef.current?._id?.toString() === statusId?.toString()) {
        triggerFloatingReaction(emoji);
        if (feed.isSelf) {
          toast(`${sender?.displayName || 'Friend'} reacted with ${emoji}`, {
            icon: emoji,
            duration: 2500,
          });
        }
      }

      setLiveReactions((prev) => ({
        ...prev,
        [statusId]: reactions || [
          ...(prev[statusId] || []),
          { user: sender, emoji, createdAt: new Date() },
        ],
      }));
    };

    socket.on('status:reaction', onReaction);
    return () => socket.off('status:reaction', onReaction);
  }, [feed.isSelf]);

  useEffect(() => {
    if (isPaused || showEmojiPicker || showViewers) {
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
  }, [currentIndex, isPaused, showEmojiPicker, showViewers]);

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
      const activeReactions = liveReactions[currentStatus._id] || currentStatus.reactions || [];
      const myReaction = activeReactions.find(
        (r) => (r.user?._id || r.user || r.userId)?.toString() === myId
      )?.emoji;

      if (myReaction === emoji) {
        // Optimistic remove
        setLiveReactions((prev) => ({
          ...prev,
          [currentStatus._id]: activeReactions.filter(
            (r) => (r.user?._id || r.user || r.userId)?.toString() !== myId
          ),
        }));
        toast('Reaction removed', { icon: '↩️' });
      } else {
        // Optimistic add/replace (strictly 1 reaction per user)
        triggerFloatingReaction(emoji);
        const updatedList = activeReactions.filter(
          (r) => (r.user?._id || r.user || r.userId)?.toString() !== myId
        );
        updatedList.push({
          user: user || { _id: myId, displayName: 'You' },
          emoji,
          createdAt: new Date(),
        });
        setLiveReactions((prev) => ({
          ...prev,
          [currentStatus._id]: updatedList,
        }));
        toast.success(`Reacted ${emoji}`, { duration: 1500 });
      }

      const { data } = await api.post(`/status/${currentStatus._id}/react`, { emoji });
      if (data?.reactions) {
        setLiveReactions((prev) => ({
          ...prev,
          [currentStatus._id]: data.reactions,
        }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!currentStatus) return null;

  // Active status reactions (either live updated or from database)
  const activeReactions = liveReactions[currentStatus._id] || currentStatus.reactions || [];
  const myReaction = activeReactions.find(
    (r) => (r.user?._id || r.user || r.userId)?.toString() === myId
  )?.emoji;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center p-0 sm:p-4 select-none animate-fade-in"
      onMouseDown={() => setIsPaused(true)}
      onMouseUp={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
    >
      <div className="relative w-full max-w-md h-full sm:h-[88vh] rounded-none sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col justify-between bg-dark-card border-0 sm:border border-dark-border/50">
        {/* Floating Animated Emojis Particle Burst Layer */}
        <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden">
          {floatingParticles.map((particle) => (
            <span
              key={particle.id}
              className="absolute bottom-20 text-3xl sm:text-4xl animate-float-up select-none drop-shadow-lg"
              style={{
                left: `${particle.left}%`,
                animationDelay: `${particle.delay}ms`,
                transform: `scale(${particle.scale}) rotate(${particle.rotate}deg)`,
              }}
            >
              {particle.emoji}
            </span>
          ))}
        </div>

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
              <p className="text-sm font-bold text-white shadow-sm">{feed.user?.displayName || 'User'}</p>
              <p className="text-xs text-white/70 shadow-sm">
                {new Date(currentStatus.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Live reactions badge in top header for author */}
            {feed.isSelf && activeReactions.length > 0 && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white text-xs font-bold shadow-lg">
                <span className="text-accent-red">❤️</span>
                <span>{activeReactions.length}</span>
                <span className="text-[10px] text-surface-300 ml-1">
                  {activeReactions.slice(-3).map((r) => r.emoji).join('')}
                </span>
              </div>
            )}

            {feed.isSelf && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-all"
                title="Delete story"
              >
                <Trash2 className="w-4 h-4 text-accent-red" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Media / Content Area */}
        <div className="relative w-full flex-1 flex items-center justify-center bg-black/40 overflow-hidden">
          {currentStatus.type === 'text' ? (
            <div
              className={`w-full h-full flex flex-col items-center justify-center p-8 text-center text-white ${
                currentStatus.background || 'bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800'
              }`}
              style={{
                fontFamily: currentStatus.font === 'serif' ? 'serif' : currentStatus.font === 'mono' ? 'monospace' : 'sans-serif',
              }}
            >
              <p className="text-xl sm:text-2xl font-bold leading-relaxed whitespace-pre-wrap break-words max-w-xs sm:max-w-sm">
                {currentStatus.content}
              </p>
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

        {/* Bottom Reaction & Viewers Bar (Safe bottom padding on mobile) */}
        <div className="p-4 pb-8 sm:pb-4 z-30 flex items-center justify-between bg-gradient-to-t from-black/90 via-black/60 to-transparent">
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
                        className="absolute bottom-full mb-3 left-0 right-0 bg-dark-card border border-dark-border rounded-3xl p-3 shadow-2xl z-50 animate-scale-in max-h-72 flex flex-col"
                      >
                        {/* Tabs: All / Reactions / Views */}
                        <div className="flex items-center justify-between border-b border-dark-border pb-2 mb-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setViewersTab('all')}
                              className={`text-xs font-bold px-2.5 py-1 rounded-xl transition-all ${
                                viewersTab === 'all' ? 'gradient-primary text-white' : 'text-surface-400 hover:text-white'
                              }`}
                            >
                              All ({uniqueViewers.length})
                            </button>
                            <button
                              onClick={() => setViewersTab('reactions')}
                              className={`text-xs font-bold px-2.5 py-1 rounded-xl transition-all ${
                                viewersTab === 'reactions' ? 'gradient-primary text-white' : 'text-surface-400 hover:text-white'
                              }`}
                            >
                              Reactions ({activeReactions.length})
                            </button>
                          </div>
                          <button onClick={() => setShowViewers(false)} className="text-surface-400 hover:text-white text-xs p-1">
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
            <div className="relative flex items-center gap-2 w-full justify-center overflow-x-auto hide-scrollbar px-2">
              {/* Quick Emojis with 1-reaction highlight */}
              {['❤️', '😂', '😮', '👏', '🔥', '🎉'].map((emoji) => {
                const isSelected = myReaction === emoji;
                return (
                  <button
                    key={emoji}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReact(emoji);
                    }}
                    className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-xl sm:text-2xl transition-all cursor-pointer shadow-lg flex-shrink-0 ${
                      isSelected
                        ? 'bg-primary-500 scale-115 ring-2 ring-white'
                        : 'bg-black/60 hover:bg-black/90 hover:scale-120 border border-white/10'
                    }`}
                    title={isSelected ? 'Tap to remove reaction' : `React ${emoji}`}
                  >
                    {emoji}
                  </button>
                );
              })}

              {/* Full Emoji List Picker Button (+) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowEmojiPicker(!showEmojiPicker);
                }}
                className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-lg flex-shrink-0 ${
                  showEmojiPicker || (myReaction && !['❤️', '😂', '😮', '👏', '🔥', '🎉'].includes(myReaction))
                    ? 'gradient-primary text-white scale-110 ring-2 ring-primary-400'
                    : 'bg-black/60 hover:bg-black/90 text-surface-200 hover:text-white border border-white/20'
                }`}
                title="All Emojis"
              >
                {myReaction && !['❤️', '😂', '😮', '👏', '🔥', '🎉'].includes(myReaction) ? (
                  <span className="text-xl">{myReaction}</span>
                ) : (
                  <Plus className="w-5 h-5" />
                )}
              </button>

              {/* Floating Full Emoji Picker Popover */}
              {showEmojiPicker && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-50 animate-scale-in"
                >
                  <EmojiPickerPopover
                    onSelectEmoji={(emoji) => {
                      handleReact(emoji);
                      setShowEmojiPicker(false);
                    }}
                    onClose={() => setShowEmojiPicker(false)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
