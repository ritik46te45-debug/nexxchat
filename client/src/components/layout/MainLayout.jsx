import { useState, useEffect } from 'react';
import useUIStore from '../../stores/uiStore';
import useChatStore from '../../stores/chatStore';
import useAuthStore from '../../stores/authStore';
import { getSocket } from '../../lib/socket';
import toast from 'react-hot-toast';
import Sidebar from './Sidebar';
import ChatList from '../../features/chat/ChatList';
import ChatWindow from '../../features/chat/ChatWindow';
import EmptyChat from '../../features/chat/EmptyChat';
import ContactsTab from '../../features/contacts/ContactsTab';
import StatusTab from '../../features/status/StatusTab';
import CallsTab from '../../features/calls/CallsTab';
import SettingsTab from '../../features/settings/SettingsTab';
import ProfileModal from '../../features/profile/ProfileModal';
import CallOverlay from '../../features/calls/CallOverlay';

export default function MainLayout() {
  const { isMobile, showChatOnMobile, sidebarView, isOnline, isReconnecting } = useUIStore();
  const activeConversation = useChatStore((s) => s.activeConversation);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [activeCall, setActiveCall] = useState(null); // { targetUserId, displayName, avatar, type, callId, isIncoming }

  // Socket listener for incoming calls
  useEffect(() => {
    let cleanupFn = null;

    const setupCallListener = () => {
      const socket = getSocket();
      if (!socket) return;

      const onIncoming = ({ callId, from, type, conversationId }) => {
        setActiveCall({
          callId,
          targetUserId: from._id || from,
          displayName: from.displayName || 'Incoming Caller',
          avatar: from.avatar,
          type: type || 'voice',
          conversationId,
          isIncoming: true,
        });
      };

      socket.on('call:incoming', onIncoming);
      cleanupFn = () => socket.off('call:incoming', onIncoming);
    };

    setupCallListener();
    const timer = setInterval(() => {
      if (!cleanupFn) setupCallListener();
    }, 1000);

    return () => {
      clearInterval(timer);
      if (cleanupFn) cleanupFn();
    };
  }, []);

  const handleStartCall = (targetUser, type = 'voice') => {
    const socket = getSocket();
    if (!socket) {
      toast.error('Connecting to call server...');
      return;
    }

    const targetUserId = (targetUser?._id || targetUser)?.toString();
    if (!targetUserId) {
      toast.error('Cannot reach target user');
      return;
    }

    const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    socket.emit('call:initiate', {
      to: targetUserId,
      type,
      conversationId: activeConversation?._id,
    });

    setActiveCall({
      callId,
      targetUserId,
      displayName: targetUser?.displayName || targetUser?.username || 'User',
      avatar: targetUser?.avatar,
      type,
      isIncoming: false,
    });
  };

  return (
    <div className="h-[100dvh] flex overflow-hidden bg-dark-bg relative">
      {/* Offline banner */}
      {(!isOnline || isReconnecting) && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-yellow-600/90 text-white text-center py-1.5 text-xs font-medium animate-slide-down">
          {!isOnline ? '📡 You are offline — messages will sync when back online' : '🔄 Reconnecting to server...'}
        </div>
      )}

      {/* Sidebar Navigation */}
      <Sidebar onOpenProfile={() => setShowProfileModal(true)} />

      {/* Main Left Column (Chats, Calls, Status, Contacts, Settings) */}
      <div
        className={`
        ${isMobile ? (showChatOnMobile ? 'hidden' : 'flex') : 'flex'}
        flex-col w-full md:w-[340px] lg:w-[380px] xl:w-[400px]
        border-r border-dark-border bg-dark-bg flex-shrink-0 z-10
      `}
      >
        {sidebarView === 'chats' && <ChatList />}
        {sidebarView === 'calls' && (
          <CallsTab onStartCall={(friend, type) => handleStartCall(friend, type)} />
        )}
        {sidebarView === 'status' && <StatusTab />}
        {sidebarView === 'contacts' && (
          <ContactsTab onStartCall={(friend, type) => handleStartCall(friend, type)} />
        )}
        {sidebarView === 'settings' && (
          <SettingsTab onOpenProfile={() => setShowProfileModal(true)} />
        )}
      </div>

      {/* Chat window / Right area */}
      <div
        className={`
        ${isMobile ? (showChatOnMobile ? 'flex' : 'hidden') : 'flex'}
        flex-col flex-1 min-w-0
      `}
      >
        {activeConversation ? (
          <ChatWindow onStartCall={(targetUser, type) => handleStartCall(targetUser, type)} />
        ) : (
          !isMobile && <EmptyChat />
        )}
      </div>

      {/* Profile Modal */}
      {showProfileModal && (
        <ProfileModal onClose={() => setShowProfileModal(false)} />
      )}

      {/* WebRTC Video / Voice Call Overlay */}
      {activeCall && (
        <CallOverlay
          callData={activeCall}
          isIncoming={activeCall.isIncoming}
          onEndCall={() => setActiveCall(null)}
        />
      )}
    </div>
  );
}
