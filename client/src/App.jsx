import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useAuthStore from './stores/authStore';
import useChatStore from './stores/chatStore';
import useUIStore from './stores/uiStore';
import { getSocket } from './lib/socket';
import { playIncomingMessageSound, showSystemNotification, requestNotificationPermission } from './lib/notifications';
import { registerPushNotifications } from './lib/pushNotifications';
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
  const { addMessage, setTypingUser, clearTypingUser, setRecordingUser, clearRecordingUser, setUserOnline, setUserOffline, updateMessageInList, fetchConversations } = useChatStore();
  const { setOnline, setReconnecting } = useUIStore();

  // Use ref for user to avoid re-mounting socket listeners on profile changes
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // Initialize auth on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Request notification permissions and register Web Push service worker when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      requestNotificationPermission().catch(() => {});
      registerPushNotifications().catch(() => {});
    }
  }, [isAuthenticated]);

  // Setup socket listeners when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    // Fetch conversations
    fetchConversations();

    let cleanupFn = null;

    // Setup socket listeners with a small delay to ensure connection
    const setupListeners = () => {
      const socket = getSocket();
      if (!socket) return;

      // Messages
      socket.on('message:new', ({ message, conversationId }) => {
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

          // Native Windows / Android / iOS system notification
          const activeConv = useChatStore.getState().activeConversation;
          const isCurrentActiveChat = activeConv?._id?.toString() === conversationId?.toString();

          if (notifSettings.messages !== false && (!isCurrentActiveChat || (typeof document !== 'undefined' && document.hidden))) {
            const senderName = message.sender?.displayName || message.sender?.username || 'NexChat User';
            const previewText = notifSettings.showPreview !== false
              ? (message.content || (message.type ? `Sent a ${message.type}` : 'Sent an attachment'))
              : 'New message';

            showSystemNotification({
              title: senderName,
              body: previewText,
              icon: message.sender?.avatar?.url,
              data: { conversationId },
              onClick: () => {
                const convs = useChatStore.getState().conversations;
                const targetConv = convs.find(c => c._id?.toString() === conversationId?.toString());
                if (targetConv) {
                  useChatStore.getState().setActiveConversation(targetConv);
                }
              },
            });
          }
        }
      });

      socket.on('message:edited', ({ message }) => {
        updateMessageInList(message._id, message);
      });

      socket.on('message:deleted', ({ messageId, forEveryone }) => {
        if (forEveryone) {
          updateMessageInList(messageId, { isDeletedForEveryone: true, content: '' });
        }
      });

      socket.on('message:reaction', ({ messageId, reactions }) => {
        updateMessageInList(messageId, { reactions });
      });

      socket.on('message:delivered', ({ messageId }) => {
        updateMessageInList(messageId, { status: 'delivered' });
      });

      socket.on('message:read', ({ conversationId }) => {
        const state = useChatStore.getState();
        if (state.activeConversation?._id === conversationId) {
          const messages = state.messages.map(m => ({ ...m, status: 'read' }));
          useChatStore.setState({ messages });
        }
      });

      // Typing
      socket.on('typing:start', ({ conversationId, userId, displayName }) => {
        setTypingUser(conversationId, userId, displayName);
      });
      socket.on('typing:stop', ({ conversationId, userId }) => {
        clearTypingUser(conversationId, userId);
      });

      // Recording
      socket.on('recording:start', ({ conversationId, userId, displayName }) => {
        setRecordingUser(conversationId, userId, displayName);
      });
      socket.on('recording:stop', ({ conversationId, userId }) => {
        clearRecordingUser(conversationId, userId);
      });

      // Presence
      socket.on('user:online', ({ userId }) => setUserOnline(userId));
      socket.on('user:offline', ({ userId }) => setUserOffline(userId));

      // In-App Notifications
      socket.on('notification:new', (notif) => {
        if (!notif) return;
        const currentUserId = (useAuthStore.getState().user?._id || useAuthStore.getState().user)?.toString();
        const recipientId = (notif.recipient?._id || notif.recipient)?.toString();
        if (recipientId && currentUserId && recipientId === currentUserId) {
          toast((t) => (
            <div className="flex items-center gap-2.5 text-xs">
              <span className="text-base">🔔</span>
              <div>
                <p className="font-bold text-white">{notif.title || 'Notification'}</p>
                <p className="text-surface-300 text-[11px] line-clamp-1">{notif.body}</p>
              </div>
            </div>
          ), { duration: 4000 });
        }
      });

      // Friend requests
      socket.on('friend:request', () => {
        toast('New friend request received! 👥', { icon: '👋' });
      });
      socket.on('friend:accepted', () => {
        toast.success('Friend request accepted! 🎉');
        fetchConversations();
      });

      // Connection
      socket.on('reconnect', () => {
        setReconnecting(false);
        fetchConversations();
      });
      socket.on('disconnect', () => setReconnecting(true));
      socket.on('connect', () => setReconnecting(false));

      // Store cleanup
      cleanupFn = () => {
        socket.off('message:new');
        socket.off('message:edited');
        socket.off('message:deleted');
        socket.off('message:reaction');
        socket.off('message:delivered');
        socket.off('message:read');
        socket.off('typing:start');
        socket.off('typing:stop');
        socket.off('recording:start');
        socket.off('recording:stop');
        socket.off('user:online');
        socket.off('user:offline');
        socket.off('friend:request');
        socket.off('friend:accepted');
        socket.off('reconnect');
        socket.off('disconnect');
        socket.off('connect');
      };
    };

    const timer = setTimeout(setupListeners, 500);
    return () => {
      clearTimeout(timer);
      if (cleanupFn) cleanupFn();
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

