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
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
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

  const [viewportHeight, setViewportHeight] = useState('100%');

  // Lock mobile viewport so the upper bar never scrolls off-screen in typing mode
  useEffect(() => {
    const handleViewport = () => {
      if (window.visualViewport) {
        setViewportHeight(`${window.visualViewport.height}px`);
      }
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
    };
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewport);
      window.visualViewport.addEventListener('scroll', handleViewport);
      handleViewport();
    }
    window.addEventListener('scroll', handleViewport);
    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewport);
        window.visualViewport.removeEventListener('scroll', handleViewport);
      }
      window.removeEventListener('scroll', handleViewport);
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

  const isOnline = otherUser && canSeeOnline ? (otherUser.isOnline || onlineUsers.has(otherUser._id?.toString())) : false;

  // Typing & Recording indicator text
  const convTyping = (activeConversation?._id && typingUsers[activeConversation._id]) || {};
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

  // Smart Date Separator Helper
  const formatDateSeparator = (dateStr) => {
    const d = new Date(dateStr);
    if (isToday(d)) return 'TODAY';
    if (isYesterday(d)) return 'YESTERDAY';
    return format(d, 'd MMMM yyyy').toUpperCase();
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
      style={isMobile ? { height: viewportHeight } : {}}
      className={`flex-1 flex ${isMobile ? 'fixed inset-0 z-40' : 'h-full'} ${wallpaperClass} relative overflow-hidden select-none`}
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
      <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 relative overflow-hidden">
        {/* Chat Top Header - WhatsApp Sticky Top Bar */}
        <div className="sticky top-0 h-16 px-3 sm:px-4 border-b border-dark-border flex items-center gap-2.5 sm:gap-3 bg-dark-card/90 backdrop-blur-xl flex-shrink-0 z-30 shadow-sm">
          {/* Mobile back */}
          {isMobile && (
            <button
              onClick={() => setShowChatOnMobile(false)}
              className="p-2 rounded-2xl text-surface-400 hover:text-white hover:bg-dark-hover transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          {/* Recipient Avatar */}
          <div className="relative flex-shrink-0 cursor-pointer" onClick={() => setShowDetailsPanel(!showDetailsPanel)}>
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

          {/* Name & Live Status Info */}
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setShowDetailsPanel(!showDetailsPanel)}>
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
                  : otherUser?.lastSeen && canSeeLastSeen
                  ? `Last seen ${format(new Date(otherUser.lastSeen), 'MMM d, h:mm a')}`
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
          {messages.map((msg, index) => {
            const prevMsg = messages[index - 1];
            const nextMsg = messages[index + 1];

            // Date separator check
            const currentDate = msg.createdAt ? format(new Date(msg.createdAt), 'yyyy-MM-dd') : null;
            const prevDate = prevMsg?.createdAt ? format(new Date(prevMsg.createdAt), 'yyyy-MM-dd') : null;
            const showDateHeader = currentDate && currentDate !== prevDate;

            // 5-minute consecutive sender grouping
            const isOwn = (msg.sender?._id || msg.sender)?.toString() === myId;
            const prevSenderId = (prevMsg?.sender?._id || prevMsg?.sender)?.toString();
            const currSenderId = (msg.sender?._id || msg.sender)?.toString();
            const timeDiffMins = prevMsg?.createdAt && msg.createdAt
              ? Math.abs(new Date(msg.createdAt) - new Date(prevMsg.createdAt)) / 60000
              : 999;

            const isConsecutive = prevSenderId === currSenderId && timeDiffMins < 5 && !showDateHeader;
            const isGroupStart = !isConsecutive;
            const showName = isGroupStart && (activeConversation.type === 'group' || activeConversation.type === 'channel');
            const showAvatar = isGroupStart;

            const isPinned = pinnedList.some((p) => (p.message?._id || p.message)?.toString() === msg._id?.toString());
            const isSelected = selectedMessageIds.includes(msg._id);

            return (
              <div key={msg._id || index}>
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

      {/* Right-side Details & Media Gallery Sidebar */}
      {showDetailsPanel && (
        <ChatDetailsPanel
          conversation={activeConversation}
          messages={messages}
          onClose={() => setShowDetailsPanel(false)}
          onJumpToMessage={handleJumpToMessage}
          onOpenImageViewer={(imgs, idx) => setImageViewerData({ images: imgs, initialIndex: idx })}
        />
      )}

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
    </div>
  );
}
