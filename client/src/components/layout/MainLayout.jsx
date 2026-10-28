import { useState, useEffect, useCallback, useRef } from 'react';
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
import BatteryOnboardingModal from '../../features/auth/BatteryOnboardingModal';
import DownloadAppModal from '../common/DownloadAppModal';
import { showBannerAd, hideBannerAd } from '../../lib/admob';
import { PhoneOff } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import api from '../../lib/api';
import ErrorBoundary from '../common/ErrorBoundary';
import { isNativePlatform, getPlatformName } from '../../lib/capacitorPush';

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
  const [showBatteryModal, setShowBatteryModal] = useState(false);
  const [activeCall, setActiveCall] = useState(null);
  const [isCallPiP, setIsCallPiP] = useState(false);
  const [pipDuration, setPipDuration] = useState(0);

  const stateRef = useRef({
    showProfileModal,
    showNewChat,
    showNewGroup,
    showBatteryModal,
    activeCall,
    isCallPiP,
  });
  useEffect(() => {
    stateRef.current = {
      showProfileModal,
      showNewChat,
      showNewGroup,
      showBatteryModal,
      activeCall,
      isCallPiP,
    };
  });

  const formatTimer = (seconds = 0) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Check if first-time mobile/android user needs battery onboarding
  useEffect(() => {
    const isAndroid = getPlatformName() === 'android' || isMobile;
    const isAlreadyOnboarded = localStorage.getItem('nexchat_battery_onboarded') === 'true';
    if (isAndroid && !isAlreadyOnboarded) {
      setShowBatteryModal(true);
    }
  }, [isMobile]);

  // Manage AdMob Banner Ad lifecycle on native Android
  useEffect(() => {
    if (isMobile && showChatOnMobile) {
      hideBannerAd();
    } else {
      showBannerAd();
    }
  }, [isMobile, showChatOnMobile]);

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

  // Socket listener for incoming calls & automatic pending call synchronization
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
          setIsCallPiP(false);
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
      checkPendingCalls();
    };
    if (socket) {
      socket.on('connect', onReconnect);
    }

    // Listen for incoming call notifications tapped from Android system tray
    const onIncomingPush = (event) => {
      const data = event.detail || {};
      const callId = data.callId;
      const callerId = data.callerId || data.senderId;
      const displayName = data.callerName || 'Incoming Caller';
      const type = data.callType || data.type || 'voice';
      const conversationId = data.conversationId;

      if (callId) {
        setActiveCall({
          callId,
          targetUserId: callerId || 'caller',
          displayName,
          avatar: null,
          type,
          conversationId,
          isIncoming: true,
        });
        setIsCallPiP(false);
      }
    };
    window.addEventListener('nexchat:incoming_call', onIncomingPush);

    // If app launched from cold start with a pending call notification
    if (typeof window !== 'undefined' && window.__PENDING_INCOMING_CALL) {
      onIncomingPush({ detail: window.__PENDING_INCOMING_CALL });
      window.__PENDING_INCOMING_CALL = null;
    }

    // Comprehensive Active/Ringing Call Sync (checks socket + REST)
    const checkPendingCalls = async () => {
      const s = getSocket();
      if (s) {
        s.emit('call:check-pending');
      }
      try {
        const { data } = await api.get('/calls/active');
        if (data?.activeCall) {
          const call = data.activeCall;
          const myId = (useAuthStore.getState().user?._id || useAuthStore.getState().user)?.toString();
          const callerId = (call.caller?._id || call.caller)?.toString();
          if (call.status === 'ringing' && callerId !== myId) {
            const caller = call.caller;
            setActiveCall({
              callId: call._id.toString(),
              targetUserId: callerId,
              displayName: caller?.displayName || caller?.username || 'Incoming Caller',
              avatar: caller?.avatar,
              type: call.type || 'voice',
              conversationId: call.conversation?._id || call.conversation,
              isIncoming: true,
            });
            setIsCallPiP(false);
          }
        }
      } catch (e) {}
    };

    checkPendingCalls();

    const handleForeground = () => {
      checkPendingCalls();
    };

    window.addEventListener('focus', handleForeground);
    const handleVisChange = () => {
      if (document.visibilityState === 'visible') handleForeground();
    };
    document.addEventListener('visibilitychange', handleVisChange);

    let capAppSub = null;
    let capBackSub = null;
    try {
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) handleForeground();
      }).then((s) => { capAppSub = s; }).catch(() => {});

      CapApp.addListener('backButton', () => {
        const s = stateRef.current;

        // Layer 1: If an audio/video call is in full-screen, minimize to floating PiP
        if (s.activeCall && !s.isCallPiP) {
          setIsCallPiP(true);
          return;
        }

        // Layer 2: Close open dialogs/modals
        if (s.showProfileModal) { setShowProfileModal(false); return; }
        if (s.showNewChat) { setShowNewChat(false); return; }
        if (s.showNewGroup) { setShowNewGroup(false); return; }
        if (s.showBatteryModal) { setShowBatteryModal(false); return; }

        const uiState = useUIStore.getState();
        if (uiState.showGlobalSearch) { uiState.setShowGlobalSearch(false); return; }
        if (uiState.showCommandPalette) { uiState.setShowCommandPalette(false); return; }

        // Layer 3: If inside an active chat on mobile, return back to the conversation list
        const chatState = useChatStore.getState();
        if (uiState.showChatOnMobile || chatState.activeConversation) {
          chatState.setActiveConversation(null);
          uiState.setShowChatOnMobile(false);
          return;
        }

        // Layer 4: If on secondary sidebar view (like Settings or Calls), return to 'chats' tab
        if (uiState.sidebarView !== 'chats') {
          uiState.setSidebarView('chats');
          return;
        }

        // Layer 5: If on main chat list with nothing open, gracefully minimize app to home screen
        CapApp.minimizeApp().catch(() => {});
      }).then((s) => { capBackSub = s; }).catch(() => {});
    } catch (e) {}

    return () => {
      if (cleanup) cleanup();
      if (socket) socket.off('connect', onReconnect);
      window.removeEventListener('nexchat:incoming_call', onIncomingPush);
      window.removeEventListener('focus', handleForeground);
      document.removeEventListener('visibilitychange', handleVisChange);
      if (capAppSub?.remove) capAppSub.remove();
      if (capBackSub?.remove) capBackSub.remove();
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

    // Handle if targetUser is a conversation object (has participants array)
    if (userObj?.participants && Array.isArray(userObj.participants)) {
      const myId = (useAuthStore.getState().user?._id || useAuthStore.getState().user)?.toString();
      const otherParticipant = userObj.participants.find(
        (p) => (p.user?._id || p.user)?.toString() !== myId
      );
      userObj = typeof otherParticipant?.user === 'object' ? otherParticipant.user : { _id: otherParticipant?.user };
    }

    const targetUserId = (userObj?._id || userObj?.id || userObj)?.toString();
    if (!targetUserId || targetUserId === 'voice' || targetUserId === 'video' || targetUserId === '[object Object]') {
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
    setIsCallPiP(false);
    setPipDuration(0);
  }, [activeConversation]);

  const handleEndCall = useCallback(() => {
    setActiveCall(null);
    setIsCallPiP(false);
    setPipDuration(0);
  }, []);


  const handleCallIdUpdate = useCallback((newCallId) => {
    setActiveCall((prev) => (prev ? { ...prev, callId: newCallId } : null));
  }, []);

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

      {/* WhatsApp-Style Ongoing Call Top Banner (visible when call is minimized) */}
      {activeCall && isCallPiP && (
        <div
          onClick={() => setIsCallPiP(false)}
          className="absolute top-0 left-0 right-0 z-50 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 flex items-center justify-between cursor-pointer shadow-lg animate-slide-down select-none"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse flex-shrink-0" />
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs sm:text-sm font-bold tracking-tight">Tap to return to call</span>
              <span className="text-xs font-mono opacity-90 font-semibold">({formatTimer(pipDuration)})</span>
              <span className="text-xs font-medium opacity-80 truncate hidden sm:inline">• {activeCall.displayName}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                const socket = getSocket();
                if (socket && activeCall.callId) {
                  socket.emit('call:end', { callId: activeCall.callId, duration: pipDuration });
                }
                handleEndCall();
              }}
              className="px-3 py-1 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1 shadow transition-all cursor-pointer"
              title="End Call"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              <span>End</span>
            </button>
          </div>
        </div>
      )}

      {/* Desktop / Laptop Sidebar Navigation */}
      {!isMobile && <Sidebar onOpenProfile={() => setShowProfileModal(true)} />}

      {/* Main Content Area */}
      {isMobile && showChatOnMobile && activeConversation ? (
        <div className="flex-1 flex flex-col w-full h-full min-h-0 overflow-hidden">
          <ErrorBoundary>
            <ChatWindow onStartCall={(targetUser, type) => handleStartCall(targetUser, type)} />
          </ErrorBoundary>
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
            {sidebarView === 'chats' && <ErrorBoundary><ChatList onOpenProfile={() => setShowProfileModal(true)} /></ErrorBoundary>}
            {sidebarView === 'calls' && (
              <ErrorBoundary><CallsTab onStartCall={(friend, type) => handleStartCall(friend, type)} /></ErrorBoundary>
            )}
            {sidebarView === 'status' && <ErrorBoundary><StatusTab /></ErrorBoundary>}
            {sidebarView === 'contacts' && (
              <ErrorBoundary><ContactsTab onStartCall={(friend, type) => handleStartCall(friend, type)} /></ErrorBoundary>
            )}
            {sidebarView === 'notifications' && <ErrorBoundary><NotificationsTab /></ErrorBoundary>}
            {sidebarView === 'settings' && (
              <ErrorBoundary><SettingsTab onOpenProfile={() => setShowProfileModal(true)} /></ErrorBoundary>
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
              <ErrorBoundary>
                <ChatWindow onStartCall={(targetUser, type) => handleStartCall(targetUser, type)} />
              </ErrorBoundary>
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
          onEndCall={handleEndCall}
          onCallIdUpdate={handleCallIdUpdate}
          isFloatingPiP={isCallPiP}
          onPiPChange={setIsCallPiP}
          onDurationUpdate={setPipDuration}
        />
      )}

      {/* Android Battery Whitelist & Reliability Onboarding */}
      <BatteryOnboardingModal
        isOpen={showBatteryModal}
        onClose={() => setShowBatteryModal(false)}
      />

      {/* App Lock / PIN Screen Overlay */}
      <AppLockOverlay />

      {/* Download App Popup / Modal */}
      <DownloadAppModal />
    </div>
  );
}
