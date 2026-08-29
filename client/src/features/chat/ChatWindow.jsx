import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Phone, Video, MoreVertical, Search, Loader2,
  ChevronDown, Info, Clock, Timer, Check, Star, Pin,
  MessageSquare, UploadCloud, Shield, PanelRightOpen,
  PanelRightClose, FileUp
} from 'lucide-react';
import { isToday, isYesterday, format } from 'date-fns';
import useChatStore from '../../stores/chatStore';
import useAuthStore from '../../stores/authStore';
import useUIStore from '../../stores/uiStore';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';
import PinnedMessagesBar from './PinnedMessagesBar';
import ThreadDrawer from './ThreadDrawer';
import StarredMessagesModal from './StarredMessagesModal';
import ForwardModal from './ForwardModal';
import ChatSearchModal from './ChatSearchModal';
import ChatDetailsPanel from './ChatDetailsPanel';
import ImageViewerModal from './ImageViewerModal';
import MessageReminderModal from './MessageReminderModal';
import MultiSelectToolbar from './MultiSelectToolbar';
import { getSocket } from '../../lib/socket';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function ChatWindow({ onStartCall }) {
  const {
    activeConversation, messages, isLoadingMessages, hasMoreMessages,
    fetchMessages, typingUsers, recordingUsers, onlineUsers,
    selectedMessageIds, toggleSelectMessage, clearSelectedMessages,
    batchDeleteMessages, batchStarMessages, batchForwardMessages
  } = useChatStore();
  const { user } = useAuthStore();
  const { isMobile, setShowChatOnMobile } = useUIStore();

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const disappearingMenuRef = useRef(null);

  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [unreadNewCount, setUnreadNewCount] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showDisappearingMenu, setShowDisappearingMenu] = useState(false);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false); // Gallery / Media Panel
  const [showBioModal, setShowBioModal] = useState(false); // User Full Bio Profile Modal
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showStarredModal, setShowStarredModal] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [reminderMessage, setReminderMessage] = useState(null);
  const [imageViewerData, setImageViewerData] = useState(null); // { images, initialIndex }
  const [pinnedList, setPinnedList] = useState(activeConversation?.pinnedMessages || []);

  const myId = (user?._id || user)?.toString();

  // Join active conversation room on socket for instant real-time message delivery
  useEffect(() => {
    const convId = activeConversation?._id?.toString();
    if (!convId) return;

    const socket = getSocket();
    if (socket) {
      socket.emit('conversation:join', { conversationId: convId });
    }
  }, [activeConversation?._id]);

  useEffect(() => {
    setPinnedList(activeConversation?.pinnedMessages || []);
  }, [activeConversation?.pinnedMessages]);

  // Click-outside listener for disappearing menu
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

  // Ensure document window scroll is permanently locked at 0 in mobile typing mode
  useEffect(() => {
    const handleScrollReset = () => {
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
    };
    window.addEventListener('scroll', handleScrollReset);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('scroll', handleScrollReset);
    }
    return () => {
      window.removeEventListener('scroll', handleScrollReset);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('scroll', handleScrollReset);
      }
    };
  }, []);

  // Get other user info
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

  const isOnline = otherUser && canSeeOnline
    ? Boolean(otherUser.isOnline || (onlineUsers && typeof onlineUsers.has === 'function' && onlineUsers.has(otherUser._id?.toString())))
    : false;

  // Typing & Recording indicator text
  const convTyping = (activeConversation?._id && typingUsers?.[activeConversation._id]) || {};
  const typingNames = Object.values(convTyping);
  const convRecording = (activeConversation?._id && recordingUsers?.[activeConversation._id]) || {};
  const recordingNames = Object.values(convRecording);

  // Auto-scroll to bottom or increment unread counter
  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom(false);
      setUnreadNewCount(0);
    } else {
      setUnreadNewCount((prev) => prev + 1);
    }
  }, [messages.length]);

  // Scroll to bottom on conversation switch
  useEffect(() => {
    scrollToBottom(false);
    setUnreadNewCount(0);
    clearSelectedMessages();
  }, [activeConversation?._id]);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    setUnreadNewCount(0);
  };

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setIsAtBottom(atBottom);
    setShowScrollDown(!atBottom);
    if (atBottom) setUnreadNewCount(0);

    // Infinite scroll: fetch older messages
    if (el.scrollTop < 50 && hasMoreMessages && !isLoadingMessages && messages.length > 0) {
      const oldest = messages[0];
      if (oldest?.createdAt) {
        fetchMessages(activeConversation._id, oldest.createdAt);
      }
    }
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

  // Pin / Unpin handlers
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

  // Drag & drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const droppedFiles = Array.from(e.dataTransfer?.files || []);
    if (droppedFiles.length > 0) {
      toast.success(`Received ${droppedFiles.length} dropped file${droppedFiles.length > 1 ? 's' : ''}`);
    }
  };

  // Disappearing messages presets
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
      toast.success(seconds > 0 ? `Disappearing timer set to ${disappearingDurations.find((d) => d.seconds === seconds)?.label}` : 'Disappearing messages off');
    } catch {
      toast.error('Failed to update timer');
    }
  };

  // Safe Date Formatting Helpers
  const safeFormat = (dateStr, fmtStr) => {
    try {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return format(d, fmtStr);
    } catch {
      return '';
    }
  };

  // Smart Date Separator Helper
  const formatDateSeparator = (dateStr) => {
    try {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      if (isToday(d)) return 'TODAY';
      if (isYesterday(d)) return 'YESTERDAY';
      return format(d, 'd MMMM yyyy').toUpperCase();
    } catch {
      return '';
    }
  };

  // Wallpaper styling
  const customWallpaper = localStorage.getItem(`nexchat_wp_${activeConversation?._id}`) || 'default';
  const wallpaperClass = customWallpaper === 'midnight'
    ? 'bg-gradient-to-b from-[#130d24] to-[#0a0614]'
    : customWallpaper === 'ocean'
    ? 'bg-gradient-to-b from-[#0a192f] to-[#020c1b]'
    : customWallpaper === 'emerald'
    ? 'bg-gradient-to-b from-[#06201b] to-[#020e0c]'
    : customWallpaper === 'sunset'
    ? 'bg-gradient-to-b from-[#1c0e29] to-[#0a0514]'
    : 'bg-dark-bg';

  if (!activeConversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-surface-500 bg-dark-bg select-none">
        <MessageSquare className="w-16 h-16 opacity-30 mb-3" />
        <h3 className="text-sm sm:text-base font-bold text-surface-400">Select a conversation</h3>
        <p className="text-xs text-surface-500 mt-1">Start encrypted messaging, calls, or group chats</p>
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex-1 flex flex-col w-full h-full min-h-0 min-w-0 ${wallpaperClass} relative overflow-hidden select-none`}
    >
      {/* Drag & Drop Fullscreen Dropzone Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 bg-primary-950/80 backdrop-blur-md border-4 border-dashed border-primary-500 rounded-3xl flex flex-col items-center justify-center p-6 text-center animate-fade-in pointer-events-none">
          <UploadCloud className="w-20 h-20 text-primary-400 animate-bounce mb-3" />
          <h3 className="text-xl font-bold text-white">Drop files to send into chat</h3>
          <p className="text-xs text-primary-300 mt-1">Images, videos, documents, and archives supported</p>
        </div>
      )}

      {/* Main Chat Column */}
      <div className="flex-1 flex flex-col w-full h-full min-h-0 min-w-0 relative overflow-hidden">
        {/* Chat Top Header - Permanent Fixed Top Bar */}
        <div className="h-14 sm:h-16 px-3 sm:px-4 border-b border-dark-border flex items-center gap-2.5 sm:gap-3 bg-dark-card/95 backdrop-blur-xl flex-shrink-0 z-30 shadow-sm w-full">
          {/* Mobile back */}
          {isMobile && (
            <button
              onClick={() => setShowChatOnMobile(false)}
              className="p-2 rounded-2xl text-surface-400 hover:text-white hover:bg-dark-hover transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          {/* Recipient Avatar (Clicks to view User Full Bio Details) */}
          <div
            className="relative flex-shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              setShowBioModal(true);
            }}
            title="View Profile & Bio"
          >
            {avatar ? (
              <img src={avatar} alt="" className="w-10 h-10 rounded-full object-cover shadow-sm" />
            ) : (
              <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-sm">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            {isOnline && (
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-accent-green border-2 border-dark-card" />
            )}
          </div>

          {/* Name & Live Status Info (Clicks to view Gallery, Media, & Docs) */}
          <div
            className="flex-1 min-w-0 cursor-pointer hover:opacity-90 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              setShowDetailsPanel(true);
            }}
            title="Open Gallery & Media"
          >
            <div className="flex items-center gap-1.5">
              <h2 className="font-bold text-white text-sm sm:text-base truncate leading-tight">{name}</h2>
              {activeConversation.disappearingMessages?.enabled && (
                <Timer className="w-3.5 h-3.5 text-primary-400 flex-shrink-0" title={`Disappearing: ${currentDurationLabel}`} />
              )}
            </div>

            {/* Dynamic Status / Typing / Recording Indicator */}
            {recordingNames.length > 0 ? (
              <p className="text-xs text-accent-red font-medium truncate flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-accent-red animate-pulse" />
                {recordingNames.join(', ')} is recording a voice note...
              </p>
            ) : typingNames.length > 0 ? (
              <p className="text-xs text-primary-400 font-medium truncate flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-primary-400 animate-pulse" />
                {typingNames.join(', ')} is typing...
              </p>
            ) : (
              <p className="text-[11px] text-surface-400 truncate">
                {activeConversation.type === 'group' || activeConversation.type === 'channel'
                  ? `${activeConversation.participants?.length || 0} members`
                  : isOnline
                  ? 'Online'
                  : otherUser?.lastSeen && canSeeLastSeen && safeFormat(otherUser.lastSeen, 'MMM d, h:mm a')
                  ? `Last seen ${safeFormat(otherUser.lastSeen, 'MMM d, h:mm a')}`
                  : 'Encrypted chat'}
              </p>
            )}
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
            {/* Search in Chat */}
            <button
              onClick={() => setShowSearchModal(true)}
              className="p-2 rounded-2xl hover:bg-dark-hover text-surface-400 hover:text-white transition-colors"
              title="Search Messages"
            >
              <Search className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Voice Call */}
            <button
              onClick={() => onStartCall && (otherUser || activeConversation) && onStartCall(otherUser || activeConversation, 'voice')}
              className="p-2 rounded-2xl hover:bg-dark-hover text-surface-400 hover:text-accent-green transition-colors"
              title="Voice Call"
            >
              <Phone className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Video Call */}
            <button
              onClick={() => onStartCall && (otherUser || activeConversation) && onStartCall(otherUser || activeConversation, 'video')}
              className="p-2 rounded-2xl hover:bg-dark-hover text-surface-400 hover:text-primary-400 transition-colors"
              title="Video Call"
            >
              <Video className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Chat Details Toggle */}
            <button
              onClick={() => setShowDetailsPanel(!showDetailsPanel)}
              className={`p-2 rounded-2xl transition-colors ${
                showDetailsPanel ? 'text-primary-400 bg-primary-500/20' : 'text-surface-400 hover:text-white hover:bg-dark-hover'
              }`}
              title="Chat Details & Media"
            >
              <Info className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Pinned Messages Bar */}
        {pinnedList && pinnedList.length > 0 && (
          <PinnedMessagesBar
            pinnedMessages={pinnedList}
            onJumpToMessage={handleJumpToMessage}
            onUnpin={handleUnpinMessage}
          />
        )}

        {/* Messages Scroll Container */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4 space-y-1 hide-scrollbar bg-dark-bg relative"
        >

          {/* Top Loading Spinner for Infinite History Scroll */}
          {isLoadingMessages && (
            <div className="flex justify-center py-2">
              <Loader2 className="w-5 h-5 animate-spin text-primary-400" />
            </div>
          )}

          {/* Render Messages with Smart Grouping and Date Separators */}
          {(messages || []).map((msg, index) => {
            if (!msg) return null;
            const prevMsg = messages[index - 1];
            const nextMsg = messages[index + 1];

            // Date separator check
            const currentDate = safeFormat(msg.createdAt, 'yyyy-MM-dd');
            const prevDate = safeFormat(prevMsg?.createdAt, 'yyyy-MM-dd');
            const showDateHeader = Boolean(currentDate && currentDate !== prevDate);

            // 5-minute consecutive sender grouping
            const isOwn = (msg.sender?._id || msg.sender)?.toString() === myId;
            const prevSenderId = (prevMsg?.sender?._id || prevMsg?.sender)?.toString();
            const currSenderId = (msg.sender?._id || msg.sender)?.toString();
            const timeDiffMins = prevMsg?.createdAt && msg.createdAt && !isNaN(new Date(msg.createdAt).getTime()) && !isNaN(new Date(prevMsg.createdAt).getTime())
              ? Math.abs(new Date(msg.createdAt) - new Date(prevMsg.createdAt)) / 60000
              : 999;

            const isConsecutive = prevSenderId === currSenderId && timeDiffMins < 5 && !showDateHeader;
            const isGroupStart = !isConsecutive;
            const showName = isGroupStart && (activeConversation.type === 'group' || activeConversation.type === 'channel');
            const showAvatar = isGroupStart;

            const isPinned = Array.isArray(pinnedList) && pinnedList.some((p) => (p.message?._id || p.message)?.toString() === msg._id?.toString());
            const isSelected = Array.isArray(selectedMessageIds) && selectedMessageIds.includes(msg._id);

            return (
              <div key={msg._id || msg.clientId || index}>
                {/* Date Badge Separator */}
                {showDateHeader && (
                  <div className="flex justify-center my-3">
                    <span className="px-3.5 py-1 rounded-full bg-dark-card/70 border border-dark-border/60 text-[10px] font-bold tracking-wider text-surface-400 shadow-sm backdrop-blur-md">
                      {formatDateSeparator(msg.createdAt)}
                    </span>
                  </div>
                )}

                {/* Message Bubble */}
                <MessageBubble
                  message={msg}
                  isOwn={isOwn}
                  showAvatar={showAvatar}
                  showName={showName}
                  isGroupStart={isGroupStart}
                  isPinned={isPinned}
                  onPinMessage={handlePinMessage}
                  onJumpToMessage={handleJumpToMessage}
                  onOpenImageViewer={(imgs, idx) => setImageViewerData({ images: imgs, initialIndex: idx })}
                  onForward={(m) => setForwardingMessage(m)}
                  onRemind={(m) => setReminderMessage(m)}
                  isSelectionMode={selectedMessageIds.length > 0}
                  isSelected={isSelected}
                  onToggleSelect={toggleSelectMessage}
                />
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* Floating "↓ X new messages" Badge */}
        {unreadNewCount > 0 && !isAtBottom && (
          <button
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full gradient-primary text-white text-xs font-bold shadow-xl shadow-primary-500/40 flex items-center gap-2 animate-bounce cursor-pointer"
          >
            <ChevronDown className="w-4 h-4" />
            <span>{unreadNewCount} new message{unreadNewCount > 1 ? 's' : ''}</span>
          </button>
        )}

        {/* Floating "Jump to Latest" Button */}
        {showScrollDown && unreadNewCount === 0 && (
          <button
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-20 right-4 z-20 w-10 h-10 rounded-full bg-dark-card/90 border border-dark-border text-surface-300 hover:text-white flex items-center justify-center shadow-xl backdrop-blur-md hover:scale-110 active:scale-95 transition-all cursor-pointer"
            title="Scroll to bottom"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        )}

        {/* Multi-Select Floating Toolbar */}
        <MultiSelectToolbar
          selectedCount={selectedMessageIds.length}
          onForwardSelected={() => {
            if (selectedMessageIds.length > 0) {
              const firstMsg = messages.find((m) => m._id === selectedMessageIds[0]);
              setForwardingMessage(firstMsg);
            }
          }}
          onStarSelected={() => {
            batchStarMessages(selectedMessageIds);
            toast.success('Starred selected messages');
          }}
          onCopySelected={() => {
            const selectedText = messages
              .filter((m) => selectedMessageIds.includes(m._id))
              .map((m) => m.content)
              .filter(Boolean)
              .join('\n');
            navigator.clipboard.writeText(selectedText);
            toast.success('Copied selected messages');
            clearSelectedMessages();
          }}
          onDeleteSelected={() => {
            batchDeleteMessages(selectedMessageIds, false);
            toast.success('Deleted selected messages');
          }}
          onClearSelection={clearSelectedMessages}
        />

        {/* Smart Message Composer */}
        <MessageComposer />
      </div>



      {/* In-Chat Search Modal */}
      {showSearchModal && (
        <ChatSearchModal
          messages={messages}
          onJumpToMessage={handleJumpToMessage}
          onClose={() => setShowSearchModal(false)}
        />
      )}

      {/* Multi-recipient Forward Modal */}
      {forwardingMessage && (
        <ForwardModal
          message={forwardingMessage}
          onClose={() => setForwardingMessage(null)}
        />
      )}

      {/* Message Reminder Modal */}
      {reminderMessage && (
        <MessageReminderModal
          message={reminderMessage}
          onClose={() => setReminderMessage(null)}
        />
      )}

      {/* Lightbox Image Viewer */}
      {imageViewerData && (
        <ImageViewerModal
          images={imageViewerData.images}
          initialIndex={imageViewerData.initialIndex}
          onClose={() => setImageViewerData(null)}
          onForward={(img) => {
            setImageViewerData(null);
            setForwardingMessage({ type: 'image', attachments: [img] });
          }}
        />
      )}

      {/* Shared Media Gallery / Details Drawer */}
      {showDetailsPanel && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-end animate-fade-in select-none"
          onClick={() => setShowDetailsPanel(false)}
        >
          <div
            className="w-full sm:w-96 h-full bg-dark-card border-l border-dark-border shadow-2xl flex flex-col overflow-hidden animate-slide-left"
            onClick={(e) => e.stopPropagation()}
          >
            <ChatDetailsPanel
              conversation={activeConversation}
              messages={messages || []}
              onClose={() => setShowDetailsPanel(false)}
              onOpenImageViewer={(imgs, idx) => setImageViewerData({ images: Array.isArray(imgs) ? imgs : [imgs], initialIndex: idx || 0 })}
            />
          </div>
        </div>
      )}

      {/* User / Contact Details Profile Modal (Bio & Info Viewer when clicking DP) */}
      {showBioModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in select-none"
          onClick={() => setShowBioModal(false)}
        >
          <div
            className="w-full max-w-sm bg-dark-card border border-dark-border rounded-3xl shadow-2xl overflow-hidden animate-scale-in flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-dark-border flex items-center justify-between bg-dark-card/95">
              <h3 className="text-sm font-bold text-white">Contact Info</h3>
              <button
                onClick={() => setShowBioModal(false)}
                className="w-7 h-7 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Profile Content */}
            <div className="p-5 flex flex-col items-center text-center space-y-4 overflow-y-auto hide-scrollbar max-h-[75vh]">
              {/* Avatar */}
              <div className="relative">
                {avatar ? (
                  <img src={avatar} alt="" className="w-24 h-24 rounded-full object-cover ring-4 ring-primary-500/40 shadow-xl" />
                ) : (
                  <div className="w-24 h-24 rounded-full gradient-primary flex items-center justify-center text-3xl font-bold text-white shadow-xl ring-4 ring-primary-500/40">
                    {name.charAt(0).toUpperCase()}
                  </div>
                )}
                {isOnline && (
                  <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-accent-green border-3 border-dark-card shadow-sm" />
                )}
              </div>

              {/* Name & Tag */}
              <div>
                <h2 className="text-lg font-bold text-white">{name}</h2>
                {otherUser?.username && (
                  <p className="text-xs text-primary-400 font-medium mt-0.5">@{otherUser.username}</p>
                )}
                {otherUser?.userCode && (
                  <span className="inline-block mt-1 text-[10px] font-mono font-bold text-surface-300 px-2 py-0.5 rounded-md bg-dark-input border border-dark-border">
                    #{otherUser.userCode}
                  </span>
                )}
              </div>

              {/* Call Buttons */}
              <div className="flex items-center gap-3 w-full justify-center">
                <button
                  onClick={() => {
                    setShowBioModal(false);
                    if (onStartCall && otherUser) onStartCall(otherUser, 'voice');
                  }}
                  className="flex-1 py-2 px-3 rounded-xl bg-dark-input hover:bg-dark-hover border border-dark-border text-surface-200 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Phone className="w-3.5 h-3.5 text-accent-green" />
                  <span>Audio</span>
                </button>
                <button
                  onClick={() => {
                    setShowBioModal(false);
                    if (onStartCall && otherUser) onStartCall(otherUser, 'video');
                  }}
                  className="flex-1 py-2 px-3 rounded-xl bg-dark-input hover:bg-dark-hover border border-dark-border text-surface-200 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Video className="w-3.5 h-3.5 text-primary-400" />
                  <span>Video</span>
                </button>
              </div>

              {/* BIO / ABOUT SECTION */}
              <div className="w-full text-left p-3.5 rounded-2xl bg-dark-input/60 border border-dark-border space-y-1">
                <p className="text-[10px] font-bold text-surface-400 uppercase tracking-wider">About / Bio</p>
                <p className="text-xs text-white leading-relaxed whitespace-pre-wrap break-words font-medium">
                  {otherUser?.about || activeConversation?.groupDescription || 'Hey there! I am using NexChat.'}
                </p>
              </div>

              {/* View Shared Media Button */}
              <button
                onClick={() => {
                  setShowBioModal(false);
                  setShowDetailsPanel(true);
                }}
                className="w-full py-2.5 px-4 rounded-2xl bg-primary-500/20 hover:bg-primary-500/30 text-primary-300 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer border border-primary-500/30"
              >
                <span>View Shared Gallery & Media</span>
              </button>

              {/* Encryption Notice */}
              <div className="w-full text-left p-3 rounded-2xl bg-primary-500/10 border border-primary-500/20 text-[11px] text-primary-300 flex items-center gap-2">
                <span className="text-base">🔒</span>
                <span>Messages and calls are end-to-end encrypted.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
