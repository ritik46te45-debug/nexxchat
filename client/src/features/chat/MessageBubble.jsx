import { useState } from 'react';
import { Check, CheckCheck, Clock, AlertCircle, Reply, Forward, Star, Trash2, Copy, Edit3, MoreHorizontal, Download, Play, Pause, FileText, MapPin, Users2, BarChart3, Smile } from 'lucide-react';
import { format } from 'date-fns';
import useChatStore from '../../stores/chatStore';
import useAuthStore from '../../stores/authStore';
import toast from 'react-hot-toast';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '🎉', '👏'];

export default function MessageBubble({ message, isOwn, showAvatar, showName }) {
  const [showActions, setShowActions] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const { reactToMessage, deleteMessage, editMessage } = useChatStore();
  const { user } = useAuthStore();

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
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1 group relative`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowReactions(false); }}
      onContextMenu={(e) => {
        e.preventDefault();
        setShowActions(true);
      }}
    >
      <div className={`max-w-[75%] sm:max-w-[65%] relative`}>
        {/* Reply indicator */}
        {message.replyTo && (
          <div className={`px-3 py-2 mb-0.5 rounded-t-xl ${isOwn ? 'bg-primary-700/50' : 'bg-dark-hover'} border-l-2 border-primary-500`}>
            <p className="text-[10px] text-primary-400 font-medium">{message.replyTo.sender?.displayName}</p>
            <p className="text-[11px] text-surface-400 truncate">{message.replyTo.content || message.replyTo.type}</p>
          </div>
        )}

        {/* Forwarded indicator */}
        {message.isForwarded && (
          <div className={`flex items-center gap-1 px-3 pt-1 text-[10px] text-surface-500 ${isOwn ? '' : ''}`}>
            <Forward className="w-3 h-3" /> Forwarded
          </div>
        )}

        {/* Message body */}
        <div className={`px-4 py-2 ${isOwn ? 'msg-sent' : 'msg-received'} ${message.replyTo ? 'rounded-t-none' : ''}`}>
          {/* Group: sender name */}
          {showName && !isOwn && (
            <p className="text-xs font-semibold text-primary-400 mb-1">{message.sender?.displayName}</p>
          )}

          {/* Attachments */}
          {message.attachments?.length > 0 && (
            <div className="mb-1.5">
              {message.attachments.map((att, i) => (
                <AttachmentView key={i} attachment={att} />
              ))}
            </div>
          )}

          {/* Text content */}
          {message.content && (
            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
            </p>
          )}

          {/* Poll */}
          {message.type === 'poll' && message.poll && (
            <PollView poll={message.poll} messageId={message._id} userId={user?._id} />
          )}

          {/* Location */}
          {message.type === 'location' && message.location && (
            <div className="flex items-center gap-2 mt-1">
              <MapPin className="w-4 h-4 text-accent-red" />
              <div>
                <p className="text-sm font-medium">{message.location.name || 'Location'}</p>
                {message.location.address && <p className="text-xs text-surface-400">{message.location.address}</p>}
              </div>
            </div>
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

          {/* Meta: time + status + edited */}
          <div className="flex items-center justify-end gap-1.5 mt-1 -mb-0.5">
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

        {/* Hover action buttons */}
        {showActions && (
          <div className={`absolute top-0 ${isOwn ? '-left-2 -translate-x-full' : '-right-2 translate-x-full'} flex items-center gap-0.5 bg-dark-card border border-dark-border rounded-lg p-0.5 shadow-xl z-20 animate-fade-in`}>
            <button onClick={() => setShowReactions(!showReactions)} className="p-1.5 rounded-md hover:bg-dark-hover text-surface-400 hover:text-white" title="React">
              <Smile className="w-4 h-4" />
            </button>
            <button className="p-1.5 rounded-md hover:bg-dark-hover text-surface-400 hover:text-white" title="Reply">
              <Reply className="w-4 h-4" />
            </button>
            <button onClick={handleCopy} className="p-1.5 rounded-md hover:bg-dark-hover text-surface-400 hover:text-white" title="Copy">
              <Copy className="w-4 h-4" />
            </button>
            {isOwn && (
              <button onClick={() => handleDelete(true)} className="p-1.5 rounded-md hover:bg-dark-hover text-surface-400 hover:text-red-400" title="Delete">
                <Trash2 className="w-4 h-4" />
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
                className="w-8 h-8 rounded-lg hover:bg-dark-hover flex items-center justify-center text-lg transition-all hover:scale-125"
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
    // Fallback direct open/download
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

  if (attachment.type === 'audio' || attachment.type === 'voice') {
    return (
      <div className="flex items-center gap-3 min-w-[220px] p-1.5 bg-black/20 rounded-xl">
        <audio src={attachment.url} controls className="w-full h-8" style={{ filter: 'invert(1) hue-rotate(180deg)' }} />
        <button
          onClick={(e) => downloadFile(e, attachment.url, attachment.fileName || 'audio.webm')}
          className="p-1.5 rounded-lg bg-dark-card hover:bg-dark-hover text-surface-300 hover:text-white transition-all flex-shrink-0"
          title="Download Audio"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
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

// Group reactions helper
function groupReactions(reactions) {
  const map = {};
  reactions.forEach(r => {
    if (!map[r.emoji]) map[r.emoji] = 0;
    map[r.emoji]++;
  });
  return Object.entries(map).map(([emoji, count]) => ({ emoji, count }));
}
