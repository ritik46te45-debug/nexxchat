import { useState, useEffect, useCallback } from 'react';
import useUIStore from '../../stores/uiStore';
import useChatStore from '../../stores/chatStore';
import useAuthStore from '../../stores/authStore';
import { getSocket } from '../../lib/socket';
import toast from 'react-hot-toast';
import Sidebar from './Sidebar';
import HomeTab from '../../features/home/HomeTab';
import ChatList from '../../features/chat/ChatList';
import ChatWindow from '../../features/chat/ChatWindow';
import EmptyChat from '../../features/chat/EmptyChat';
import ContactsTab from '../../features/contacts/ContactsTab';
import StatusTab from '../../features/status/StatusTab';
import CallsTab from '../../features/calls/CallsTab';
import NotificationsTab from '../../features/notifications/NotificationsTab';
import SettingsTab from '../../features/settings/SettingsTab';
import ProfileModal from '../../features/profile/ProfileModal';
import CallOverlay from '../../features/calls/CallOverlay';
import AppLockOverlay from '../../features/auth/AppLockOverlay';
import GlobalSearchModal from '../../features/search/GlobalSearchModal';
import CommandPalette from '../../features/command/CommandPalette';
import NewChatModal from '../../features/chat/NewChatModal';
import NewGroupModal from '../../features/groups/NewGroupModal';

