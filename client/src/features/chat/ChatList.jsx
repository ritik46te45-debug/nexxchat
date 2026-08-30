import { useState, useMemo } from 'react';
import { Search, Plus, Edit3, Users, Archive, Pin, Volume2, VolumeX, Bell } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import useChatStore from '../../stores/chatStore';
import useAuthStore from '../../stores/authStore';
import useUIStore from '../../stores/uiStore';
import NewChatModal from './NewChatModal';
import NewGroupModal from '../groups/NewGroupModal';

export default function ChatList({ onOpenProfile }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const { conversations, activeConversation, setActiveConversation, typingUsers, onlineUsers, drafts } = useChatStore();
  const { user } = useAuthStore();
  const { isMobile, setShowChatOnMobile, unreadNotifCount, setSidebarView } = useUIStore();

  // Filter and sort conversations
  const filteredConversations = useMemo(() => {
    let convs = [...conversations];

    if (searchQuery) {
      convs = convs.filter(conv => {
        const otherUser = getOtherUser(conv, user?._id);
        const name = conv.type === 'group' ? conv.groupName : otherUser?.displayName || '';
        return name.toLowerCase().includes(searchQuery.toLowerCase());
      });
    }

    // Sort: pinned first, then by last message time
    convs.sort((a, b) => {
      const aPinned = a._participant?.isPinned ? 1 : 0;
      const bPinned = b._participant?.isPinned ? 1 : 0;
      const timeA = new Date(a.lastMessageAt || a.updatedAt || 0).getTime();
      const timeB = new Date(b.lastMessageAt || b.updatedAt || 0).getTime();
      return timeB - timeA;
    });

    return convs;
  }, [conversations, searchQuery, user?._id]);

  const handleSelectConversation = (conv) => {
    setActiveConversation(conv);
    if (isMobile) setShowChatOnMobile(true);
  };

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-dark-border">
          <div className="flex items-center gap-3">
            {/* User DP Avatar Button */}
            <button
              onClick={onOpenProfile}
              className="relative group cursor-pointer"
              title="Edit Your Profile & DP"
            >
              {user?.avatar?.url ? (
                <img
                  src={user.avatar.url}
                  alt={user.displayName}
                  className="w-9 h-9 rounded-full object-cover ring-2 ring-primary-500/60 shadow-md group-hover:scale-105 transition-transform"
                />
              ) : (
                <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center font-bold text-white text-sm ring-2 ring-primary-500/60 shadow-md group-hover:scale-105 transition-transform">
                  {(user?.displayName || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-accent-green border-2 border-dark-card" />
            </button>

            <h1 className="text-xl font-bold text-white leading-none">Chats</h1>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSidebarView('notifications')}
              className="relative w-9 h-9 rounded-xl bg-dark-input text-surface-400 hover:text-white hover:bg-dark-hover flex items-center justify-center transition-all border border-dark-border"
              title="Notifications & Alerts"
            >
              <Bell className="w-4 h-4" />
              {unreadNotifCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-accent-red text-white text-[9px] font-bold flex items-center justify-center px-1 animate-pulse">
                  {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowNewGroup(true)}
              className="w-9 h-9 rounded-xl bg-dark-input text-surface-400 hover:text-white hover:bg-dark-hover flex items-center justify-center transition-all border border-dark-border"
              title="New Group"
            >
              <Users className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowNewChat(true)}
              className="w-9 h-9 rounded-xl gradient-primary text-white flex items-center justify-center transition-all shadow-md shadow-primary-500/20"
              title="New Direct Message"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-10 pr-4 py-2.5 bg-dark-input border border-dark-border rounded-xl text-sm text-white placeholder-surface-500 input-focus transition-all"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto hide-scrollbar px-2 py-1 space-y-1">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-dark-card border border-dark-border flex items-center justify-center mb-4">
                <Search className="w-7 h-7 text-surface-500" />
              </div>
              <p className="text-surface-400 font-medium">
                {searchQuery ? 'No conversations found' : 'No conversations yet'}
              </p>
              <p className="text-surface-500 text-sm mt-1">
                {searchQuery ? 'Try a different search' : 'Start a new chat to begin messaging'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setShowNewChat(true)}
                  className="mt-4 px-4 py-2 rounded-xl bg-primary-500/20 text-primary-400 text-sm font-medium hover:bg-primary-500/30 transition-all"
                >
                  Start New Chat
                </button>
              )}
            </div>
          ) : (
            filteredConversations.map(conv => (
              <ConversationItem
                key={conv._id}
                conversation={conv}
                userId={user?._id}
                isActive={activeConversation?._id === conv._id}
                onClick={() => handleSelectConversation(conv)}
                typingUsers={typingUsers[conv._id]}
                isOnline={isUserOnline(conv, user?._id, onlineUsers)}
                draft={drafts[conv._id]}
              />
            ))
          )}
        </div>
      </div>

      {/* New Chat Modal */}
      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} />}

      {/* New Group Modal */}
      {showNewGroup && <NewGroupModal onClose={() => setShowNewGroup(false)} />}
    </>
  );
}

