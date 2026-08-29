import { useState, useRef, useMemo } from 'react';
import {
  Check, CheckCheck, Clock, AlertCircle, Reply, Forward, Star,
  Trash2, Copy, Edit3, MoreHorizontal, Download, Play, Pause,
  FileText, MapPin, Users2, BarChart2, Smile, Timer, Pin,
  MessageSquare, ExternalLink, Globe, Bell, CheckSquare, Eye
} from 'lucide-react';
import { format } from 'date-fns';
import useChatStore from '../../stores/chatStore';
import useAuthStore from '../../stores/authStore';
import ViewOnceModal from './ViewOnceModal';
import AudioWaveformPlayer from './AudioWaveformPlayer';
import CustomVideoPlayer from './CustomVideoPlayer';
import toast from 'react-hot-toast';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉', '👏', '💯', '🚀'];

const safeFormatTime = (dateStr) => {
  try {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return format(d, 'h:mm a');
  } catch {
    return '';
  }
};

export default function MessageBubble({
  message,
  isOwn,
  showAvatar,
  showName,
  isGroupStart = true,
  isGroupEnd = true,
  onOpenThread,
  onPinMessage,
  isPinned,
  onJumpToMessage,
  onOpenImageViewer,
  onForward,
  onRemind,
  isSelectionMode,
  isSelected,
  onToggleSelect,
}) {
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [showQuickReactions, setShowQuickReactions] = useState(false);
  const [showViewOnceModal, setShowViewOnceModal] = useState(false);
  const [translatedText, setTranslatedText] = useState(null);
  const [isTranslating, setIsTranslating] = useState(false);

  const longPressTimer = useRef(null);
  const contextMenuRef = useRef(null);

  // Auto-dismiss reaction/context menu on outside tap or click anywhere on screen
  useEffect(() => {
    if (!showContextMenu) return;

    const handleDismiss = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        setShowContextMenu(false);
      }
    };

    document.addEventListener('pointerdown', handleDismiss);
    document.addEventListener('touchstart', handleDismiss);
    return () => {
      document.removeEventListener('pointerdown', handleDismiss);
      document.removeEventListener('touchstart', handleDismiss);
    };
  }, [showContextMenu]);

  const {
    reactToMessage, deleteMessage, toggleStarMessage,
    setEditingMessage, setReplyingMessage, votePoll
  } = useChatStore();
  const { user } = useAuthStore();

  const myId = (user?._id || user)?.toString();
  const isViewOnceViewed = message?.isViewOnce && Array.isArray(message.viewedBy) && message.viewedBy.some(v => (v.user?._id || v.user)?.toString() === myId);
  const isStarred = Array.isArray(message?.starredBy) && message.starredBy.some(id => (id?._id || id)?.toString() === myId);

  // Grouped Reactions
  const reactionGroups = useMemo(() => {
    if (!message?.reactions || message.reactions.length === 0) return [];
    const groups = {};
    message.reactions.forEach((r) => {
      if (!groups[r.emoji]) groups[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
      groups[r.emoji].count += 1;
      groups[r.emoji].users.push(r.user?.displayName || r.user?.username || 'User');
    });
    return Object.values(groups);
  }, [message?.reactions]);

  if (!message) return null;

  // Deleted for everyone
  if (message.isDeletedForEveryone) {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1.5 px-2`}>
        <div className="max-w-[75%] px-4 py-2 rounded-2xl bg-dark-card/40 border border-dark-border/40 italic text-surface-500 text-xs flex items-center gap-2">
          <span>🚫</span>
          <span>This message was deleted</span>
        </div>
      </div>
    );
  }

  // System message
  if (message.type === 'system') {
    return (
      <div className="flex justify-center my-3 px-2">
        <span className="px-3.5 py-1 rounded-full bg-dark-card/70 border border-dark-border text-[11px] text-surface-400 font-medium">
          {message.content}
        </span>
      </div>
    );
  }

  // Call record message
  if (message.type === 'call') {
    const callData = message.callData;
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1.5 px-2`}>
        <div className="max-w-[75%] px-4 py-3 rounded-2xl bg-dark-card border border-dark-border flex items-center gap-3 shadow-md">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
            callData?.status === 'answered' ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red'
          }`}>
            📞
          </div>
          <div>
            <p className="text-xs font-bold text-white">
              {callData?.callType === 'video' ? 'Video' : 'Voice'} Call
            </p>
            <p className="text-[11px] text-surface-400">
              {callData?.status === 'answered'
                ? `Duration: ${Math.floor((callData?.duration || 0) / 60)}:${String((callData?.duration || 0) % 60).padStart(2, '0')}`
                : callData?.status === 'missed' ? 'Missed Call' : 'Declined'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Handle reactions
  const handleReaction = async (emoji) => {
    await reactToMessage(message._id, emoji);
    setShowQuickReactions(false);
    setShowContextMenu(false);
  };

  // Copy text
  const handleCopy = () => {
    const textToCopy = message.content || message.attachments?.[0]?.url || '';
    navigator.clipboard.writeText(textToCopy);
    toast.success('Copied to clipboard');
    setShowContextMenu(false);
  };

  // Star message
  const handleToggleStar = async () => {
    await toggleStarMessage(message._id);
    toast.success(isStarred ? 'Removed from starred' : 'Message starred');
    setShowContextMenu(false);
  };

  // Translate message inline
  const handleTranslate = async () => {
    if (!message.content) return;
    setIsTranslating(true);
    try {
      const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(message.content)}`);
      const data = await res.json();
      const translation = data?.[0]?.map((item) => item[0]).join('') || message.content;
      setTranslatedText(translation);
    } catch {
      toast.error('Translation unavailable');
    } finally {
      setIsTranslating(false);
      setShowContextMenu(false);
    }
  };

  // Delete message
  const handleDelete = async (forEveryone = false) => {
    await deleteMessage(message._id, forEveryone);
    toast.success(forEveryone ? 'Deleted for everyone' : 'Deleted for you');
    setShowContextMenu(false);
  };

  // Long press for mobile
  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      setShowContextMenu(true);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  // Check if content is purely 1-3 emojis
  const isOnlyEmoji = message.type === 'text' && message.content && /^(\p{Emoji_Presentation}|\p{Extended_Pictographic}){1,3}$/u.test(message.content.trim());

  // Delivery status icon (Vivid WhatsApp Blue for Read ticks)
  const StatusIcon = () => {
    if (!isOwn) return null;
    switch (message.status) {
      case 'sending': return <Clock className="w-3.5 h-3.5 text-surface-400 animate-spin" />;
      case 'sent': return <Check className="w-3.5 h-3.5 text-surface-400" />;
      case 'delivered': return <CheckCheck className="w-3.5 h-3.5 text-surface-300" />;
      case 'read': return <CheckCheck className="w-3.5 h-3.5 text-[#38bdf8] drop-shadow-[0_0_6px_rgba(56,189,248,0.6)] font-bold" />;
      case 'failed': return <AlertCircle className="w-3.5 h-3.5 text-accent-red" />;
      default: return <Check className="w-3.5 h-3.5 text-surface-400" />;
    }
  };

  // 1. DEDICATED FULL CIRCULAR VIDEO NOTE LAYOUT (PERFECTLY CENTERED, NEVER CUT IN HALF)
  if (message.type === 'video_note' && message.attachments?.[0]?.url) {
    return (
      <div className={`flex flex-col my-3 px-2 ${isOwn ? 'items-end' : 'items-start'}`}>
        <div className="flex items-center gap-2">
          {showAvatar && !isOwn && (
            <div className="w-7 h-7 rounded-full flex-shrink-0 mb-1">
              {message.sender?.avatar?.url ? (
                <img src={message.sender.avatar.url} alt="" className="w-7 h-7 rounded-full object-cover shadow-sm" />
              ) : (
                <div className="w-7 h-7 rounded-full gradient-primary text-white text-xs font-bold flex items-center justify-center">
                  {(message.sender?.displayName || 'U').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col items-center">
            <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-full overflow-hidden border-4 border-primary-500 shadow-2xl bg-black relative flex items-center justify-center">
              <video
                src={message.attachments[0].url}
                playsInline
                controls
                className="w-full h-full object-cover rounded-full"
              />
            </div>

            <div className="flex items-center gap-2 mt-1.5 px-3 py-1 rounded-full bg-dark-card/80 border border-dark-border text-[10px] text-surface-400">
              <span>🎥 Video Note</span>
              <span>•</span>
              <span>{safeFormatTime(message.createdAt)}</span>
              <StatusIcon />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. DEDICATED FULL POLL CARD (CENTERED / WELL-PROPORTIONED)
  if (message.type === 'poll' && message.poll) {
    return (
      <div className={`flex my-2 px-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <div className="w-full max-w-sm sm:max-w-md p-4 rounded-3xl bg-dark-card border border-dark-border/80 shadow-2xl text-xs select-none relative">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-primary-500/20 text-primary-400 flex items-center justify-center">
                <BarChart2 className="w-4 h-4" />
              </div>
              <span className="font-bold text-white text-sm">{message.poll.question}</span>
            </div>
            {showName && !isOwn && (
              <span className="text-[10px] text-primary-400 font-semibold">{message.sender?.displayName}</span>
            )}
          </div>

          {/* Poll Options */}
          <div className="space-y-2.5">
            {message.poll.options?.map((opt, idx) => {
              const totalVotes = message.poll.options.reduce((sum, o) => sum + (o.votes?.length || 0), 0);
              const optVotes = opt.votes?.length || 0;
              const percentage = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
              const hasVoted = opt.votes?.some((v) => (v?._id || v)?.toString() === myId);

              return (
                <button
                  key={idx}
                  onClick={() => votePoll(message._id, idx)}
                  className={`w-full p-3 rounded-2xl border text-left relative overflow-hidden transition-all cursor-pointer ${
                    hasVoted
                      ? 'border-primary-500 bg-primary-500/20 shadow-md'
                      : 'border-dark-border bg-dark-input/60 hover:bg-dark-hover'
                  }`}
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-primary-500/30 transition-all duration-500 pointer-events-none"
                    style={{ width: `${percentage}%` }}
                  />
                  <div className="relative flex items-center justify-between gap-2 z-10">
                    <span className="font-semibold text-white">{opt.text}</span>
                    <span className="font-mono text-xs font-bold text-primary-300">{percentage}% ({optVotes})</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-3 pt-2.5 border-t border-dark-border/60 flex items-center justify-between text-[10px] text-surface-400">
            <span>{message.poll.isAnonymous ? '🔒 Anonymous' : '👥 Public'} • {message.poll.isMultipleChoice ? 'Multiple choice' : 'Single choice'}</span>
            <div className="flex items-center gap-1">
              <span>{safeFormatTime(message.createdAt)}</span>
              <StatusIcon />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. STANDARD MESSAGE BUBBLES
  return (
    <div
      id={`msg-${message._id}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onContextMenu={(e) => {
        e.preventDefault();
        setShowContextMenu(true);
      }}
      className={`flex items-end gap-2 mb-1 px-2 group relative transition-colors ${
        isSelected ? 'bg-primary-500/10 rounded-2xl' : ''
      } ${isOwn ? 'justify-end' : 'justify-start'}`}
    >
      {/* Selection Mode Checkbox */}
      {isSelectionMode && (
        <button
          onClick={() => onToggleSelect(message._id)}
          className={`w-5 h-5 rounded-lg flex items-center justify-center border transition-all flex-shrink-0 mb-2 ${
            isSelected
              ? 'gradient-primary border-transparent text-white shadow-sm'
              : 'border-dark-border bg-dark-input'
          }`}
        >
          {isSelected && <Check className="w-3.5 h-3.5" />}
        </button>
      )}

      {/* Other user avatar (if group start) */}
      {!isOwn && (
        <div className="w-7 h-7 rounded-full flex-shrink-0 mb-1">
          {showAvatar && message.sender?.avatar?.url ? (
            <img src={message.sender.avatar.url} alt="" className="w-7 h-7 rounded-full object-cover shadow-sm" />
          ) : showAvatar ? (
            <div className="w-7 h-7 rounded-full gradient-primary text-white text-xs font-bold flex items-center justify-center">
              {(message.sender?.displayName || 'U').charAt(0).toUpperCase()}
            </div>
          ) : <div className="w-7" />}
        </div>
      )}

      {/* Bubble Container */}
      <div className="max-w-[85%] sm:max-w-[70%] relative flex flex-col">
        {/* Reply Header Preview */}
        {message.replyTo && (
          <div
            onClick={() => onJumpToMessage && onJumpToMessage(message.replyTo._id)}
            className={`px-3 py-1.5 mb-0.5 rounded-t-2xl cursor-pointer transition-all hover:opacity-90 ${
              isOwn ? 'bg-primary-700/60' : 'bg-dark-hover'
            } border-l-2 border-primary-400`}
          >
            <p className="text-[10px] text-primary-300 font-bold">{message.replyTo.sender?.displayName || 'User'}</p>
            <p className="text-[11px] text-surface-300 truncate">{message.replyTo.content || `[${message.replyTo.type}]`}</p>
          </div>
        )}

        {/* Forwarded Header */}
        {message.isForwarded && (
          <div className="flex items-center gap-1 px-3 pt-1 text-[10px] text-surface-400 font-medium italic">
            <Forward className="w-3 h-3" /> Forwarded
          </div>
        )}

        {/* Bubble Core */}
        <div
          className={`px-3.5 sm:px-4 py-2 transition-all shadow-sm ${
            isOwn
              ? 'gradient-primary text-white rounded-2xl rounded-br-sm'
              : 'bg-dark-card border border-dark-border text-surface-100 rounded-2xl rounded-bl-sm'
          } ${message.replyTo ? 'rounded-t-none' : ''}`}
        >
          {/* Sender Name in Groups */}
          {showName && !isOwn && (
            <p className="text-[11px] font-bold text-primary-400 mb-1">{message.sender?.displayName}</p>
          )}

          {/* VIEW ONCE MEDIA */}
          {message.isViewOnce && (
            <div className="my-1">
              {isViewOnceViewed ? (
                <div className="flex items-center gap-2 py-2 px-3 rounded-xl bg-black/30 border border-white/10 text-surface-400 text-xs italic">
                  <Eye className="w-4 h-4 text-surface-500" /> Opened view-once media
                </div>
              ) : (
                <button
                  onClick={() => setShowViewOnceModal(true)}
                  className="flex items-center gap-2 py-2 px-4 rounded-xl bg-black/40 hover:bg-black/60 border border-primary-500/50 text-primary-300 text-xs font-bold transition-all cursor-pointer shadow-lg"
                >
                  <Eye className="w-4 h-4 animate-pulse" /> Tap to view self-destructing media
                </button>
              )}
            </div>
          )}

          {/* PHOTOS / IMAGES */}
          {!message.isViewOnce && (message.type === 'image' || message.type === 'gif' || message.type === 'sticker') && message.attachments?.[0]?.url && (
            <div className="my-1 rounded-xl overflow-hidden max-w-sm">
              <img
                src={message.attachments[0].url}
                alt=""
                onClick={() => onOpenImageViewer && onOpenImageViewer(message.attachments, 0)}
                className="w-full h-auto max-h-80 object-cover rounded-xl cursor-pointer hover:opacity-95 transition-opacity"
              />
            </div>
          )}

          {/* VIDEOS */}
          {!message.isViewOnce && message.type === 'video' && message.attachments?.[0]?.url && (
            <div className="my-1 max-w-sm sm:max-w-md">
              <CustomVideoPlayer src={message.attachments[0].url} isOwn={isOwn} />
            </div>
          )}

          {/* AUDIO & VOICE NOTES */}
          {(message.type === 'voice' || message.type === 'audio') && message.attachments?.[0]?.url && (
            <div className="my-1">
              <AudioWaveformPlayer
                src={message.attachments[0].url}
                duration={message.attachments[0].duration}
                isOwn={isOwn}
              />
            </div>
          )}

          {/* DOCUMENTS & FILES */}
          {(message.type === 'document' || message.type === 'file') && message.attachments?.[0]?.url && (
            <div className="my-1">
              <a
                href={message.attachments[0].url}
                target="_blank"
                rel="noopener noreferrer"
                className={`p-3 rounded-2xl flex items-center justify-between gap-3 border transition-all ${
                  isOwn ? 'bg-black/20 border-white/20 hover:bg-black/30' : 'bg-dark-input hover:bg-dark-hover border-dark-border'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-primary-500/20 text-primary-400 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{message.attachments[0].fileName}</p>
                    <p className="text-[10px] text-surface-400">
                      {message.attachments[0].fileSize ? `${(message.attachments[0].fileSize / 1024).toFixed(0)} KB` : 'File'}
                    </p>
                  </div>
                </div>
                <Download className="w-4 h-4 text-surface-300 hover:text-white flex-shrink-0" />
              </a>
            </div>
          )}

          {/* LOCATION CARD (WhatsApp-Style Live / Static GPS Location) */}
          {message.type === 'location' && message.location && (
            <div className="my-1.5 rounded-2xl overflow-hidden bg-gradient-to-b from-[#0a192f] to-[#030d1a] border border-dark-border/80 shadow-md max-w-xs select-none">
              {/* Radar Preview Header */}
              <div className="h-28 w-full relative overflow-hidden flex flex-col items-center justify-center p-3 text-center border-b border-dark-border/50">
                <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:12px_12px] opacity-40" />

                {/* Animated Pulsing Beacon */}
                <div className="relative flex items-center justify-center mb-1">
                  <div className="w-14 h-14 rounded-full bg-accent-green/20 animate-ping absolute" />
                  <div className="w-10 h-10 rounded-full bg-primary-500/30 animate-pulse absolute" />
                  <div className="w-8 h-8 rounded-full gradient-primary text-white flex items-center justify-center shadow-lg shadow-primary-500/50 z-10">
                    <MapPin className="w-4 h-4 text-white" />
                  </div>
                </div>

                <div className="relative z-10 flex items-center gap-1.5 mt-1">
                  <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
                  <span className="text-[11px] font-bold text-accent-green">
                    {message.location.isLive ? 'Live GPS Sharing' : 'GPS Location Pin'}
                  </span>
                </div>
              </div>

              {/* Location Details & Actions */}
              <div className="p-3 flex items-center justify-between gap-2.5 bg-dark-card/60">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white truncate">
                    {message.location.name || 'Shared Location'}
                  </p>
                  <p className="text-[10px] text-surface-400 truncate mt-0.5">
                    {message.location.address || `${message.location.latitude?.toFixed(4)}, ${message.location.longitude?.toFixed(4)}`}
                  </p>
                  <p className="text-[9px] text-surface-500 font-mono mt-0.5">
                    {message.location.latitude?.toFixed(4)}° N, {message.location.longitude?.toFixed(4)}° E
                  </p>
                </div>

                <a
                  href={`https://www.google.com/maps?q=${message.location.latitude},${message.location.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-xl gradient-primary text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-primary-500/20 hover:opacity-90 active:scale-95 transition-all flex-shrink-0"
                  title="View on Google Maps"
                >
                  <span>Maps</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {/* TEXT CONTENT */}
          {message.content && message.type !== 'poll' && (
            <p className={`whitespace-pre-wrap break-words leading-relaxed ${isOnlyEmoji ? 'text-3xl my-1' : 'text-xs sm:text-sm'}`}>
              {message.content}
            </p>
          )}

          {/* Inline Translation Display */}
          {translatedText && (
            <div className="mt-1.5 pt-1.5 border-t border-white/20 text-xs text-primary-200">
              <span className="text-[10px] uppercase font-bold text-surface-400 block mb-0.5">Translated:</span>
              <p className="italic">{translatedText}</p>
            </div>
          )}

          {/* Metadata Footer */}
          <div className="flex items-center justify-end gap-1.5 mt-1 text-[10px] text-surface-400/90 select-none">
            {isPinned && <Pin className="w-3 h-3 text-primary-400 rotate-45" />}
            {isStarred && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />}
            {message.isEdited && <span className="italic">edited</span>}
            <span>{safeFormatTime(message.createdAt)}</span>
            <StatusIcon />
          </div>
        </div>

        {/* Hover / Direct Action Buttons Toolbar (Always visible on hover for instant accessibility!) */}
        <div
          className={`absolute top-0 -translate-y-1/2 ${
            isOwn ? 'left-0 -translate-x-full pr-1.5' : 'right-0 translate-x-full pl-1.5'
          } hidden group-hover:flex items-center gap-1 bg-dark-card/90 border border-dark-border/80 px-2 py-1 rounded-2xl shadow-xl backdrop-blur-md z-20`}
        >
          <button
            onClick={() => handleReaction('👍')}
            className="p-1 rounded-lg hover:bg-dark-hover text-sm hover:scale-125 transition-transform"
            title="React 👍"
          >
            👍
          </button>
          <button
            onClick={() => handleReaction('❤️')}
            className="p-1 rounded-lg hover:bg-dark-hover text-sm hover:scale-125 transition-transform"
            title="React ❤️"
          >
            ❤️
          </button>
          <button
            onClick={() => setReplyingMessage(message)}
            className="p-1 rounded-lg hover:bg-dark-hover text-surface-400 hover:text-white transition-colors"
            title="Reply"
          >
            <Reply className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowContextMenu(true)}
            className="p-1 rounded-lg hover:bg-dark-hover text-surface-400 hover:text-white transition-colors"
            title="More Options"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Reaction Badges */}
        {reactionGroups.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
            {reactionGroups.map((grp) => (
              <button
                key={grp.emoji}
                onClick={() => handleReaction(grp.emoji)}
                className="px-2 py-0.5 rounded-full bg-dark-card border border-dark-border text-xs flex items-center gap-1 shadow-sm hover:scale-105 transition-transform cursor-pointer"
                title={grp.users.join(', ')}
              >
                <span>{grp.emoji}</span>
                <span className="text-[10px] font-bold text-surface-400">{grp.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Context Menu Modal / Popover & Floating Reactions */}
        {showContextMenu && (
          <>
            {/* Invisible Global Screen Backdrop (Dismiss on tap anywhere) */}
            <div
              className="fixed inset-0 z-40 bg-transparent"
              onClick={(e) => {
                e.stopPropagation();
                setShowContextMenu(false);
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                setShowContextMenu(false);
              }}
            />

            <div
              ref={contextMenuRef}
              className={`absolute z-50 bottom-full mb-2 w-64 bg-dark-card/95 backdrop-blur-2xl border border-dark-border/80 rounded-3xl p-2.5 shadow-2xl animate-scale-in text-xs ${
                isOwn ? 'right-0' : 'left-0'
              }`}
            >
              {/* WhatsApp-Style Floating Quick Reactions Bar */}
              <div className="flex items-center justify-between px-1 py-1.5 mb-2 border-b border-dark-border/70 overflow-x-auto hide-scrollbar gap-1">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(emoji)}
                    className="w-8 h-8 rounded-xl hover:bg-dark-hover flex items-center justify-center text-lg hover:scale-135 active:scale-95 transition-all cursor-pointer flex-shrink-0"
                    title={`React ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

            {/* Menu Items */}
            <div className="space-y-0.5">
              <button
                onClick={() => {
                  setReplyingMessage(message);
                  setShowContextMenu(false);
                }}
                className="w-full px-3 py-1.5 rounded-xl hover:bg-dark-hover text-surface-200 hover:text-white flex items-center gap-2.5 transition-colors"
              >
                <Reply className="w-3.5 h-3.5 text-primary-400" /> Reply
              </button>

              <button
                onClick={handleCopy}
                className="w-full px-3 py-1.5 rounded-xl hover:bg-dark-hover text-surface-200 hover:text-white flex items-center gap-2.5 transition-colors"
              >
                <Copy className="w-3.5 h-3.5 text-surface-400" /> Copy Text
              </button>

              <button
                onClick={() => {
                  if (onForward) onForward(message);
                  setShowContextMenu(false);
                }}
                className="w-full px-3 py-1.5 rounded-xl hover:bg-dark-hover text-surface-200 hover:text-white flex items-center gap-2.5 transition-colors"
              >
                <Forward className="w-3.5 h-3.5 text-primary-400" /> Forward
              </button>

              <button
                onClick={handleToggleStar}
                className="w-full px-3 py-1.5 rounded-xl hover:bg-dark-hover text-surface-200 hover:text-white flex items-center gap-2.5 transition-colors"
              >
                <Star className="w-3.5 h-3.5 text-yellow-400" /> {isStarred ? 'Unstar' : 'Star Message'}
              </button>

              <button
                onClick={() => {
                  if (onPinMessage) onPinMessage(message._id);
                  setShowContextMenu(false);
                }}
                className="w-full px-3 py-1.5 rounded-xl hover:bg-dark-hover text-surface-200 hover:text-white flex items-center gap-2.5 transition-colors"
              >
                <Pin className="w-3.5 h-3.5 text-accent-purple" /> {isPinned ? 'Unpin' : 'Pin to top'}
              </button>

              {message.content && (
                <button
                  onClick={handleTranslate}
                  className="w-full px-3 py-1.5 rounded-xl hover:bg-dark-hover text-surface-200 hover:text-white flex items-center gap-2.5 transition-colors"
                >
                  <Globe className="w-3.5 h-3.5 text-accent-blue" /> Translate
                </button>
              )}

              <button
                onClick={() => {
                  if (onRemind) onRemind(message);
                  setShowContextMenu(false);
                }}
                className="w-full px-3 py-1.5 rounded-xl hover:bg-dark-hover text-surface-200 hover:text-white flex items-center gap-2.5 transition-colors"
              >
                <Bell className="w-3.5 h-3.5 text-accent-green" /> Remind Me
              </button>

              {isOwn && message.type === 'text' && (
                <button
                  onClick={() => {
                    setEditingMessage(message);
                    setShowContextMenu(false);
                  }}
                  className="w-full px-3 py-1.5 rounded-xl hover:bg-dark-hover text-surface-200 hover:text-white flex items-center gap-2.5 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5 text-primary-400" /> Edit
                </button>
              )}

              <button
                onClick={() => {
                  onToggleSelect(message._id);
                  setShowContextMenu(false);
                }}
                className="w-full px-3 py-1.5 rounded-xl hover:bg-dark-hover text-surface-200 hover:text-white flex items-center gap-2.5 transition-colors"
              >
                <CheckSquare className="w-3.5 h-3.5 text-surface-400" /> Select Multiple
              </button>

              <div className="border-t border-dark-border pt-1 mt-1">
                <button
                  onClick={() => handleDelete(false)}
                  className="w-full px-3 py-1.5 rounded-xl hover:bg-accent-red/20 text-accent-red flex items-center gap-2.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete for Me
                </button>
                {isOwn && (
                  <button
                    onClick={() => handleDelete(true)}
                    className="w-full px-3 py-1.5 rounded-xl hover:bg-accent-red/20 text-accent-red flex items-center gap-2.5 transition-colors font-bold"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete for Everyone
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
      </div>

      {/* View Once Modal */}
      {showViewOnceModal && (
        <ViewOnceModal
          message={message}
          onClose={() => setShowViewOnceModal(false)}
        />
      )}
    </div>
  );
}
