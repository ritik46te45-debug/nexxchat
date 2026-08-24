import { useRef, useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Phone, Video, MoreVertical, Search, Loader2, ChevronDown, Info, Clock, Timer, Check } from 'lucide-react';
import useChatStore from '../../stores/chatStore';
import useAuthStore from '../../stores/authStore';
import useUIStore from '../../stores/uiStore';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function ChatWindow({ onStartCall }) {
  const { activeConversation, messages, isLoadingMessages, hasMoreMessages, fetchMessages, typingUsers, onlineUsers } = useChatStore();
  const { user } = useAuthStore();
  const { isMobile, setShowChatOnMobile } = useUIStore();

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [showDisappearingMenu, setShowDisappearingMenu] = useState(false);

  // Get other user info
  const myId = (user?._id || user)?.toString();
  const otherParticipant = activeConversation?.type === 'private'
    ? activeConversation.participants?.find(p => {
        const pId = (p.user?._id || p.user)?.toString();
        return pId && myId && pId !== myId;
      })
    : null;

  const otherUser = typeof otherParticipant?.user === 'object' && otherParticipant?.user !== null
    ? otherParticipant.user
    : otherParticipant?.user
    ? { _id: otherParticipant.user.toString(), displayName: 'User' }
    : null;

  // Privacy evaluation for other user
  const isFriend = Array.isArray(otherUser?.friends) && otherUser.friends.some(f => (f?._id || f)?.toString() === myId);

  const canSeeProfilePhoto = !otherUser?.privacy?.profilePhoto || otherUser.privacy.profilePhoto === 'everyone' || (otherUser.privacy.profilePhoto === 'friends' && isFriend);
  const canSeeOnline = !otherUser?.privacy?.online || otherUser.privacy.online === 'everyone' || (otherUser.privacy.online === 'friends' && isFriend);
  const canSeeLastSeen = !otherUser?.privacy?.lastSeen || otherUser.privacy.lastSeen === 'everyone' || (otherUser.privacy.lastSeen === 'friends' && isFriend);

  const name = activeConversation?.type === 'group'
    ? (activeConversation.groupName || 'Group')
    : (otherUser?.displayName || otherUser?.username || 'User');

  const avatar = activeConversation?.type === 'group'
    ? activeConversation.groupAvatar?.url
    : (canSeeProfilePhoto ? otherUser?.avatar?.url : null);

  const isOnline = otherUser && canSeeOnline ? (otherUser.isOnline || onlineUsers.has(otherUser._id?.toString())) : false;

  // Typing indicator
  const convTyping = (activeConversation?._id && typingUsers[activeConversation._id]) || {};
  const typingNames = Object.values(convTyping);

  // Auto-scroll to bottom on new messages (only if at bottom)
  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom(false);
    }
  }, [messages, isAtBottom]);

  // Scroll to bottom on conversation change
  useEffect(() => {
    scrollToBottom(false);
  }, [activeConversation?._id]);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setIsAtBottom(atBottom);
    setShowScrollDown(!atBottom);
  };

  const groupedMessages = groupMessagesByDate(messages);

  if (!activeConversation) {
    return <div className="flex-1 flex items-center justify-center text-surface-500">Select a conversation</div>;
  }

  const disappearingDurations = [
    { label: 'Off', seconds: 0 },
    { label: '24 Hours', seconds: 86400 },
    { label: '7 Days', seconds: 604800 },
    { label: '30 Days', seconds: 2592000 },
    { label: '90 Days', seconds: 7776000 },
  ];

  const currentDisappearingDuration = activeConversation?.disappearingMessages?.enabled
    ? activeConversation.disappearingMessages.duration || 0
    : 0;

  const currentDurationLabel = disappearingDurations.find(d => d.seconds === currentDisappearingDuration)?.label || 'Off';

  const handleSetDisappearingTimer = async (seconds) => {
    try {
      setShowDisappearingMenu(false);
      const { data } = await api.put(`/conversations/${activeConversation._id}/disappearing`, { duration: seconds });
      if (activeConversation) {
        activeConversation.disappearingMessages = data.disappearingMessages;
      }
      toast.success(seconds > 0 ? `Disappearing messages set to ${disappearingDurations.find(d => d.seconds === seconds)?.label}` : 'Disappearing messages turned off');
    } catch (err) {
      toast.error('Failed to update timer');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-dark-bg relative overflow-hidden">
      {/* Header */}
      <div className="h-16 px-4 border-b border-dark-border flex items-center gap-3 bg-dark-card/50 backdrop-blur-md flex-shrink-0 z-10">
        {/* Mobile back */}
        {isMobile && (
          <button
            onClick={() => setShowChatOnMobile(false)}
            className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-dark-hover transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        {/* Avatar */}
        <div className="relative">
          {avatar ? (
            <img src={avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center font-bold text-white text-sm">
              {(name || '?').charAt(0).toUpperCase()}
            </div>
          )}
          {isOnline && <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-accent-green rounded-full border-2 border-dark-card" />}
        </div>

        {/* Name & status */}
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-white text-sm truncate">{name}</h2>
          <p className="text-xs text-surface-500 truncate">
            {typingNames.length > 0
              ? <span className="text-primary-400">{typingNames[0]} is typing...</span>
              : isOnline
              ? <span className="text-accent-green">Online</span>
              : (canSeeLastSeen && otherUser?.lastSeen)
              ? `Last seen ${new Date(otherUser.lastSeen).toLocaleString()}`
              : ''
            }
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Disappearing Timer Menu Toggle */}
          <div className="relative">
            <button
              onClick={() => setShowDisappearingMenu(!showDisappearingMenu)}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                currentDisappearingDuration > 0
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                  : 'text-surface-400 hover:text-white hover:bg-dark-hover'
              }`}
              title={`Disappearing Messages: ${currentDurationLabel}`}
            >
              <Clock className="w-[18px] h-[18px]" />
            </button>

            {showDisappearingMenu && (
              <div className="absolute right-0 top-11 w-52 py-2 bg-dark-surface/95 backdrop-blur-xl border border-dark-border rounded-2xl shadow-2xl z-50 animate-scale-in">
                <div className="px-3 py-1.5 border-b border-dark-border/60 mb-1">
                  <p className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Timer className="w-3.5 h-3.5 text-primary-400" /> Disappearing Messages
                  </p>
                  <p className="text-[10px] text-surface-400 mt-0.5">New messages will expire automatically</p>
                </div>
                {disappearingDurations.map((d) => (
                  <button
                    key={d.seconds}
                    onClick={() => handleSetDisappearingTimer(d.seconds)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs text-surface-300 hover:text-white hover:bg-dark-hover transition-colors"
                  >
                    <span>{d.label}</span>
                    {currentDisappearingDuration === d.seconds && (
                      <Check className="w-4 h-4 text-primary-400 font-bold" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {activeConversation?.type === 'private' && otherUser && onStartCall && (
            <>
              <button
                onClick={() => onStartCall(otherUser, 'voice')}
                className="w-9 h-9 rounded-xl text-surface-400 hover:text-white hover:bg-dark-hover flex items-center justify-center transition-all"
                title="Voice Call"
              >
                <Phone className="w-[18px] h-[18px]" />
              </button>
              <button
                onClick={() => onStartCall(otherUser, 'video')}
                className="w-9 h-9 rounded-xl text-surface-400 hover:text-white hover:bg-dark-hover flex items-center justify-center transition-all"
                title="Video Call"
              >
                <Video className="w-[18px] h-[18px]" />
              </button>
            </>
          )}
          <button className="w-9 h-9 rounded-xl text-surface-400 hover:text-white hover:bg-dark-hover flex items-center justify-center transition-all" title="Info">
            <Info className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>

      {/* Disappearing Messages Active Notification Banner */}
      {currentDisappearingDuration > 0 && (
        <div
          onClick={() => setShowDisappearingMenu(true)}
          className="flex items-center justify-center gap-2 py-1.5 px-3 bg-primary-500/10 border-b border-primary-500/20 text-xs text-primary-300 cursor-pointer hover:bg-primary-500/15 transition-all"
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Disappearing messages are on ({currentDurationLabel}). Tap to change.</span>
        </div>
      )}

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-1 relative"
        onScroll={handleScroll}
      >
        {/* Loading more indicator */}
        {isLoadingMessages && (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 text-primary-400 animate-spin" />
          </div>
        )}

        {/* Messages grouped by date */}
        {Object.entries(groupedMessages).map(([date, msgs]) => (
          <div key={date}>
            <div className="flex items-center justify-center my-4">
              <span className="px-3 py-1 rounded-full bg-dark-card/80 border border-dark-border text-[11px] text-surface-400 font-medium">
                {date}
              </span>
            </div>
            {msgs.map((message, i) => (
              <MessageBubble
                key={message._id}
                message={message}
                isOwn={message.sender?._id === user?._id || message.sender?._id === 'self'}
                showAvatar={shouldShowAvatar(msgs, i, user?._id)}
                showName={activeConversation?.type === 'group'}
              />
            ))}
          </div>
        ))}

        {/* Typing indicator */}
        {typingNames.length > 0 && (
          <div className="flex items-center gap-2 pl-2 py-2 animate-fade-in">
            <div className="flex gap-1">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
            <span className="text-xs text-surface-500">{typingNames[0]} is typing</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollDown && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 right-6 w-10 h-10 rounded-full bg-dark-card border border-dark-border shadow-lg flex items-center justify-center text-surface-300 hover:text-white hover:bg-dark-hover transition-all animate-fade-in z-10"
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      )}

      {/* Message Composer */}
      <MessageComposer />
    </div>
  );
}

// Helpers
function groupMessagesByDate(messages) {
  if (!Array.isArray(messages)) return {};
  const groups = {};
  messages.forEach(msg => {
    if (!msg) return;
    const date = new Date(msg.createdAt || Date.now());
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let dateStr;
    if (date.toDateString() === today.toDateString()) {
      dateStr = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      dateStr = 'Yesterday';
    } else {
      dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    if (!groups[dateStr]) groups[dateStr] = [];
    groups[dateStr].push(msg);
  });
  return groups;
}

function shouldShowAvatar(messages, index, userId) {
  if (!Array.isArray(messages) || index === 0) return true;
  const current = messages[index];
  const prev = messages[index - 1];
  if (!current || !prev) return true;
  const currentSender = (current.sender?._id || current.sender)?.toString();
  const prevSender = (prev.sender?._id || prev.sender)?.toString();
  return currentSender !== prevSender;
}
