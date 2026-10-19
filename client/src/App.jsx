import { useEffect, useRef } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import useAuthStore from './stores/authStore';
import useChatStore from './stores/chatStore';
import useUIStore from './stores/uiStore';
import { getSocket, ensureSocketConnected } from './lib/socket';
import { playIncomingMessageSound, showSystemNotification, requestNotificationPermission } from './lib/notifications';
import { initPushNotifications } from './lib/capacitorPush';
import api from './lib/api';
import LoginPage from './features/auth/LoginPage';
import RegisterPage from './features/auth/RegisterPage';
import ResetPasswordPage from './features/auth/ResetPasswordPage';
import MainLayout from './components/layout/MainLayout';
import InAppNotificationBanner from './components/common/InAppNotificationBanner';

const isDesktopOrNative = typeof window !== 'undefined' && (
  Boolean(window.electronAPI?.isElectron) ||
  Boolean(Capacitor?.isNativePlatform?.()) ||
  Boolean(window.Capacitor?.isNativePlatform?.()) ||
  window.location.protocol === 'file:' ||
  window.location.protocol === 'capacitor:' ||
  (window.location.hostname === 'localhost' && Boolean(window.Capacitor))
);

const AppRouter = isDesktopOrNative ? HashRouter : BrowserRouter;

// Protected Route wrapper
function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-dark-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
          <p className="text-surface-400 animate-pulse-soft">Loading NexChat...</p>
        </div>
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

// Public route — redirect to chat if already authenticated (except during Android external auth bridge)
function PublicRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const isAndroidAuthMode = searchParams.get('android') === 'true' || searchParams.get('android_auth') === '1';

  // If opened from the Android APK for authentication, NEVER redirect to '/'.
  // LoginPage must handle the session and deep-link back into the APK!
  if (isAndroidAuthMode) {
    return children;
  }

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-dark-bg">
        <div className="w-12 h-12 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
      </div>
    );
  }

  return isAuthenticated ? <Navigate to="/" replace /> : children;
}

