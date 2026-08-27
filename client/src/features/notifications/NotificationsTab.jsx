import { useState, useEffect } from 'react';
import {
  Bell, UserPlus, Check, X, Phone, Video, MessageSquare,
  Sparkles, Trash2, CheckCheck, Loader2, ArrowRight
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import api from '../../lib/api';
import useChatStore from '../../stores/chatStore';
import useUIStore from '../../stores/uiStore';
import toast from 'react-hot-toast';

export default function NotificationsTab() {
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const { setActiveConversation } = useChatStore();
  const { isMobile, setShowChatOnMobile } = useUIStore();

  const fetchNotifications = async () => {
    try {
      const { data } = await api.get('/notifications');
      setNotifications(data.notifications || []);
    } catch (err) {
      console.error('Fetch notifications error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      toast.success('Marked all as read');
    } catch {
      toast.error('Failed to mark read');
    }
  };

  const handleClearAll = async () => {
    try {
      await api.delete('/notifications/clear');
      setNotifications([]);
      toast.success('Notifications cleared');
    } catch {
      toast.error('Failed to clear notifications');
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'friend_request':
      case 'friend_accepted':
        return <UserPlus className="w-4 h-4 text-accent-green" />;
      case 'call_missed':
      case 'call_incoming':
        return <Phone className="w-4 h-4 text-accent-red" />;
      case 'mention':
      case 'message':
      case 'group_message':
        return <MessageSquare className="w-4 h-4 text-primary-400" />;
      default:
        return <Sparkles className="w-4 h-4 text-accent-purple" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-dark-bg select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-dark-border">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary-400" />
          <h1 className="text-xl font-bold text-white">Notifications</h1>
        </div>

        {notifications.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleMarkAllRead}
              className="p-2 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white transition-all border border-dark-border"
              title="Mark all as read"
            >
              <CheckCheck className="w-4 h-4" />
            </button>
            <button
              onClick={handleClearAll}
              className="p-2 rounded-xl bg-dark-input hover:bg-accent-red/20 text-surface-400 hover:text-accent-red transition-all border border-dark-border"
              title="Clear all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto hide-scrollbar p-3 sm:p-4 space-y-2 text-xs">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-surface-500">
            <Loader2 className="w-8 h-8 animate-spin text-primary-400 mb-2" />
            <p>Loading notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center text-surface-500">
            <div className="w-14 h-14 rounded-2xl bg-dark-card border border-dark-border flex items-center justify-center mb-3">
              <Bell className="w-6 h-6 text-surface-500" />
            </div>
            <p className="font-bold text-white text-sm">No new notifications</p>
            <p className="text-[11px] text-surface-500 mt-1 max-w-xs">
              Friend requests, missed calls, mentions, and updates will appear here.
            </p>
          </div>
        ) : (
          notifications.map((notif) => (
            <div
              key={notif._id}
              className={`p-3.5 rounded-2xl border transition-all flex items-start gap-3.5 ${
                notif.isRead
                  ? 'bg-dark-card/50 border-dark-border/60 text-surface-300'
                  : 'bg-dark-card border-primary-500/40 text-white shadow-md'
              }`}
            >
              {/* Sender Avatar / Type Icon */}
              <div className="relative flex-shrink-0">
                {notif.sender?.avatar?.url ? (
                  <img src={notif.sender.avatar.url} alt="" className="w-10 h-10 rounded-full object-cover shadow-sm" />
                ) : (
                  <div className="w-10 h-10 rounded-full gradient-primary text-white font-bold flex items-center justify-center text-xs">
                    {(notif.sender?.displayName || notif.title || 'N').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-dark-card border border-dark-border flex items-center justify-center shadow-sm">
                  {getNotificationIcon(notif.type)}
                </div>
              </div>

              {/* Notification Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-white text-xs truncate">{notif.title || 'Alert'}</p>
                  <span className="text-[10px] text-surface-500 flex-shrink-0">
                    {notif.createdAt ? formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true }) : ''}
                  </span>
                </div>
                <p className="text-[11px] text-surface-300 mt-0.5 line-clamp-2 leading-relaxed">
                  {notif.body}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
