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
    fetchConversations();

    const socket = getSocket();
    if (!socket) return;

    // Messages
    const handleNewMessage = ({ message, conversationId }) => {
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

    const handleMessageRead = ({ conversationId }) => {
      const state = useChatStore.getState();
      if (state.activeConversation?._id?.toString() === conversationId?.toString()) {
        const messages = state.messages.map(m => ({ ...m, status: 'read' }));
        useChatStore.setState({ messages });
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
        toast((t) => (
          <div className="flex items-center gap-2">
            <span className="text-primary-400 font-bold">🔔 {notif.title || 'New Notification'}</span>
            <span className="text-surface-300 text-xs truncate max-w-[200px]">{notif.body || notif.message}</span>
          </div>
        ), { duration: 4000 });
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
    };
    const handleDisconnect = () => setReconnecting(true);
    const handleConnect = () => {
      setReconnecting(false);
      fetchConversations();
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