function App() {
  const initialize = useAuthStore((s) => s.initialize);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const { addMessage, setTypingUser, clearTypingUser, setRecordingUser, clearRecordingUser, setUserOnline, setUserOffline, setOnlineUsers, updateMessageInList, fetchConversations, syncMissedMessages } = useChatStore();
  const { setOnline, setReconnecting } = useUIStore();

  // Use ref for user to avoid re-mounting socket listeners on profile changes
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // Initialize auth on mount & setup Electron desktop listeners
  useEffect(() => {
    initialize();

    if (typeof window !== 'undefined' && window.electronAPI?.onNavigateConversation) {
      window.electronAPI.onNavigateConversation((conversationId) => {
        const convs = useChatStore.getState().conversations;
        const targetConv = convs.find((c) => c._id?.toString() === conversationId?.toString());
        if (targetConv) {
          useChatStore.getState().setActiveConversation(targetConv);
          useUIStore.getState().setSidebarView('chats');
          useUIStore.getState().setShowChatOnMobile(true);
        }
      });
    }
  }, [initialize]);

  // Handle native Android deep-links (e.g. app.nexchat.messenger://auth?token=...&refreshToken=...)
  useEffect(() => {
    let sub = null;
    const processDeepLink = async (rawUrl) => {
      if (!rawUrl) return;
      try {
        // Close any open in-app browser tab if applicable
        const normalized = rawUrl.replace(/^(app\.nexchat\.messenger|nexchat):\/\//i, 'https://localhost/');
        const parsed = new URL(normalized);
        const token = parsed.searchParams.get('token');
        const refreshToken = parsed.searchParams.get('refreshToken');
        if (token) {
          localStorage.setItem('accessToken', token);
          if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
          toast.success('Successfully authenticated! Welcome back 🎉');
          await useAuthStore.getState().initialize();
        }
      } catch (err) {
        console.error('[DEEP LINK] Parse error:', err);
      }
    };

    try {
      CapApp.getLaunchUrl?.().then((launch) => {
        if (launch?.url) processDeepLink(launch.url);
      }).catch(() => {});

      CapApp.addListener('appUrlOpen', (event) => {
        if (event?.url) processDeepLink(event.url);
      }).then((s) => { sub = s; }).catch(() => {});
    } catch (e) {
      console.warn('Capacitor App listener note:', e);
    }

    return () => {
      if (sub?.remove) sub.remove();
    };
  }, []);

  // Web Auth Bridge: If opened in external browser with ?android=true and user is already signed in,
  // immediately bounce back into the Android APK
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('android') === 'true' || params.get('android_auth') === '1') {
        const token = localStorage.getItem('accessToken');
        const refresh = localStorage.getItem('refreshToken');
        if (token) {
          const deepLink = `app.nexchat.messenger://auth?token=${encodeURIComponent(token)}&refreshToken=${encodeURIComponent(refresh || '')}`;
          console.log('[ANDROID BRIDGE] Returning to native app:', deepLink);
          window.location.href = deepLink;
        }
      }
    }
  }, []);

  // Instant background-to-foreground socket resumption (phone unlock, tab switch, app resume)
  useEffect(() => {
    const handleForeground = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        const s = ensureSocketConnected();
        if (s && !s.connected) {
          console.log('[REALTIME] Tab/App foregrounded — reconnecting socket immediately');
          s.connect();
        }
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleForeground);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleForeground);
    }

    let capSub = null;
    try {
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) handleForeground();
      }).then((s) => { capSub = s; }).catch(() => {});
    } catch (e) {}

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleForeground);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleForeground);
      }
      if (capSub?.remove) capSub.remove();
    };
  }, []);

  // Request notification permissions, register Push (Capacitor FCM / Web VAPID), and fetch notification count
  useEffect(() => {
    if (isAuthenticated) {
      requestNotificationPermission().catch(() => {});
      initPushNotifications({
        onNavigateToConversation: (conversationId) => {
          const convs = useChatStore.getState().conversations;
          const targetConv = convs.find((c) => c._id?.toString() === conversationId?.toString());
          if (targetConv) {
            useChatStore.getState().setActiveConversation(targetConv);
            useUIStore.getState().setSidebarView('chats');
            useUIStore.getState().setShowChatOnMobile(true);
          }
        },
        onIncomingCall: (callData) => {
          console.log('[PUSH] Incoming call notification tapped:', callData);
          if (typeof window !== 'undefined') {
            window.__PENDING_INCOMING_CALL = callData;
            window.dispatchEvent(new CustomEvent('nexchat:incoming_call', { detail: callData }));
          }
        },

      }).catch(() => {});

      // Delay non-critical notification fetch to reduce initial request burst
      // (avoids triggering Cloudflare/Render rate limiting)
      const notifTimer = setTimeout(() => {
        api.get('/notifications')
          .then(({ data }) => {
            const count = data.unreadCount || (data.notifications || []).filter((n) => !n.isRead).length;
            useUIStore.getState().setUnreadNotifCount(count);
          })
          .catch(() => {});
      }, 2000);

      return () => clearTimeout(notifTimer);
    }
  }, [isAuthenticated]);

  // Setup socket listeners when authenticated
  // Dedup guard: prevent stampede of fetchConversations/syncMissedMessages
  const lastFetchRef = useRef(0);
  const debouncedFetch = () => {
    const now = Date.now();
    if (now - lastFetchRef.current < 3000) return; // 3s cooldown
    lastFetchRef.current = now;
    fetchConversations();
    syncMissedMessages();
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    // Let socket 'connect' handler call fetchConversations to avoid duplicates
    // Only fetch here if socket is already connected and won't fire 'connect'
    const socket = getSocket();
    if (socket?.connected) {
      setReconnecting(false);
      debouncedFetch();
    }
    if (!socket) return;

    const handleNewMessage = (payload) => {
      const message = payload?.message || payload;
      const conversationId = (payload?.conversationId || message?.conversation?._id || message?.conversation)?.toString();
      console.log(`[REALTIME] message:new RECEIVED -> Message ID: ${message?._id} | Conv ID: ${conversationId}`);
      addMessage(message, conversationId);

      const currentUserId = (useAuthStore.getState().user?._id || useAuthStore.getState().user)?.toString();
      const senderId = (message.sender?._id || message.sender)?.toString();

      if (senderId && currentUserId && senderId !== currentUserId) {
        const userState = useAuthStore.getState().user;
        const notifSettings = userState?.notificationSettings || {};

        // Cross-platform Web Audio chime (Windows & Mobile)
        if (notifSettings.sound !== false) {
          playIncomingMessageSound();
        }

        const activeConv = useChatStore.getState().activeConversation;
        const isCurrentActiveChat = activeConv?._id?.toString() === conversationId?.toString();        
        
        if (isCurrentActiveChat && typeof document !== 'undefined' && !document.hidden) {
          socket.emit('message:read', { conversationId });
          useChatStore.getState().markAsRead(conversationId);
        }

        if (!isCurrentActiveChat || (typeof document !== 'undefined' && document.hidden)) {
          const senderName = message.sender?.displayName || message.sender?.username || 'NexChat User';
          const previewText = notifSettings.showPreview !== false
            ? (message.content || (message.type === 'video_note' ? 'Sent a video note 🎥' : message.type === 'voice' ? 'Sent a voice message 🎤' : message.type ? `Sent a ${message.type}` : 'Sent an attachment'))
            : 'New message';

          // Single-Theme WhatsApp-Style In-App Banner (Grouped with Expand Button)
          useUIStore.getState().showInAppBanner({
            conversationId,
            senderName,
            senderAvatar: message.sender?.avatar?.url,
            preview: previewText,
            type: 'message',
          });

          // System Notification (Windows Desktop Toast & Mobile Background Notification)
          if (notifSettings.desktopNotifications !== false) {
            showSystemNotification(senderName, previewText, {
              tag: `msg-${conversationId}`,
              data: { conversationId },
              onClick: () => {
                const convs = useChatStore.getState().conversations;
                const targetConv = convs.find((c) => (c._id || c.id)?.toString() === conversationId?.toString());
                if (targetConv) {
                  useChatStore.getState().setActiveConversation(targetConv);
                  useUIStore.getState().setSidebarView('chats');
                  useUIStore.getState().setShowChatOnMobile(true);
                }
              }
            });
          }
        }
      }
    };

    const handleMessageEdited = ({ message }) => {
      updateMessageInList(message._id, message);
    };

    const handleMessageDeleted = ({ messageId, forEveryone }) => {
      if (forEveryone) {
        updateMessageInList(messageId, { isDeletedForEveryone: true, content: '' });
      }
    };

    const handleMessageReaction = ({ messageId, reactions }) => {
      updateMessageInList(messageId, { reactions });
    };

    const handleMessageDelivered = ({ messageId }) => {
      updateMessageInList(messageId, { status: 'delivered' });
    };

    const handleMessageRead = ({ conversationId, readBy }) => {
      const state = useChatStore.getState();
      const currentUserId = (useAuthStore.getState().user?._id || useAuthStore.getState().user)?.toString();
      const isReadByMe = readBy && currentUserId && readBy.toString() === currentUserId;

      if (state.activeConversation?._id?.toString() === conversationId?.toString()) {
        const messages = state.messages.map(m => {
          const mSender = (m.sender?._id || m.sender)?.toString();
          if (!isReadByMe && mSender === currentUserId) {
            return { ...m, status: 'read' };
          }
          return m;
        });
        useChatStore.setState({ messages });
      }

      const convs = state.conversations.map(c => {
        if (c._id?.toString() === conversationId?.toString()) {
          const lastMsg = c.lastMessage
            ? { ...c.lastMessage, status: (!isReadByMe && (c.lastMessage.sender?._id || c.lastMessage.sender)?.toString() === currentUserId) ? 'read' : c.lastMessage.status }
            : c.lastMessage;
          if (isReadByMe) {
            return {
              ...c,
              lastMessage: lastMsg,
              unreadCount: 0,
              _participant: { ...(c._participant || {}), unreadCount: 0 },
              participants: (c.participants || []).map(p =>
                (p.user?._id || p.user)?.toString() === currentUserId
                  ? { ...p, unreadCount: 0 }
                  : p
              ),
            };
          }
          return { ...c, lastMessage: lastMsg };
        }
        return c;
      });

      if (isReadByMe) {
        const unreadTotal = convs.reduce((sum, c) => {
          const myP = c._participant || c.participants?.find(p => (p.user?._id || p.user)?.toString() === currentUserId);
          return sum + (myP?.unreadCount || c.unreadCount || 0);
        }, 0);
        useChatStore.setState({ conversations: convs, unreadTotal });
      } else {
        useChatStore.setState({ conversations: convs });
      }
    };

    const handleTypingStart = ({ conversationId, userId, displayName }) => {
      setTypingUser(conversationId, userId, displayName);
    };
    const handleTypingStop = ({ conversationId, userId }) => {
      clearTypingUser(conversationId, userId);
    };

    const handleRecordingStart = ({ conversationId, userId, displayName }) => {
      setRecordingUser(conversationId, userId, displayName);
    };
    const handleRecordingStop = ({ conversationId, userId }) => {
      clearRecordingUser(conversationId, userId);
    };

    const handleOnlineList = ({ userIds } = {}) => {
      setOnlineUsers(userIds || []);
    };
    const handleUserOnline = ({ userId }) => setUserOnline(userId);
    const handleUserOffline = ({ userId }) => setUserOffline(userId);

    const handleNotificationCount = ({ count }) => {
      if (typeof count === 'number') {
        useUIStore.getState().setUnreadNotifCount(count);
      }
    };

    const handleNotificationNew = (notif) => {
      if (!notif) return;
      const currentUserId = (useAuthStore.getState().user?._id || useAuthStore.getState().user)?.toString();
      const recipientId = (notif.recipient?._id || notif.recipient)?.toString();
      if (recipientId && currentUserId && recipientId === currentUserId) {
        useUIStore.getState().incrementUnreadNotifCount();

        // Chat messages are already handled by handleNewMessage — avoid duplicate banner!
        if (notif.type === 'message' || notif.type === 'group_message') {
          return;
        }

        // Single-Theme WhatsApp-Style In-App Banner for system alerts, friend requests, missed calls
        useUIStore.getState().showInAppBanner({
          conversationId: notif.data?.conversationId,
          senderName: notif.title || 'Notification',
          senderAvatar: notif.sender?.avatar?.url,
          preview: notif.body || notif.message || 'New notification',
          type: notif.type || 'alert',
        });
      }
    };

    const handleFriendRequest = () => {
      toast('New friend request received! 👥', { icon: '👋' });
    };
    const handleFriendAccepted = () => {
      toast.success('Friend request accepted! 🎉');
      fetchConversations();
    };

    const handleConversationNew = ({ conversation }) => {
      if (conversation) {
        useChatStore.getState().addConversation(conversation);
      } else {
        fetchConversations();
      }
    };

    const handleGroupUpdated = ({ conversationId, updates, group }) => {
      if (group) {
        useChatStore.getState().updateConversationInStore(conversationId, group);
      } else if (updates) {
        useChatStore.getState().updateConversationInStore(conversationId, updates);
      } else {
        fetchConversations();
      }
    };

    const handleGroupMemberChange = () => {
      fetchConversations();
    };

    let reconnectTimer = null;

    const handleReconnect = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      setReconnecting(false);
      debouncedFetch();
      socket.emit('users:get_online');
    };

    const handleDisconnect = (reason) => {
      console.log('[REALTIME] Socket disconnected event:', reason);
      // Give socket a 10-second grace window to reconnect silently before alarming user with banner
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        const s = getSocket();
        if (s && !s.connected) {
          setReconnecting(true);
        }
      }, 10000);
    };

    const handleConnect = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      setReconnecting(false);
      debouncedFetch();
      socket.emit('users:get_online');
    };

    const handleUserAvatarUpdated = ({ userId, avatar }) => {
      useChatStore.getState().updateUserAvatar(userId, avatar);
    };

    // Attach listeners
    socket.on('user:avatar_updated', handleUserAvatarUpdated);
    socket.on('message:new', handleNewMessage);
    socket.on('message:edited', handleMessageEdited);
    socket.on('message:deleted', handleMessageDeleted);
    socket.on('message:reaction', handleMessageReaction);
    socket.on('message:delivered', handleMessageDelivered);
    socket.on('message:read', handleMessageRead);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    socket.on('recording:start', handleRecordingStart);
    socket.on('recording:stop', handleRecordingStop);
    socket.on('user:online', handleUserOnline);
    socket.on('user:offline', handleUserOffline);
    socket.on('users:online_list', handleOnlineList);
    socket.on('notification:new', handleNotificationNew);
    socket.on('notification:count', handleNotificationCount);
    socket.on('friend:request', handleFriendRequest);
    socket.on('friend:accepted', handleFriendAccepted);
    socket.on('conversation:new', handleConversationNew);
    socket.on('group:updated', handleGroupUpdated);
    socket.on('group:members_added', handleGroupMemberChange);
    socket.on('group:member_removed', handleGroupMemberChange);
    socket.on('group:left', handleGroupMemberChange);
    socket.on('reconnect', handleReconnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect', handleConnect);

    return () => {
      socket.off('user:avatar_updated', handleUserAvatarUpdated);
      socket.off('message:new', handleNewMessage);
      socket.off('message:edited', handleMessageEdited);
      socket.off('message:deleted', handleMessageDeleted);
      socket.off('message:reaction', handleMessageReaction);
      socket.off('message:delivered', handleMessageDelivered);
      socket.off('message:read', handleMessageRead);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
      socket.off('recording:start', handleRecordingStart);
      socket.off('recording:stop', handleRecordingStop);
      socket.off('user:online', handleUserOnline);
      socket.off('user:offline', handleUserOffline);
      socket.off('users:online_list', handleOnlineList);
      socket.off('notification:new', handleNotificationNew);
      socket.off('notification:count', handleNotificationCount);
      socket.off('friend:request', handleFriendRequest);
      socket.off('friend:accepted', handleFriendAccepted);
      socket.off('conversation:new', handleConversationNew);
      socket.off('group:updated', handleGroupUpdated);
      socket.off('group:members_added', handleGroupMemberChange);
      socket.off('group:member_removed', handleGroupMemberChange);
      socket.off('group:left', handleGroupMemberChange);
      socket.off('reconnect', handleReconnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect', handleConnect);
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [isAuthenticated]);

  return (
    <AppRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#e2e8f0',
            border: '1px solid rgba(139, 92, 246, 0.2)',
            borderRadius: '12px',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#22c55e', secondary: '#1e293b' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#1e293b' } },
        }}
      />
      <InAppNotificationBanner />
      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/*" element={<ProtectedRoute><MainLayout /></ProtectedRoute>} />
      </Routes>
    </AppRouter>
  );
}

export default App;