export default function MainLayout() {
  const {
    isMobile, showChatOnMobile, sidebarView, setSidebarView,
    isOnline, isReconnecting,
    showGlobalSearch, setShowGlobalSearch,
    showCommandPalette, setShowCommandPalette
  } = useUIStore();
  const activeConversation = useChatStore((s) => s.activeConversation);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [activeCall, setActiveCall] = useState(null);

  // Global Keyboard Shortcuts (Ctrl+K / Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setShowCommandPalette]);

  // Socket listener for incoming calls
  useEffect(() => {
    const setupCallListener = () => {
      const socket = getSocket();
      if (!socket) return null;

      const onIncoming = (data) => {
        const call = data?.call;
        const callId = data?.callId || call?._id || call?.id;
        const caller = data?.from || call?.caller;
        const targetUserId = (caller?._id || caller)?.toString();
        const displayName = caller?.displayName || caller?.username || 'Incoming Caller';
        const avatar = caller?.avatar;
        const type = data?.type || call?.type || 'voice';
        const conversationId = data?.conversationId || call?.conversation?._id || call?.conversation;

        if (callId && targetUserId) {
          setActiveCall({
            callId,
            targetUserId,
            displayName,
            avatar,
            type,
            conversationId,
            isIncoming: true,
          });
        }
      };

      socket.on('call:incoming', onIncoming);
      return () => socket.off('call:incoming', onIncoming);
    };

    let cleanup = setupCallListener();

    const socket = getSocket();
    const onReconnect = () => {
      if (cleanup) cleanup();
      cleanup = setupCallListener();
    };
    if (socket) {
      socket.on('connect', onReconnect);
    }

    return () => {
      if (cleanup) cleanup();
      if (socket) socket.off('connect', onReconnect);
    };
  }, []);

  const handleStartCall = useCallback((targetUser, type = 'voice') => {
    const socket = getSocket();
    if (!socket) {
      toast.error('Connecting to call server...');
      return;
    }

    let userObj = targetUser;
    let callType = type;

    // Handle if called as handleStartCall('voice' | 'video')
    if (targetUser === 'voice' || targetUser === 'video') {
      callType = targetUser;
      const myId = (useAuthStore.getState().user?._id || useAuthStore.getState().user)?.toString();
      const otherParticipant = activeConversation?.participants?.find(
        (p) => (p.user?._id || p.user)?.toString() !== myId
      );
      userObj = typeof otherParticipant?.user === 'object' ? otherParticipant.user : { _id: otherParticipant?.user };
    }

    // Handle if targetUser is conversation object
    if (userObj?.participants && !userObj._id?.match(/^[0-9a-fA-F]{24}$/)) {
      const myId = (useAuthStore.getState().user?._id || useAuthStore.getState().user)?.toString();
      const otherParticipant = userObj.participants.find(
        (p) => (p.user?._id || p.user)?.toString() !== myId
      );
      userObj = typeof otherParticipant?.user === 'object' ? otherParticipant.user : { _id: otherParticipant?.user };
    }

    const targetUserId = (userObj?._id || userObj)?.toString();
    if (!targetUserId || targetUserId === 'voice' || targetUserId === 'video') {
      toast.error('Cannot reach target user for call');
      return;
    }

    socket.emit('call:initiate', {
      receiverId: targetUserId,
      to: targetUserId,
      type: callType,
      conversationId: activeConversation?._id,
    });

    const onCallCreated = (data) => {
      const callId = data?.callId || data?.call?._id || data?.call?.id;
      if (callId) {
        setActiveCall((prev) => (prev ? { ...prev, callId } : null));
      }
    };
    socket.once('call:initiated', onCallCreated);
    socket.once('call:ringing', onCallCreated);

    setActiveCall({
      callId: `temp_${Date.now()}`,
      targetUserId,
      displayName: userObj?.displayName || userObj?.username || 'User',
      avatar: userObj?.avatar,
      type: callType,
      isIncoming: false,
    });
  }, [activeConversation]);

  // View logic: On mobile, show either the left panel (tab views) or the right panel (chat window)
  const showLeftPanel = isMobile ? !showChatOnMobile : true;
  const showRightPanel = isMobile ? showChatOnMobile : true;

  return (
    <div className="h-full w-full flex flex-col md:flex-row overflow-hidden bg-dark-bg relative">
      {/* Offline banner */}
      {(!isOnline || isReconnecting) && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-yellow-600/90 text-white text-center py-1.5 text-xs font-medium animate-slide-down">
          {!isOnline ? '📡 You are offline — messages will sync when back online' : '🔄 Reconnecting to server...'}
        </div>
      )}

      {/* Desktop / Laptop Sidebar Navigation */}
      {!isMobile && <Sidebar onOpenProfile={() => setShowProfileModal(true)} />}

      {/* Main Content Area */}
      {isMobile && showChatOnMobile && activeConversation ? (
        <div className="flex-1 flex flex-col w-full h-full min-h-0 overflow-hidden">
          <ChatWindow onStartCall={(targetUser, type) => handleStartCall(targetUser, type)} />
        </div>
      ) : sidebarView === 'home' ? (
        <div className={`flex-1 h-full overflow-hidden ${isMobile && !showChatOnMobile ? 'pb-[56px]' : ''}`}>
          <HomeTab
            onStartCall={(friend, type) => handleStartCall(friend, type)}
            onOpenNewChat={() => setShowNewChat(true)}
            onOpenNewGroup={() => setShowNewGroup(true)}
          />
        </div>
      ) : (
        <>
          {/* Main Left Column (Chats, Calls, Status, Contacts, Notifications, Settings) */}
          <div
            className={`
            ${showLeftPanel ? 'flex' : 'hidden'}
            flex-col w-full md:w-[320px] lg:w-[360px] xl:w-[400px]
            border-r border-dark-border bg-dark-bg flex-shrink-0 z-10 h-full overflow-hidden
            ${isMobile && !showChatOnMobile ? 'pb-[56px]' : ''}
          `}
          >
            {sidebarView === 'chats' && <ChatList onOpenProfile={() => setShowProfileModal(true)} />}
            {sidebarView === 'calls' && (
              <CallsTab onStartCall={(friend, type) => handleStartCall(friend, type)} />
            )}
            {sidebarView === 'status' && <StatusTab />}
            {sidebarView === 'contacts' && (
              <ContactsTab onStartCall={(friend, type) => handleStartCall(friend, type)} />
            )}
            {sidebarView === 'notifications' && <NotificationsTab />}
            {sidebarView === 'settings' && (
              <SettingsTab onOpenProfile={() => setShowProfileModal(true)} />
            )}
          </div>

          {/* Chat window / Right area */}
          <div
            className={`
            ${showRightPanel ? 'flex' : 'hidden'}
            flex-col flex-1 min-w-0 h-full overflow-hidden
          `}
          >
            {activeConversation ? (
              <ChatWindow onStartCall={(targetUser, type) => handleStartCall(targetUser, type)} />
            ) : (
              !isMobile && <EmptyChat />
            )}
          </div>
        </>
      )}

      {/* Mobile Bottom Tab Bar (renders only when on tab lists, not inside an active chat) */}
      {isMobile && !showChatOnMobile && (
        <Sidebar onOpenProfile={() => setShowProfileModal(true)} />
      )}

      {/* Profile Modal */}
      {showProfileModal && (
        <ProfileModal onClose={() => setShowProfileModal(false)} />
      )}

      {/* Universal Global Search Modal */}
      {showGlobalSearch && (
        <GlobalSearchModal
          onClose={() => setShowGlobalSearch(false)}
          onStartCall={(friend, type) => handleStartCall(friend, type)}
        />
      )}

      {/* Desktop Command Palette (Ctrl+K) */}
      {showCommandPalette && (
        <CommandPalette
          onClose={() => setShowCommandPalette(false)}
          onOpenNewChat={() => setShowNewChat(true)}
          onOpenNewGroup={() => setShowNewGroup(true)}
          onOpenProfile={() => setShowProfileModal(true)}
        />
      )}



      {/* New DM Modal */}
      {showNewChat && (
        <NewChatModal onClose={() => setShowNewChat(false)} />
      )}

      {/* New Group Modal */}
      {showNewGroup && (
        <NewGroupModal onClose={() => setShowNewGroup(false)} />
      )}

      {/* WebRTC Video / Voice Call Overlay */}
      {activeCall && (
        <CallOverlay
          callData={activeCall}
          isIncoming={activeCall.isIncoming}
          onEndCall={() => setActiveCall(null)}
          onCallIdUpdate={(newCallId) => {
            setActiveCall(prev => prev ? { ...prev, callId: newCallId } : null);
          }}
        />
      )}

      {/* App Lock / PIN Screen Overlay */}
      <AppLockOverlay />
    </div>
  );
}
