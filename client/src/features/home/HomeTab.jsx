import { useState, useMemo } from 'react';
import {
  MessageSquare, Phone, Video, Users, Plus, Search, Sparkles,
  Star, Pin, Clock, ShieldCheck, Settings, ArrowRight, Check,
  SlidersHorizontal, ChevronRight, Download, FileText, Image,
  ExternalLink, UserCheck
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import useAuthStore from '../../stores/authStore';
import useChatStore from '../../stores/chatStore';
import useUIStore from '../../stores/uiStore';
import toast from 'react-hot-toast';

export default function HomeTab({ onStartCall, onOpenNewChat, onOpenNewGroup }) {
  const { user } = useAuthStore();
  const {
    conversations, setActiveConversation, onlineUsers
  } = useChatStore();
  const {
    setSidebarView, setShowGlobalSearch, setShowCommandPalette,
    homeSections, toggleHomeSection, isMobile, setShowChatOnMobile
  } = useUIStore();

  const [showCustomizeModal, setShowCustomizeModal] = useState(false);

  const myId = (user?._id || user)?.toString();

  // Greeting based on current time
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  // Filter online friends
  const onlineFriendsList = useMemo(() => {
    const friends = [];
    (conversations || []).forEach((c) => {
      if (c.type === 'private') {
        const other = c.participants?.find((p) => (p.user?._id || p.user)?.toString() !== myId);
        if (other && typeof other.user === 'object') {
          const isOnline = other.user.isOnline || onlineUsers.has(other.user._id?.toString());
          if (isOnline) {
            friends.push({ user: other.user, conversation: c });
          }
        }
      }
    });
    return friends;
  }, [conversations, myId, onlineUsers]);

  // Pinned conversations
  const pinnedConversations = useMemo(() => {
    return (conversations || []).filter((c) => c._participant?.isPinned);
  }, [conversations]);

  // Recent conversations (top 5)
  const recentConversations = useMemo(() => {
    return (conversations || []).slice(0, 5);
  }, [conversations]);

  const handleSelectConversation = (conv) => {
    setActiveConversation(conv);
    if (isMobile) {
      setShowChatOnMobile(true);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-dark-bg overflow-y-auto hide-scrollbar select-none p-4 sm:p-6 space-y-6">
      {/* Welcome & Profile Banner */}
      <div className="relative rounded-3xl p-5 sm:p-7 gradient-primary text-white shadow-2xl overflow-hidden animate-fade-in flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Background glow graphics */}
        <div className="absolute -right-10 -bottom-10 w-48 h-48 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute right-20 top-0 w-32 h-32 rounded-full bg-accent-purple/30 blur-xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-3 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-bold tracking-wider uppercase backdrop-blur-md">
              #{user?.userCode || '0000'}
            </span>
            <span className="text-white/80 text-xs font-medium">{format(new Date(), 'EEEE, MMMM d')}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white leading-tight">
            {greeting}, {user?.displayName || 'Friend'}!
          </h1>
          <p className="text-xs sm:text-sm text-white/80 mt-1 max-w-md">
            Welcome to NexChat — Real-time encrypted communication, crystal HD calls, and connected spaces.
          </p>
        </div>

        {/* Dashboard Customizer Toggle */}
        <button
          onClick={() => setShowCustomizeModal(true)}
          className="relative z-10 px-3.5 py-2 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-bold flex items-center gap-2 backdrop-blur-md transition-all active:scale-95 cursor-pointer flex-shrink-0"
          title="Customize Home Dashboard"
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Customize</span>
        </button>
      </div>

      {/* 1. Quick Actions Bar */}
      {homeSections.quickActions && (
        <div>
          <h3 className="text-xs font-bold text-surface-400 uppercase tracking-wider mb-3">Quick Actions</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              onClick={onOpenNewChat}
              className="p-3.5 rounded-2xl bg-dark-card/80 hover:bg-dark-hover border border-dark-border/80 hover:border-primary-500/50 flex flex-col items-start gap-2.5 transition-all group shadow-md cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl gradient-primary text-white flex items-center justify-center shadow-md shadow-primary-500/30 group-hover:scale-110 transition-transform">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-white">New Direct Chat</p>
                <p className="text-[10px] text-surface-400">Start private message</p>
              </div>
            </button>

            <button
              onClick={onOpenNewGroup}
              className="p-3.5 rounded-2xl bg-dark-card/80 hover:bg-dark-hover border border-dark-border/80 hover:border-primary-500/50 flex flex-col items-start gap-2.5 transition-all group shadow-md cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-accent-purple/20 text-accent-purple flex items-center justify-center border border-accent-purple/30 group-hover:scale-110 transition-transform">
                <Users className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-white">Create Group</p>
                <p className="text-[10px] text-surface-400">Collaborate with friends</p>
              </div>
            </button>

            <button
              onClick={() => setShowGlobalSearch(true)}
              className="p-3.5 rounded-2xl bg-dark-card/80 hover:bg-dark-hover border border-dark-border/80 hover:border-primary-500/50 flex flex-col items-start gap-2.5 transition-all group shadow-md cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-accent-blue/20 text-accent-blue flex items-center justify-center border border-accent-blue/30 group-hover:scale-110 transition-transform">
                <Search className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-white">Universal Search</p>
                <p className="text-[10px] text-surface-400">Find messages & files</p>
              </div>
            </button>

            <button
              onClick={() => setSidebarView('contacts')}
              className="p-3.5 rounded-2xl bg-dark-card/80 hover:bg-dark-hover border border-dark-border/80 hover:border-primary-500/50 flex flex-col items-start gap-2.5 transition-all group shadow-md cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-accent-green/20 text-accent-green flex items-center justify-center border border-accent-green/30 group-hover:scale-110 transition-transform">
                <UserCheck className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-white">Friends & Contacts</p>
                <p className="text-[10px] text-surface-400">Manage connections</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* 2. Online Friends Carousel */}
      {homeSections.onlineFriends && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
              <h3 className="text-xs font-bold text-surface-400 uppercase tracking-wider">
                Online Friends ({onlineFriendsList.length})
              </h3>
            </div>
            <button
              onClick={() => setSidebarView('contacts')}
              className="text-[11px] text-primary-400 hover:underline font-semibold"
            >
              View all
            </button>
          </div>

          {onlineFriendsList.length === 0 ? (
            <div className="p-5 rounded-2xl bg-dark-card/50 border border-dark-border/50 text-center text-xs text-surface-500">
              No friends online right now. Invite friends with your user code <strong className="text-primary-400">#{user?.userCode}</strong>!
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1 hide-scrollbar">
              {onlineFriendsList.map(({ user: fUser, conversation }) => (
                <div
                  key={fUser._id}
                  className="p-3 rounded-2xl bg-dark-card border border-dark-border/80 flex flex-col items-center gap-2 min-w-[110px] max-w-[130px] flex-shrink-0 shadow-md group hover:border-primary-500/50 transition-all"
                >
                  <div className="relative">
                    {fUser.avatar?.url ? (
                      <img src={fUser.avatar.url} alt="" className="w-12 h-12 rounded-full object-cover shadow-sm" />
                    ) : (
                      <div className="w-12 h-12 rounded-full gradient-primary text-white font-bold flex items-center justify-center text-sm">
                        {fUser.displayName?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                    )}
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-accent-green border-2 border-dark-card" />
                  </div>

                  <span className="text-xs font-bold text-white truncate max-w-full text-center">
                    {fUser.displayName || fUser.username}
                  </span>

                  {/* 1-tap Actions */}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <button
                      onClick={() => handleSelectConversation(conversation)}
                      className="p-1.5 rounded-xl bg-dark-input hover:bg-primary-500/20 text-surface-400 hover:text-primary-400 border border-dark-border transition-all"
                      title="Send message"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onStartCall && onStartCall(fUser, 'voice')}
                      className="p-1.5 rounded-xl bg-dark-input hover:bg-accent-green/20 text-surface-400 hover:text-accent-green border border-dark-border transition-all"
                      title="Voice call"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onStartCall && onStartCall(fUser, 'video')}
                      className="p-1.5 rounded-xl bg-dark-input hover:bg-primary-500/20 text-surface-400 hover:text-primary-400 border border-dark-border transition-all"
                      title="Video call"
                    >
                      <Video className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. Pinned & Favorite Conversations */}
      {homeSections.pinnedChats && pinnedConversations.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Pin className="w-3.5 h-3.5 text-primary-400 rotate-45" />
            <h3 className="text-xs font-bold text-surface-400 uppercase tracking-wider">
              Pinned Conversations ({pinnedConversations.length})
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pinnedConversations.map((conv) => {
              const isGroup = conv.type === 'group' || conv.type === 'channel';
              let title = isGroup ? conv.groupName : 'User';
              let avatar = isGroup ? conv.groupAvatar?.url : null;

              if (!isGroup) {
                const other = conv.participants?.find((p) => (p.user?._id || p.user)?.toString() !== myId);
                title = other?.user?.displayName || other?.user?.username || 'User';
                avatar = other?.user?.avatar?.url;
              }

              return (
                <button
                  key={conv._id}
                  onClick={() => handleSelectConversation(conv)}
                  className="p-3.5 rounded-2xl bg-dark-card border border-primary-500/40 hover:bg-dark-hover flex items-center justify-between gap-3 transition-all text-left shadow-md cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative flex-shrink-0">
                      {avatar ? (
                        <img src={avatar} alt="" className="w-11 h-11 rounded-full object-cover" />
                      ) : (
                        <div className="w-11 h-11 rounded-full gradient-primary text-white font-bold flex items-center justify-center text-sm">
                          {title.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{title}</p>
                      <p className="text-[11px] text-surface-400 truncate">
                        {conv.lastMessage?.content || `[${conv.lastMessage?.type || 'Pinned'}]`}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-surface-500 group-hover:text-primary-400 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Recent Active Conversations */}
      {homeSections.recentChats && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-surface-400 uppercase tracking-wider">Recent Conversations</h3>
            <button
              onClick={() => setSidebarView('chats')}
              className="text-[11px] text-primary-400 hover:underline font-semibold"
            >
              See all chats
            </button>
          </div>

          <div className="space-y-2">
            {recentConversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-surface-500 rounded-2xl bg-dark-card/40 border border-dark-border/40">
                No active conversations yet. Start a new chat to begin!
              </div>
            ) : (
              recentConversations.map((conv) => {
                const isGroup = conv.type === 'group' || conv.type === 'channel';
                let title = isGroup ? conv.groupName : 'User';
                let avatar = isGroup ? conv.groupAvatar?.url : null;
                const other = !isGroup ? conv.participants?.find((p) => (p.user?._id || p.user)?.toString() !== myId) : null;

                if (!isGroup && other?.user) {
                  title = other.user.displayName || other.user.username || 'User';
                  avatar = other.user.avatar?.url;
                }

                const unread = conv._participant?.unreadCount || 0;

                return (
                  <button
                    key={conv._id}
                    onClick={() => handleSelectConversation(conv)}
                    className="w-full p-3 rounded-2xl bg-dark-card/80 hover:bg-dark-hover border border-dark-border/80 flex items-center justify-between gap-3 transition-all text-left shadow-sm cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative flex-shrink-0">
                        {avatar ? (
                          <img src={avatar} alt="" className="w-11 h-11 rounded-full object-cover" />
                        ) : (
                          <div className="w-11 h-11 rounded-full gradient-primary text-white font-bold flex items-center justify-center text-sm">
                            {title.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white truncate">{title}</span>
                          <span className="text-[10px] text-surface-500">
                            {conv.lastMessageAt ? formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: false }) : ''}
                          </span>
                        </div>
                        <p className="text-[11px] text-surface-400 truncate mt-0.5">
                          {conv.lastMessage?.content || (conv.lastMessage?.type ? `📎 ${conv.lastMessage.type}` : 'Encrypted conversation')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {unread > 0 && (
                        <span className="px-2 py-0.5 rounded-full gradient-primary text-white text-[10px] font-bold shadow-sm">
                          {unread}
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-surface-500 group-hover:text-primary-400 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Dashboard Section Customization Modal */}
      {showCustomizeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-dark-card border border-dark-border rounded-3xl p-5 shadow-2xl animate-scale-in text-xs space-y-4">
            <div className="flex items-center justify-between border-b border-dark-border pb-3">
              <h3 className="font-bold text-white text-sm">Customize Home Dashboard</h3>
              <button
                onClick={() => setShowCustomizeModal(false)}
                className="w-7 h-7 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>

            <p className="text-surface-400 text-[11px]">
              Toggle which communication widgets and cards appear on your dashboard:
            </p>

            <div className="space-y-2.5">
              {[
                { key: 'quickActions', label: '⚡ Quick Actions Hub' },
                { key: 'onlineFriends', label: '🟢 Online Friends Carousel' },
                { key: 'pinnedChats', label: '📌 Pinned Conversations' },
                { key: 'recentChats', label: '💬 Recent Active Conversations' },
              ].map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-dark-input/60 border border-dark-border cursor-pointer hover:bg-dark-hover transition-colors"
                >
                  <span className="font-semibold text-white">{label}</span>
                  <input
                    type="checkbox"
                    checked={homeSections[key]}
                    onChange={() => toggleHomeSection(key)}
                    className="w-4 h-4 accent-primary-500 rounded cursor-pointer"
                  />
                </label>
              ))}
            </div>

            <button
              onClick={() => setShowCustomizeModal(false)}
              className="w-full py-2.5 rounded-xl gradient-primary text-white font-bold transition-all"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
