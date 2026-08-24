import { useState } from 'react';
import {
  Check, CheckCheck, Clock, AlertCircle, Reply, Forward, Star,
  Trash2, Copy, Edit3, MoreHorizontal, Download, Play, Pause,
  FileText, MapPin, Users2, BarChart3, Smile, Timer, Pin,
  MessageSquare, ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import useChatStore from '../../stores/chatStore';
import useAuthStore from '../../stores/authStore';
import ViewOnceModal from './ViewOnceModal';
import AudioWaveformPlayer from './AudioWaveformPlayer';
import toast from 'react-hot-toast';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '🎉', '👏'];

export default function MessageBubble({
  message,
  isOwn,
  showAvatar,
  showName,
  onOpenThread,
  onPinMessage,
  isPinned,
}) {
  const [showActions, setShowActions] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [showViewOnceModal, setShowViewOnceModal] = useState(false);
  const { reactToMessage, deleteMessage, editMessage, toggleStarMessage } = useChatStore();
  const { user } = useAuthStore();

  const myId = (user?._id || user)?.toString();
  const isViewOnceViewed = message?.isViewOnce && Array.isArray(message.viewedBy) && message.viewedBy.some(v => (v.user?._id || v.user)?.toString() === myId);
  const isStarred = Array.isArray(message?.starredBy) && message.starredBy.some(id => (id?._id || id)?.toString() === myId);

  if (!message) return null;

  if (message.isDeletedForEveryone) {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1`}>
        <div className="max-w-[75%] px-4 py-2 rounded-2xl bg-dark-card/50 border border-dark-border/50 italic text-surface-500 text-sm">
          🚫 This message was deleted
        </div>
      </div>
    );
  }

  // System messages
  if (message.type === 'system') {
    return (
      <div className="flex justify-center my-3">
        <span className="px-3 py-1 rounded-full bg-dark-card/60 border border-dark-border text-[11px] text-surface-500">
          {message.content}
        </span>
      </div>
    );
  }

  // Call messages
  if (message.type === 'call') {
    const callData = message.callData;
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1`}>
        <div className="max-w-[75%] px-4 py-3 rounded-2xl bg-dark-card border border-dark-border flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${callData?.status === 'answered' ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red'}`}>
            📞
          </div>
          <div>
            <p className="text-sm text-white font-medium">
              {callData?.callType === 'video' ? 'Video' : 'Voice'} Call
            </p>
            <p className="text-xs text-surface-500">
              {callData?.status === 'answered'
                ? `${Math.floor((callData?.duration || 0) / 60)}:${String((callData?.duration || 0) % 60).padStart(2, '0')}`
                : callData?.status === 'missed' ? 'Missed' : 'Declined'
              }
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleReaction = async (emoji) => {
    await reactToMessage(message._id, emoji);
    setShowReactions(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    toast.success('Copied to clipboard');
    setShowActions(false);
  };

  const handleToggleStar = async () => {
    try {
      await toggleStarMessage(message._id);
      toast.success(isStarred ? 'Unstarred' : 'Starred bookmark added');
    } catch {
      toast.error('Failed to toggle star');
    }
    setShowActions(false);
  };

  const handleDelete = async (forEveryone = false) => {
    await deleteMessage(message._id, forEveryone);
    setShowActions(false);
  };

  const StatusIcon = () => {
    if (!isOwn) return null;
    switch (message.status) {
      case 'sending': return <Clock className="w-3.5 h-3.5 text-surface-500" />;
      case 'sent': return <Check className="w-3.5 h-3.5 text-surface-500" />;
      case 'delivered': return <CheckCheck className="w-3.5 h-3.5 text-surface-400" />;
      case 'read': return (user?.privacy?.readReceipts === false)
        ? <CheckCheck className="w-3.5 h-3.5 text-surface-400" />
        : <CheckCheck className="w-3.5 h-3.5 text-primary-400" />;
      case 'failed': return <AlertCircle className="w-3.5 h-3.5 text-accent-red" />;
      default: return <Check className="w-3.5 h-3.5 text-surface-500" />;
    }
  };

  return (
    <div
      id={`msg-${message._id}`}
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1 group relative`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowReactions(false); }}
      onContextMenu={(e) => {
        e.preventDefault();
        setShowActions(true);
      }}
    >
      <div className={`max-w-[85%] sm:max-w-[70%] relative`}>
        {/* Reply indicator */}
        {message.replyTo && (
          <div className={`px-3 py-2 mb-0.5 rounded-t-xl ${isOwn ? 'bg-primary-700/50' : 'bg-dark-hover'} border-l-2 border-primary-500`}>
            <p className="text-[10px] text-primary-400 font-medium">{message.replyTo.sender?.displayName}</p>
            <p className="text-[11px] text-surface-400 truncate">{message.replyTo.content || message.replyTo.type}</p>
          </div>
        )}

        {/* Forwarded indicator */}
        {message.isForwarded && (
          <div className="flex items-center gap-1 px-3 pt-1 text-[10px] text-surface-500">
            <Forward className="w-3 h-3" /> Forwarded
          </div>
        )}

        {/* Message body */}
        <div className={`px-3.5 sm:px-4 py-2 ${isOwn ? 'msg-sent' : 'msg-received'} ${message.replyTo ? 'rounded-t-none' : ''}`}>
          {/* Group: sender name */}
          {showName && !isOwn && (
            <p className="text-xs font-semibold text-primary-400 mb-1">{message.sender?.displayName}</p>
          )}

          {/* Circular Video Note Mode */}
          {message.type === 'video_note' && message.attachments?.[0]?.url && (
            <div className="my-1.5 flex flex-col items-center">
              <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-full overflow-hidden border-2 border-primary-500/60 shadow-xl bg-black relative">
                <video
                  src={message.attachments[0].url}
                  controls
                  playsInline
                  className="w-full h-full object-cover rounded-full"
                />
              </div>
              <span className="text-[10px] text-surface-400 mt-1 flex items-center gap-1">
                🎥 Video note
              </span>
            </div>
          )}

          {/* Audio / Voice Waveform Player */}
          {(message.type === 'voice' || message.type === 'audio') && message.attachments?.[0]?.url && (
            <div className="my-1">
              <AudioWaveformPlayer
                src={message.attachments[0].url}
                duration={message.attachments[0].duration}
                isOwn={isOwn}
              />
            </div>
          )}

          {/* Location card */}
          {message.type === 'location' && message.location && (
            <div className="my-1 rounded-xl overflow-hidden bg-dark-card border border-dark-border max-w-xs">
              <div className="h-28 w-full bg-dark-input relative overflow-hidden">
                <iframe
                  title="Location Map"
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  scrolling="no"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${message.location.longitude - 0.005}%2C${message.location.latitude - 0.005}%2C${message.location.longitude + 0.005}%2C${message.location.latitude + 0.005}&layer=mapnik&marker=${message.location.latitude}%2C${message.location.longitude}`}
                  className="w-full h-full filter invert hue-rotate-180 brightness-90 contrast-125 pointer-events-none"
                />
              </div>
              <div className="p-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-accent-red flex-shrink-0" />
                    {message.location.name || 'Shared Location'}
                  </p>
                  <p className="text-[10px] text-surface-400 truncate mt-0.5">{message.location.address}</p>
                </div>
                <a
                  href={`https://www.google.com/maps?q=${message.location.latitude},${message.location.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 flex items-center justify-center flex-shrink-0 transition-all"
                  title="Open in Google Maps"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}

          {/* Standard Attachments */}
          {message.type !== 'video_note' && message.type !== 'voice' && message.type !== 'audio' && message.type !== 'location' && (
            message.isViewOnce ? (
              <div className="my-1.5">
                {isViewOnceViewed ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/25 border border-white/5 text-surface-500 cursor-not-allowed">
                    <div className="w-5 h-5 rounded-full border border-surface-600 flex items-center justify-center font-bold text-[10px] text-surface-500">
                      1
                    </div>
                    <span className="text-xs italic">Opened • {message.attachments?.[0]?.type === 'video' ? 'Video' : 'Photo'}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowViewOnceModal(true)}
                    className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-primary-600/30 to-blue-600/30 hover:from-primary-600/45 hover:to-blue-600/45 border border-primary-500/40 text-white transition-all shadow-md active:scale-98 cursor-pointer"
                  >
                    <div className="w-5 h-5 rounded-full bg-primary-500 text-white flex items-center justify-center font-bold text-[10px] shadow-sm animate-pulse">
                      1
                    </div>
                    <span className="text-xs font-semibold">
                      {message.attachments?.[0]?.type === 'video' ? 'Video' : 'Photo'} • Tap to view
                    </span>
                  </button>
                )}

                {showViewOnceModal && (
                  <ViewOnceModal
                    message={message}
                    onClose={() => setShowViewOnceModal(false)}
                    onMarkViewed={() => {
                      if (message.viewedBy) {
                        message.viewedBy.push({ user: myId, viewedAt: new Date() });
                      }
                    }}
                  />
                )}
              </div>
            ) : (
              message.attachments?.length > 0 && (
                <div className="mb-1.5">
                  {message.attachments.map((att, i) => (
                    <AttachmentView key={i} attachment={att} />
                  ))}
                </div>
              )
            )
          )}

          {/* Text content */}
          {message.content && (
            <p className="text-xs sm:text-sm whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
            </p>
          )}

          {/* Poll */}
          {message.type === 'poll' && message.poll && (
            <PollView poll={message.poll} messageId={message._id} userId={user?._id} />
          )}

          {/* Link preview */}
          {message.linkPreview?.title && (
            <a href={message.linkPreview.url} target="_blank" rel="noopener noreferrer" className="block mt-2 p-2.5 rounded-lg bg-black/20 hover:bg-black/30 transition-colors border border-white/5">
              {message.linkPreview.image && (
                <img src={message.linkPreview.image} alt="" className="w-full h-32 object-cover rounded-md mb-2" />
              )}
              <p className="text-xs font-semibold truncate">{message.linkPreview.title}</p>
              {message.linkPreview.description && (
                <p className="text-[11px] text-surface-400 mt-0.5 line-clamp-2">{message.linkPreview.description}</p>
              )}
              <p className="text-[10px] text-surface-500 mt-1">{message.linkPreview.domain}</p>
            </a>
          )}

          {/* Meta: star + time + status + edited + disappearing */}
          <div className="flex items-center justify-end gap-1.5 mt-1 -mb-0.5">
            {isStarred && <Star className="w-3 h-3 text-yellow-400 fill-current" />}
            {isPinned && <Pin className="w-3 h-3 text-primary-400 rotate-45" />}
            {message.expiresAt && <Clock className="w-3 h-3 text-surface-500" title="Disappearing message" />}
            {message.isEdited && <span className="text-[10px] text-surface-500 italic">edited</span>}
            <span className="text-[10px] text-surface-500">
              {(() => {
                try {
                  return format(new Date(message.createdAt || Date.now()), 'HH:mm');
                } catch {
                  return '';
                }
              })()}
            </span>
            <StatusIcon />
          </div>
        </div>

        {/* Thread reply counter button */}
        {(message.threadCount > 0 || onOpenThread) && (
          <button
            onClick={() => onOpenThread && onOpenThread(message)}
            className={`flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all border ${
              isOwn
                ? 'bg-primary-500/10 text-primary-300 border-primary-500/20 hover:bg-primary-500/20 ml-auto'
                : 'bg-dark-card text-surface-400 border-dark-border hover:text-white hover:bg-dark-hover'
            }`}
          >
            <MessageSquare className="w-3 h-3 text-primary-400" />
            <span>{message.threadCount > 0 ? `${message.threadCount} repl${message.threadCount === 1 ? 'y' : 'ies'}` : 'Reply in thread'}</span>
          </button>
        )}

        {/* Reactions */}
        {Array.isArray(message.reactions) && message.reactions.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-0.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
            {groupReactions(message.reactions).map(({ emoji, count }) => (
              <button
                key={emoji}
                onClick={() => handleReaction(emoji)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-dark-card border border-dark-border text-xs hover:bg-dark-hover transition-all"
              >
                <span>{emoji}</span>
                <span className="text-surface-400 text-[10px]">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Hover / Context action menu */}
        {showActions && (
          <div className={`absolute top-0 ${isOwn ? '-left-2 -translate-x-full' : '-right-2 translate-x-full'} flex items-center gap-0.5 bg-dark-card border border-dark-border rounded-xl p-0.5 shadow-xl z-20 animate-fade-in`}>
            <button onClick={() => setShowReactions(!showReactions)} className="p-1.5 rounded-lg hover:bg-dark-hover text-surface-400 hover:text-white" title="React">
              <Smile className="w-3.5 h-3.5" />
            </button>
            <button onClick={handleToggleStar} className="p-1.5 rounded-lg hover:bg-dark-hover text-surface-400 hover:text-yellow-400" title={isStarred ? 'Unstar' : 'Star'}>
              <Star className={`w-3.5 h-3.5 ${isStarred ? 'text-yellow-400 fill-current' : ''}`} />
            </button>
            {onOpenThread && (
              <button onClick={() => onOpenThread(message)} className="p-1.5 rounded-lg hover:bg-dark-hover text-surface-400 hover:text-primary-400" title="Reply in thread">
                <MessageSquare className="w-3.5 h-3.5" />
              </button>
            )}
            {onPinMessage && (
              <button onClick={() => onPinMessage(message._id)} className="p-1.5 rounded-lg hover:bg-dark-hover text-surface-400 hover:text-primary-400" title={isPinned ? 'Unpin' : 'Pin'}>
                <Pin className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={handleCopy} className="p-1.5 rounded-lg hover:bg-dark-hover text-surface-400 hover:text-white" title="Copy">
              <Copy className="w-3.5 h-3.5" />
            </button>
            {isOwn && (
              <button onClick={() => handleDelete(true)} className="p-1.5 rounded-lg hover:bg-dark-hover text-surface-400 hover:text-accent-red" title="Delete">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Reaction picker */}
        {showReactions && (
          <div className={`absolute bottom-full mb-1 ${isOwn ? 'right-0' : 'left-0'} flex items-center gap-0.5 bg-dark-card border border-dark-border rounded-xl p-1.5 shadow-2xl z-30 animate-scale-in`}>
            {REACTION_EMOJIS.map(emoji => (
              <button
                key={emoji}
                onClick={() => handleReaction(emoji)}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg hover:bg-dark-hover flex items-center justify-center text-base sm:text-lg transition-all hover:scale-125"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper to download files to local storage
const downloadFile = async (e, url, fileName) => {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  try {
    toast.loading('Downloading file...', { id: 'file-download' });
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName || 'downloaded_file';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(blobUrl);
    toast.success('Downloaded to storage!', { id: 'file-download' });
  } catch (error) {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'downloaded_file';
    a.target = '_blank';
    a.click();
    toast.dismiss('file-download');
  }
};

// Attachment renderer
function AttachmentView({ attachment }) {
  if (!attachment || !attachment.url) return null;

  if (attachment.type === 'image') {
    return (
      <div className="relative group/att rounded-xl overflow-hidden my-1 max-w-full">
        <img
          src={attachment.url}
          alt={attachment.fileName || 'Photo'}
          className="max-w-full rounded-xl cursor-pointer hover:opacity-95 transition-opacity object-cover"
          loading="lazy"
          style={{ maxHeight: '320px', minWidth: '180px' }}
          onClick={() => window.open(attachment.url, '_blank')}
        />
        <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover/att:opacity-100 transition-opacity z-10">
          <button
            onClick={(e) => downloadFile(e, attachment.url, attachment.fileName || 'photo.jpg')}
            className="p-2 rounded-xl bg-black/75 hover:bg-black text-white hover:text-primary-400 transition-all shadow-lg cursor-pointer"
            title="Download to Storage"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (attachment.type === 'video') {
    return (
      <div className="relative group/att rounded-xl overflow-hidden my-1">
        <video
          src={attachment.url}
          controls
          className="max-w-full rounded-xl"
          style={{ maxHeight: '320px' }}
          preload="metadata"
        />
        <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover/att:opacity-100 transition-opacity z-10">
          <button
            onClick={(e) => downloadFile(e, attachment.url, attachment.fileName || 'video.mp4')}
            className="p-2 rounded-xl bg-black/75 hover:bg-black text-white hover:text-primary-400 transition-all shadow-lg cursor-pointer"
            title="Download Video"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Document/file
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-black/20 hover:bg-black/30 transition-colors border border-white/5 min-w-[220px] my-1">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-primary-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{attachment.fileName}</p>
          <p className="text-xs text-surface-500">
            {attachment.fileSize ? `${(attachment.fileSize / 1024).toFixed(1)} KB` : 'File'}
          </p>
        </div>
      </div>
      <button
        onClick={(e) => downloadFile(e, attachment.url, attachment.fileName)}
        className="p-2 rounded-lg bg-dark-input hover:bg-dark-hover text-surface-300 hover:text-white transition-all flex-shrink-0 cursor-pointer"
        title="Download to Storage"
      >
        <Download className="w-4 h-4 text-primary-400" />
      </button>
    </div>
  );
}

// Poll renderer
function PollView({ poll, messageId, userId }) {
  const { reactToMessage } = useChatStore();
  const totalVotes = poll.options.reduce((sum, opt) => sum + (opt.votes?.length || 0), 0);

  return (
    <div className="space-y-2 min-w-[220px]">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="w-4 h-4 text-primary-400" />
        <p className="font-semibold text-sm">{poll.question}</p>
      </div>
      {poll.options.map((opt, i) => {
        const votes = opt.votes?.length || 0;
        const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
        const hasVoted = opt.votes?.some(v => v === userId || v?._id === userId);

        return (
          <button
            key={i}
            className="w-full text-left relative overflow-hidden rounded-lg border border-dark-border/50 p-2.5 hover:border-primary-500/30 transition-all"
          >
            <div className="absolute inset-0 bg-primary-500/10" style={{ width: `${pct}%` }} />
            <div className="relative flex items-center justify-between">
              <span className={`text-sm ${hasVoted ? 'text-primary-400 font-medium' : 'text-surface-300'}`}>
                {opt.text}
              </span>
              <span className="text-xs text-surface-500">{pct}%</span>
            </div>
          </button>
        );
      })}
      <p className="text-[10px] text-surface-500">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</p>
    </div>
  );
}

function groupReactions(reactions) {
  const map = {};
  reactions.forEach(r => {
    if (!map[r.emoji]) map[r.emoji] = 0;
    map[r.emoji]++;
  });
  return Object.entries(map).map(([emoji, count]) => ({ emoji, count }));
}
