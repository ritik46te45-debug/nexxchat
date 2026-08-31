import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useAuthStore from './stores/authStore';
import useChatStore from './stores/chatStore';
import useUIStore from './stores/uiStore';
import { getSocket } from './lib/socket';
import { playIncomingMessageSound, showSystemNotification, requestNotificationPermission } from './lib/notifications';
import { initPushNotifications } from './lib/capacitorPush';
import api from './lib/api';
import LoginPage from './features/auth/LoginPage';
import RegisterPage from './features/auth/RegisterPage';
import ResetPasswordPage from './features/auth/ResetPasswordPage';
import MainLayout from './components/layout/MainLayout';

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

// Public route — redirect to chat if already authenticated
function PublicRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore();

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
  const { addMessage, setTypingUser, clearTypingUser, setRecordingUser, clearRecordingUser, setUserOnline, setUserOffline, updateMessageInList, fetchConversations, syncMissedMessages } = useChatStore();
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
      }).catch(() => {});

      api.get('/notifications')
        .then(({ data }) => {
          const count = data.unreadCount || (data.notifications || []).filter((n) => !n.isRead).length;
          useUIStore.getState().setUnreadNotifCount(count);
        })
        .catch(() => {});
    }
  }, [isAuthenticated]);

  // Setup socket listeners when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchConversations();
    syncMissedMessages();

    const socket = getSocket();
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

          // 1. In-App Interactive Notification Toast Popup
          toast.custom((t) => (
            <div
              onClick={() => {
                toast.dismiss(t.id);
                const convs = useChatStore.getState().conversations;
                const targetConv = convs.find((c) => c._id?.toString() === conversationId?.toString());
                if (targetConv) {
                  useChatStore.getState().setActiveConversation(targetConv);
                  useUIStore.getState().setSidebarView('chats');
                  useUIStore.getState().setShowChatOnMobile(true);
                }
              }}
              className={`${
                t.visible ? 'animate-slide-in-top' : 'animate-fade-out opacity-0'
              } max-w-sm w-full bg-dark-card/95 backdrop-blur-xl border border-primary-500/50 shadow-2xl rounded-2xl p-3 flex items-center gap-3 cursor-pointer hover:bg-dark-hover transition-all pointer-events-auto select-none`}
            >
              {message.sender?.avatar?.url ? (
                <img src={message.sender.avatar.url} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-primary-500 flex-shrink-0 shadow-md" />
              ) : (
                <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center font-bold text-white text-sm flex-shrink-0 shadow-md">
                  {senderName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">{senderName}</p>
                <p className="text-[11px] text-surface-300 truncate">{previewText}</p>
              </div>
            </div>
          ), { duration: 4000, position: 'top-right' });

          // 2. Cross-platform System Notification (Windows Desktop Toast & Mobile Background Notification)
          if (notifSettings.desktopNotifications !== false) {
            showSystemNotification(senderName, previewText, {
              tag: `msg-${conversationId}`,
              data: { conversationId },
              onClick: () => {
                const convs = useChatStore.getState().conversations;
                const targetConv = convs.find((c) => c._id?.toString() === conversationId?.toString());
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

    const handleUserOnline = ({ userId }) => setUserOnline(userId);
    const handleUserOffline = ({ userId }) => setUserOffline(userId);

    const handleNotificationNew = (notif) => {
      if (!notif) return;
      const currentUserId = (useAuthStore.getState().user?._id || useAuthStore.getState().user)?.toString();
      const recipientId = (notif.recipient?._id || notif.recipient)?.toString();
      if (recipientId && currentUserId && recipientId === currentUserId) {
        useUIStore.getState().incrementUnreadNotifCount();
        toast.custom((t) => (
          <div
            onClick={() => {
              toast.dismiss(t.id);
              if (notif.data?.conversationId) {
                const convs = useChatStore.getState().conversations;
                const targetConv = convs.find((c) => c._id?.toString() === notif.data.conversationId?.toString());
                if (targetConv) {
                  useChatStore.getState().setActiveConversation(targetConv);
                  useUIStore.getState().setSidebarView('chats');
                  useUIStore.getState().setShowChatOnMobile(true);
                }
              } else {
                useUIStore.getState().setSidebarView('notifications');
              }
            }}
            className={`${
              t.visible ? 'animate-slide-in-top' : 'animate-fade-out opacity-0'
            } max-w-sm w-full bg-dark-card/95 backdrop-blur-xl border border-primary-500/50 shadow-2xl rounded-2xl p-3 flex items-center gap-3 cursor-pointer hover:bg-dark-hover transition-all pointer-events-auto select-none`}
          >
            <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center font-bold text-white text-base flex-shrink-0 shadow-md">
              🔔
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-white truncate">{notif.title || 'Notification'}</p>
                <span className="text-[10px] text-primary-400 font-medium">Just now</span>
              </div>
              <p className="text-xs text-surface-300 truncate mt-0.5">{notif.body || notif.message}</p>
            </div>
          </div>
        ), { id: `notif-${notif._id || Date.now()}`, duration: 4000 });
      }
    };

    const handleFriendRequest = () => {
      toast('New friend request received! 👥', { icon: '👋' });
    };
    const handleFriendAccepted = () => {
      toast.success('Friend request accepted! 🎉');
      fetchConversations();
    };

    const handleReconnect = () => {
      setReconnecting(false);
      fetchConversations();
      syncMissedMessages();
    };
    const handleDisconnect = () => setReconnecting(true);
    const handleConnect = () => {
      setReconnecting(false);
      fetchConversations();
      syncMissedMessages();
    };

    // Attach listeners
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
    socket.on('notification:new', handleNotificationNew);
    socket.on('friend:request', handleFriendRequest);
    socket.on('friend:accepted', handleFriendAccepted);
    socket.on('reconnect', handleReconnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect', handleConnect);

    return () => {
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
      socket.off('notification:new', handleNotificationNew);
      socket.off('friend:request', handleFriendRequest);
      socket.off('friend:accepted', handleFriendAccepted);
      socket.off('reconnect', handleReconnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect', handleConnect);
    };
  }, [isAuthenticated]);

  return (
    <BrowserRouter>
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
      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
        <Route path="/reset-password/:token" element={<PublicRoute><ResetPasswordPage /></PublicRoute>} />
        <Route path="/*" element={<ProtectedRoute><MainLayout /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

