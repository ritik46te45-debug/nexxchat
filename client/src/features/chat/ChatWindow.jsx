import { useRef, useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft, Phone, Video, MoreVertical, Search, Loader2,
  ChevronDown, Info, Clock, Timer, Check, Star, Pin, MessageSquare
} from 'lucide-react';
import useChatStore from '../../stores/chatStore';
import useAuthStore from '../../stores/authStore';
import useUIStore from '../../stores/uiStore';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';
import PinnedMessagesBar from './PinnedMessagesBar';
import ThreadDrawer from './ThreadDrawer';
import StarredMessagesModal from './StarredMessagesModal';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function ChatWindow({ onStartCall }) {
  const { activeConversation, messages, isLoadingMessages, hasMoreMessages, fetchMessages, typingUsers, onlineUsers } = useChatStore();
  const { user } = useAuthStore();
  const { isMobile, setShowChatOnMobile } = useUIStore();

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const disappearingMenuRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [showDisappearingMenu, setShowDisappearingMenu] = useState(false);
  const [activeThreadMessage, setActiveThreadMessage] = useState(null);
  const [showStarredModal, setShowStarredModal] = useState(false);
  const [pinnedList, setPinnedList] = useState(activeConversation?.pinnedMessages || []);

  useEffect(() => {
    setPinnedList(activeConversation?.pinnedMessages || []);
  }, [activeConversation?.pinnedMessages]);

  // Click-outside handler for disappearing messages dropdown
  useEffect(() => {
    if (!showDisappearingMenu) return;
    const handleClickOutside = (e) => {
      if (disappearingMenuRef.current && !disappearingMenuRef.current.contains(e.target)) {
        setShowDisappearingMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDisappearingMenu]);

  // Get other user info
  const myId = (user?._id || user)?.toString();
  const otherParticipant = activeConversation?.type === 'private'
    ? activeConversation.participants?.find((p) => {
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
  const isFriend = Array.isArray(otherUser?.friends) && otherUser.friends.some((f) => (f?._id || f)?.toString() === myId);

  const canSeeProfilePhoto = !otherUser?.privacy?.profilePhoto || otherUser.privacy.profilePhoto === 'everyone' || (otherUser.privacy.profilePhoto === 'friends' && isFriend);
  const canSeeOnline = !otherUser?.privacy?.online || otherUser.privacy.online === 'everyone' || (otherUser.privacy.online === 'friends' && isFriend);
  const canSeeLastSeen = !otherUser?.privacy?.lastSeen || otherUser.privacy.lastSeen === 'everyone' || (otherUser.privacy.lastSeen === 'friends' && isFriend);

  const name = activeConversation?.type === 'group'
    ? (activeConversation.groupName || 'Group')
    : activeConversation?.type === 'channel'
    ? (activeConversation.groupName || 'Channel')
    : (otherUser?.displayName || otherUser?.username || 'User');

  const avatar = activeConversation?.type === 'group' || activeConversation?.type === 'channel'
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
    setActiveThreadMessage(null);
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

  // Jump to specific message element
  const handleJumpToMessage = (messageId) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-primary-500', 'rounded-2xl', 'transition-all');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-primary-500');
      }, 2000);
    } else {
      toast('Message is further up in history', { icon: '📜' });
    }
  };

  const handlePinMessage = async (messageId) => {
    try {
      await api.post(`/messages/${activeConversation._id}/pin/${messageId}`);
      toast.success('Message pinned');
      const targetMsg = messages.find((m) => m._id === messageId);
      if (targetMsg) {
        setPinnedList((prev) => [...prev, { message: targetMsg, pinnedBy: myId, pinnedAt: new Date() }]);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to pin message');
    }
  };

  const handleUnpinMessage = async (messageId) => {
    try {
      await api.delete(`/messages/${activeConversation._id}/pin/${messageId}`);
      toast('Message unpinned');
      setPinnedList((prev) => prev.filter((p) => (p.message?._id || p.message)?.toString() !== messageId.toString()));
    } catch {
      toast.error('Failed to unpin message');
    }
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

  const currentDurationLabel = disappearingDurations.find((d) => d.seconds === currentDisappearingDuration)?.label || 'Off';

  const handleSetDisappearingTimer = async (seconds) => {
    try {
      setShowDisappearingMenu(false);
      const { data } = await api.put(`/conversations/${activeConversation._id}/disappearing`, { duration: seconds });
      if (activeConversation) {
        activeConversation.disappearingMessages = data.disappearingMessages;
      }
      toast.success(seconds > 0 ? `Disappearing messages set to ${disappearingDurations.find((d) => d.seconds === seconds)?.label}` : 'Disappearing messages turned off');
    } catch {
      toast.error('Failed to update timer');
    }
  };

  return (
    <div className="flex-1 flex h-full bg-dark-bg relative overflow-hidden">
      {/* Main Chat Column */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* Header */}
        <div className="h-16 px-3 sm:px-4 border-b border-dark-border flex items-center gap-2.5 sm:gap-3 bg-dark-card/60 backdrop-blur-md flex-shrink-0 z-10">
          {/* Mobile back */}
          {isMobile && (
            <button
              onClick={() => setShowChatOnMobile(false)}
              className="p-1.5 rounded-xl text-surface-400 hover:text-white hover:bg-dark-hover transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          {/* Avatar */}
          <div className="relative flex-shrink-0">
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
            <h2 className="font-semibold text-white text-xs sm:text-sm truncate">{name}</h2>
            <p className="text-[11px] sm:text-xs text-surface-500 truncate">
              {typingNames.length > 0
                ? <span className="text-primary-400">{typingNames[0]} is typing...</span>
                : isOnline
                ? <span className="text-accent-green">Online</span>
                : (canSeeLastSeen && otherUser?.lastSeen)
                ? `Last seen ${(() => { try { const d = new Date(otherUser.lastSeen); return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } })()}`
                : ''
              }
            </p>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Starred Messages Viewer Toggle */}
            <button
              onClick={() => setShowStarredModal(true)}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl text-surface-400 hover:text-yellow-400 hover:bg-dark-hover flex items-center justify-center transition-all"
              title="Starred Messages"
            >
              <Star className="w-4 h-4" />
            </button>

            {/* Disappearing Timer Menu Toggle */}
            <div className="relative" ref={disappearingMenuRef}>
              <button
                onClick={() => setShowDisappearingMenu(!showDisappearingMenu)}
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-all ${
                  currentDisappearingDuration > 0
                    ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                    : 'text-surface-400 hover:text-white hover:bg-dark-hover'
                }`}
                title={`Disappearing Messages: ${currentDurationLabel}`}
              >
                <Clock className="w-4 h-4" />
              </button>

              {showDisappearingMenu && (
                <div className="absolute right-0 top-11 w-52 py-2 bg-dark-card/95 backdrop-blur-xl border border-dark-border rounded-2xl shadow-2xl z-50 animate-scale-in">
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

            {/* Call Buttons for Private 1-on-1 Chats */}
            {activeConversation?.type === 'private' && otherUser && onStartCall && (
              <>
                <button
                  onClick={() => onStartCall(otherUser, 'voice')}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl text-surface-400 hover:text-white hover:bg-dark-hover flex items-center justify-center transition-all"
                  title="Voice Call"
                >
                  <Phone className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onStartCall(otherUser, 'video')}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl text-surface-400 hover:text-white hover:bg-dark-hover flex items-center justify-center transition-all"
                  title="Video Call"
                >
                  <Video className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Pinned Messages Header Banner */}
        {pinnedList && pinnedList.length > 0 && (
          <PinnedMessagesBar
            pinnedMessages={pinnedList}
            onJumpToMessage={handleJumpToMessage}
            onUnpinMessage={handleUnpinMessage}
          />
        )}

        {/* Disappearing Messages Active Banner */}
        {currentDisappearingDuration > 0 && (
          <div
            onClick={() => setShowDisappearingMenu(true)}
            className="flex items-center justify-center gap-2 py-1.5 px-3 bg-primary-500/10 border-b border-primary-500/20 text-xs text-primary-300 cursor-pointer hover:bg-primary-500/15 transition-all flex-shrink-0"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Disappearing messages are on ({currentDurationLabel}). Tap to change.</span>
          </div>
        )}

        {/* Messages feed */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-1 relative"
          onScroll={handleScroll}
        >
          {isLoadingMessages && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 text-primary-400 animate-spin" />
            </div>
          )}

          {Object.entries(groupedMessages).map(([date, msgs]) => (
            <div key={date}>
              <div className="flex items-center justify-center my-3">
                <span className="px-3 py-0.5 rounded-full bg-dark-card/80 border border-dark-border text-[11px] text-surface-400 font-medium">
                  {date}
                </span>
              </div>
              {msgs.map((message, i) => (
                <MessageBubble
                  key={message._id}
                  message={message}
                  isOwn={message.sender?._id === user?._id || message.sender?._id === 'self' || message.sender === user?._id}
                  showAvatar={shouldShowAvatar(msgs, i, user?._id)}
                  showName={activeConversation?.type === 'group' || activeConversation?.type === 'channel'}
                  onOpenThread={(msg) => setActiveThreadMessage(msg)}
                  onPinMessage={handlePinMessage}
                  isPinned={pinnedList.some((p) => (p.message?._id || p.message)?.toString() === message._id.toString())}
                />
              ))}
            </div>
          ))}

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
            className="absolute bottom-20 right-5 w-9 h-9 rounded-full bg-dark-card border border-dark-border shadow-lg flex items-center justify-center text-surface-300 hover:text-white hover:bg-dark-hover transition-all animate-fade-in z-10"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        )}

        {/* Message Composer */}
        <MessageComposer />
      </div>

      {/* Thread Drawer side panel */}
      {activeThreadMessage && (
        <ThreadDrawer
          parentMessage={activeThreadMessage}
          conversationId={activeConversation._id}
          onClose={() => setActiveThreadMessage(null)}
          onReplyAdded={() => {
            if (activeThreadMessage) {
              activeThreadMessage.threadCount = (activeThreadMessage.threadCount || 0) + 1;
            }
          }}
        />
      )}

      {/* Starred Messages Modal */}
      {showStarredModal && (
        <StarredMessagesModal
          onClose={() => setShowStarredModal(false)}
          onSelectConversation={() => setShowStarredModal(false)}
        />
      )}
    </div>
  );
}

// Helpers
function groupMessagesByDate(messages) {
  if (!Array.isArray(messages)) return {};
  const groups = {};
  messages.forEach((msg) => {
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
