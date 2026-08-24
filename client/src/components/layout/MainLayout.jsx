import { useState, useEffect, useCallback } from 'react';
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
import AppLockOverlay from '../../features/auth/AppLockOverlay';

export default function MainLayout() {
  const { isMobile, showChatOnMobile, sidebarView, isOnline, isReconnecting } = useUIStore();
  const activeConversation = useChatStore((s) => s.activeConversation);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [activeCall, setActiveCall] = useState(null);

  // Socket listener for incoming calls — use socket events instead of 1s polling
  useEffect(() => {
    const setupCallListener = () => {
      const socket = getSocket();
      if (!socket) return null;

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
      return () => socket.off('call:incoming', onIncoming);
    };

    let cleanup = setupCallListener();

    // Re-setup on socket reconnect instead of polling
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

    const targetUserId = (targetUser?._id || targetUser)?.toString();
    if (!targetUserId) {
      toast.error('Cannot reach target user');
      return;
    }

    // Emit call:initiate and let server assign callId
    socket.emit('call:initiate', {
      to: targetUserId,
      type,
      conversationId: activeConversation?._id,
    });

    // Listen for server-assigned callId from call:ringing
    const onRinging = ({ callId }) => {
      setActiveCall({
        callId, // Use server-generated callId
        targetUserId,
        displayName: targetUser?.displayName || targetUser?.username || 'User',
        avatar: targetUser?.avatar,
        type,
        isIncoming: false,
      });
      socket.off('call:ringing', onRinging);
    };
    socket.on('call:ringing', onRinging);

    // Set temporary call state while waiting for server response
    setActiveCall({
      callId: `temp_${Date.now()}`,
      targetUserId,
      displayName: targetUser?.displayName || targetUser?.username || 'User',
      avatar: targetUser?.avatar,
      type,
      isIncoming: false,
    });
  }, [activeConversation]);

  // Determine if left panel should show on mobile
  const showLeftPanel = isMobile ? !showChatOnMobile : true;
  const showRightPanel = isMobile ? showChatOnMobile : true;

  return (
    <div className="h-[100dvh] flex flex-col md:flex-row overflow-hidden bg-dark-bg relative">
      {/* Offline banner */}
      {(!isOnline || isReconnecting) && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-yellow-600/90 text-white text-center py-1.5 text-xs font-medium animate-slide-down">
          {!isOnline ? '📡 You are offline — messages will sync when back online' : '🔄 Reconnecting to server...'}
        </div>
      )}

      {/* Desktop Sidebar Navigation (hidden on mobile — mobile uses bottom bar) */}
      {!isMobile && <Sidebar onOpenProfile={() => setShowProfileModal(true)} />}

      {/* Main Left Column (Chats, Calls, Status, Contacts, Settings) */}
      <div
        className={`
        ${showLeftPanel ? 'flex' : 'hidden'}
        flex-col w-full md:w-[340px] lg:w-[380px] xl:w-[400px]
        border-r border-dark-border bg-dark-bg flex-shrink-0 z-10
        ${isMobile ? 'pb-[60px]' : ''}
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
        ${showRightPanel ? 'flex' : 'hidden'}
        flex-col flex-1 min-w-0
      `}
      >
        {activeConversation ? (
          <ChatWindow onStartCall={(targetUser, type) => handleStartCall(targetUser, type)} />
        ) : (
          !isMobile && <EmptyChat />
        )}
      </div>

      {/* Mobile Bottom Tab Bar */}
      {isMobile && <Sidebar onOpenProfile={() => setShowProfileModal(true)} />}

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