function ConversationItem({ conversation, userId, isActive, onClick, typingUsers, isOnline, draft }) {
  const otherUser = getOtherUser(conversation, userId);
  const myId = userId?.toString();
  const isFriend = Array.isArray(otherUser?.friends) && otherUser.friends.some(f => (f?._id || f)?.toString() === myId);

  // Privacy evaluation for avatar and online status
  const canSeeProfilePhoto = !otherUser?.privacy?.profilePhoto || otherUser.privacy.profilePhoto === 'everyone' || (otherUser.privacy.profilePhoto === 'friends' && isFriend);
  const canSeeOnline = !otherUser?.privacy?.online || otherUser.privacy.online === 'everyone' || (otherUser.privacy.online === 'friends' && isFriend);

  const name = conversation.type === 'group' ? conversation.groupName : (otherUser?.displayName || otherUser?.username || 'Unknown');
  const avatar = conversation.type === 'group' ? conversation.groupAvatar?.url : (canSeeProfilePhoto ? otherUser?.avatar?.url : null);
  const showOnline = isOnline && canSeeOnline;

  const unread = conversation._participant?.unreadCount || 0;
  const isPinned = conversation._participant?.isPinned;
  const isMuted = conversation._participant?.isMuted;
  const lastMessage = conversation.lastMessage;

  const typingNames = typingUsers ? Object.values(typingUsers) : [];
  const isTyping = typingNames.length > 0;

  // Format last message preview
  const getPreview = () => {
    if (draft) return { text: `Draft: ${draft}`, isDraft: true };
    if (isTyping) {
      return {
        text: typingNames.length === 1
          ? `${typingNames[0]} is typing...`
          : `${typingNames.join(', ')} are typing...`,
        isTyping: true,
      };
    }
    if (!lastMessage) return { text: 'No messages yet' };

    const sender = lastMessage.sender;
    const prefix = conversation.type === 'group' && sender
      ? `${sender.displayName || sender.username}: `
      : '';

    if (lastMessage.isDeletedForEveryone) return { text: `${prefix}Message deleted` };

    switch (lastMessage.type) {
      case 'image': return { text: `${prefix}📷 Photo` };
      case 'video': return { text: `${prefix}🎥 Video` };
      case 'audio': case 'voice': return { text: `${prefix}🎤 Voice message` };
      case 'document': case 'file': return { text: `${prefix}📎 File` };
      case 'gif': return { text: `${prefix}GIF` };
      case 'sticker': return { text: `${prefix}Sticker` };
      case 'location': return { text: `${prefix}📍 Location` };
      case 'contact': return { text: `${prefix}👤 Contact` };
      case 'poll': return { text: `${prefix}📊 Poll` };
      case 'call': return { text: `${prefix}📞 Call` };
      default: return { text: `${prefix}${lastMessage.content || ''}` };
    }
  };

  const preview = getPreview();
  const timeStr = lastMessage?.createdAt || conversation.lastMessageAt;

  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3.5 py-3 transition-all duration-150 text-left rounded-2xl
        ${isActive
          ? 'bg-primary-500/15 text-white shadow-sm ring-1 ring-primary-500/30'
          : 'hover:bg-dark-hover/60 text-surface-300'
        }
      `}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {avatar ? (
          <img src={avatar} alt={name} className="w-12 h-12 rounded-full object-cover" />
        ) : (
          <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center font-bold text-white text-base">
            {(name || '?').charAt(0).toUpperCase()}
          </div>
        )}
        {showOnline && <div className="absolute bottom-0 right-0 online-dot" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-white text-sm truncate">{name}</span>
          <span className="text-[11px] text-surface-500 flex-shrink-0 ml-2">
            {(() => { try { if (!timeStr) return ''; const d = new Date(timeStr); return isNaN(d.getTime()) ? '' : formatDistanceToNow(d, { addSuffix: false }); } catch(e) { return ''; } })()}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className={`text-xs truncate ${
            preview.isDraft ? 'text-accent-red' :
            preview.isTyping ? 'text-primary-400' :
            unread > 0 ? 'text-surface-300 font-medium' : 'text-surface-500'
          }`}>
            {preview.text}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
            {isPinned && <Pin className="w-3 h-3 text-surface-500 rotate-45" />}
            {isMuted && <VolumeX className="w-3 h-3 text-surface-500" />}
            {unread > 0 && (
              <span className="min-w-[20px] h-5 rounded-full bg-primary-500 text-white text-[10px] font-bold flex items-center justify-center px-1.5">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// Helpers
function getOtherUser(conversation, userId) {
  if (conversation.type === 'group') return null;
  const myId = userId?.toString();
  const other = conversation.participants?.find(
    p => {
      const pId = (p.user?._id || p.user)?.toString();
      return pId && myId && pId !== myId;
    }
  );
  return typeof other?.user === 'object' && other?.user !== null ? other.user : other?.user ? { _id: other.user.toString(), displayName: 'User' } : null;
}

function isUserOnline(conversation, userId, onlineUsers) {
  if (conversation.type === 'group') return false;
  const other = getOtherUser(conversation, userId);
  if (!other) return false;
  const otherId = (other._id || other)?.toString();
  return other.isOnline || (otherId && onlineUsers.has(otherId));
}
