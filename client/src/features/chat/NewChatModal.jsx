import { useState, useEffect } from 'react';
import { X, Search, Loader2, UserPlus, MessageCircle } from 'lucide-react';
import api from '../../lib/api';
import useChatStore from '../../stores/chatStore';
import useUIStore from '../../stores/uiStore';
import toast from 'react-hot-toast';

export default function NewChatModal({ onClose }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [friends, setFriends] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { getOrCreateConversation, setActiveConversation } = useChatStore();
  const { isMobile, setShowChatOnMobile } = useUIStore();

  // Load friends list
  useEffect(() => {
    const loadFriends = async () => {
      try {
        const { data } = await api.get('/friends');
        setFriends(data.friends || []);
      } catch (error) {
        console.error('Load friends error:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadFriends();
  }, []);

  // Search users
  useEffect(() => {
    if (!query.trim()) {
      setUsers([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const { data } = await api.get(`/users/search?q=${encodeURIComponent(query.trim())}`);
        setUsers(data.users || []);
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const handleStartChat = async (userId) => {
    try {
      const conv = await getOrCreateConversation(userId);
      setActiveConversation(conv);
      if (isMobile) setShowChatOnMobile(true);
      onClose();
    } catch (error) {
      toast.error('Failed to start conversation');
    }
  };

  const handleSendFriendRequest = async (userId) => {
    try {
      await api.post(`/friends/request/${userId}`);
      toast.success('Friend request sent!');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to send request');
    }
  };

  const displayList = query.trim().length > 0 ? users : friends;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-md glass-card p-0 animate-scale-in max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <h2 className="text-lg font-bold text-white">New Chat</h2>
          <button onClick={onClose} className="text-surface-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter exact @username or 4-digit code (e.g. #1234)..."
              className="w-full pl-10 pr-4 py-2.5 bg-dark-input border border-dark-border rounded-xl text-xs text-white placeholder-surface-500 input-focus"
              autoFocus
            />
          </div>
          {query.length === 0 && friends.length > 0 && (
            <p className="text-xs text-surface-500 mt-2">Your friends</p>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {isLoading || isSearching ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
            </div>
          ) : displayList.length === 0 ? (
            <div className="text-center py-8 text-surface-500 text-sm">
              {query.trim().length > 0 ? 'No users found' : 'No friends yet. Search for users to connect!'}
            </div>
          ) : (
            displayList.map((u) => (
              <div key={u._id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-dark-hover transition-colors">
                {u.avatar?.url ? (
                  <img src={u.avatar.url} alt={u.displayName} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-blue-500 flex items-center justify-center text-white font-semibold text-sm">
                    {u.displayName?.charAt(0)?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium text-white truncate">{u.displayName}</p>
                    {u.userCode && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 bg-primary-500/20 text-primary-400 rounded-md border border-primary-500/30">
                        #{u.userCode}
                      </span>
                    )}
                    {u.isSelf && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.2 bg-surface-500/20 text-surface-300 rounded-md">
                        You
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-surface-500 truncate">@{u.username}</p>
                </div>
                {!u.isSelf && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleStartChat(u._id)}
                      className="p-2 rounded-lg bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 transition-all"
                      title="Start chat"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                    {query.trim().length > 0 && (
                      <button
                        onClick={() => handleSendFriendRequest(u._id)}
                        className="p-2 rounded-lg bg-accent-green/20 text-accent-green hover:bg-accent-green/30 transition-all"
                        title="Add friend"
                      >
                        <UserPlus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
