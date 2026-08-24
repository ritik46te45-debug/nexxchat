import { useState, useEffect } from 'react';
import { Users, UserPlus, Clock, Ban, MessageCircle, Phone, Video, Check, X, Search, Loader2 } from 'lucide-react';
import api from '../../lib/api';
import useChatStore from '../../stores/chatStore';
import useUIStore from '../../stores/uiStore';
import toast from 'react-hot-toast';

export default function ContactsTab({ onStartCall }) {
  const [activeTab, setActiveTab] = useState('friends'); // 'friends', 'requests', 'blocked'
  const [friends, setFriends] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);

  const { getOrCreateConversation, setActiveConversation, onlineUsers } = useChatStore();
  const { isMobile, setShowChatOnMobile, setSidebarView } = useUIStore();

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'friends') {
        const { data } = await api.get('/friends');
        setFriends(data.friends || []);
      } else if (activeTab === 'requests') {
        const [pendingRes, sentRes] = await Promise.all([
          api.get('/friends/requests/pending'),
          api.get('/friends/requests/sent'),
        ]);
        setPendingRequests(pendingRes.data.requests || []);
        setSentRequests(sentRes.data.requests || []);
      } else if (activeTab === 'blocked') {
        const { data } = await api.get('/users/blocked');
        setBlockedUsers(data.blockedUsers || []);
      }
    } catch (err) {
      console.error('Load contacts error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Search users
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const { data } = await api.get(`/users/search?q=${encodeURIComponent(searchQuery.trim())}`);
        setSearchResults(data.users || []);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleStartChat = async (userId) => {
    try {
      const conv = await getOrCreateConversation(userId);
      setActiveConversation(conv);
      setSidebarView('chats');
      if (isMobile) setShowChatOnMobile(true);
    } catch (err) {
      toast.error('Failed to open chat');
    }
  };

  const handleAcceptRequest = async (requestId) => {
    try {
      await api.post(`/friends/accept/${requestId}`);
      toast.success('Friend request accepted!');
      setPendingRequests((prev) => prev.filter((r) => r._id !== requestId));
    } catch (err) {
      toast.error('Failed to accept request');
    }
  };

  const handleRejectRequest = async (requestId) => {
    try {
      await api.post(`/friends/reject/${requestId}`);
      toast('Request declined');
      setPendingRequests((prev) => prev.filter((r) => r._id !== requestId));
    } catch (err) {
      toast.error('Failed to decline request');
    }
  };

  const handleCancelRequest = async (requestId) => {
    try {
      await api.post(`/friends/cancel/${requestId}`);
      toast('Request cancelled');
      setSentRequests((prev) => prev.filter((r) => r._id !== requestId));
    } catch (err) {
      toast.error('Failed to cancel request');
    }
  };

  const handleSendRequest = async (userId) => {
    try {
      await api.post(`/friends/request/${userId}`);
      toast.success('Friend request sent!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send request');
    }
  };

  const handleUnblock = async (userId) => {
    try {
      await api.delete(`/users/${userId}/block`);
      toast.success('User unblocked');
      setBlockedUsers((prev) => prev.filter((u) => u._id !== userId));
    } catch (err) {
      toast.error('Failed to unblock user');
    }
  };

  return (
    <div className="flex flex-col h-full bg-dark-bg">
      {/* Header */}
      <div className="px-4 py-4 border-b border-dark-border">
        <h1 className="text-xl font-bold text-white mb-3">Contacts</h1>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 bg-dark-input p-1 rounded-xl border border-dark-border">
          <button
            onClick={() => setActiveTab('friends')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'friends' ? 'bg-primary-500 text-white shadow-md' : 'text-surface-400 hover:text-white'
            }`}
          >
            Friends ({friends.length})
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold relative transition-all ${
              activeTab === 'requests' ? 'bg-primary-500 text-white shadow-md' : 'text-surface-400 hover:text-white'
            }`}
          >
            Requests
            {pendingRequests.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-accent-red text-white text-[10px] rounded-full">
                {pendingRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('blocked')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'blocked' ? 'bg-primary-500 text-white shadow-md' : 'text-surface-400 hover:text-white'
            }`}
          >
            Blocked
          </button>
        </div>
      </div>

      {/* User Search Bar */}
      <div className="px-4 py-3 border-b border-dark-border/40">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, @username, or 4-digit code (e.g. #1234)..."
            className="w-full pl-9 pr-4 py-2 bg-dark-input border border-dark-border rounded-xl text-xs text-white placeholder-surface-500 input-focus transition-all"
          />
        </div>
      </div>

      {/* Main List Area */}
      <div className="flex-1 overflow-y-auto hide-scrollbar px-3 py-2">
        {/* Search Results Display */}
        {searchQuery.trim().length > 0 ? (
          <div>
            <p className="text-xs font-semibold text-surface-400 px-2 mb-2">Search Results</p>
            {isSearching ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 text-primary-400 animate-spin" />
              </div>
            ) : searchResults.length === 0 ? (
              <p className="text-xs text-surface-500 text-center py-6">No users found for &quot;{searchQuery}&quot;</p>
            ) : (
              searchResults.map((user) => (
                <div
                  key={user._id}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-dark-hover transition-colors mb-1"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center font-bold text-white text-sm">
                      {user.displayName?.charAt(0) || '?'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-semibold text-white truncate">{user.displayName}</p>
                        {user.userCode && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 bg-primary-500/20 text-primary-400 rounded-md border border-primary-500/30">
                            #{user.userCode}
                          </span>
                        )}
                        {user.isSelf && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.2 bg-surface-500/20 text-surface-300 rounded-md">
                            You
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-surface-500 truncate">@{user.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!user.isSelf && (
                      <button
                        onClick={() => handleSendRequest(user._id)}
                        className="px-3 py-1.5 rounded-lg bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 text-xs font-semibold flex items-center gap-1.5 transition-all"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Add
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
          </div>
        ) : activeTab === 'friends' ? (
          /* Friends List */
          friends.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Users className="w-12 h-12 text-surface-500 mx-auto mb-3 opacity-60" />
              <p className="text-sm font-semibold text-surface-300">No friends added yet</p>
              <p className="text-xs text-surface-500 mt-1">Search for users above to connect and start chatting!</p>
            </div>
          ) : (
            friends.map((friend) => {
              const myId = (user?._id || user)?.toString();
              const isFriend = true; // They are in friends list

              const canSeeProfilePhoto = !friend?.privacy?.profilePhoto || friend.privacy.profilePhoto !== 'nobody';
              const canSeeOnline = !friend?.privacy?.online || friend.privacy.online !== 'nobody';
              const canSeeAbout = !friend?.privacy?.about || friend.privacy.about !== 'nobody';

              const isOnline = (friend.isOnline || onlineUsers.has(friend._id?.toString())) && canSeeOnline;
              return (
                <div
                  key={friend._id}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-dark-hover transition-all mb-1 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative">
                      {friend.avatar?.url && canSeeProfilePhoto ? (
                        <img src={friend.avatar.url} alt="" className="w-11 h-11 rounded-full object-cover" />
                      ) : (
                        <div className="w-11 h-11 rounded-full gradient-primary flex items-center justify-center font-bold text-white">
                          {friend.displayName?.charAt(0) || '?'}
                        </div>
                      )}
                      {isOnline && <div className="absolute bottom-0 right-0 online-dot" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{friend.displayName}</p>
                      <p className="text-xs text-surface-500 truncate">
                        {isOnline ? 'Active now' : (canSeeAbout && friend.about) ? friend.about : `@${friend.username}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleStartChat(friend._id)}
                      className="w-8 h-8 rounded-lg bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 flex items-center justify-center transition-all"
                      title="Send Message"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                    {onStartCall && (
                      <>
                        <button
                          onClick={() => onStartCall(friend, 'voice')}
                          className="w-8 h-8 rounded-lg bg-dark-input hover:bg-dark-hover text-surface-300 hover:text-white flex items-center justify-center transition-all"
                          title="Voice Call"
                        >
                          <Phone className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onStartCall(friend, 'video')}
                          className="w-8 h-8 rounded-lg bg-dark-input hover:bg-dark-hover text-surface-300 hover:text-white flex items-center justify-center transition-all"
                          title="Video Call"
                        >
                          <Video className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )
        ) : activeTab === 'requests' ? (
          /* Requests Tab */
          <div className="space-y-4">
            {/* Received */}
            <div>
              <p className="text-xs font-bold text-surface-400 px-2 mb-2 uppercase tracking-wider">
                Received Requests ({pendingRequests.length})
              </p>
              {pendingRequests.length === 0 ? (
                <p className="text-xs text-surface-500 px-2 py-2">No pending requests</p>
              ) : (
                pendingRequests.map((req) => (
                  <div
                    key={req._id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-dark-card border border-dark-border mb-2"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-sm">
                        {req.from?.displayName?.charAt(0) || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{req.from?.displayName}</p>
                        <p className="text-xs text-surface-500 truncate">@{req.from?.username}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAcceptRequest(req._id)}
                        className="p-2 rounded-lg bg-accent-green/20 text-accent-green hover:bg-accent-green/30 transition-all"
                        title="Accept"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRejectRequest(req._id)}
                        className="p-2 rounded-lg bg-accent-red/20 text-accent-red hover:bg-accent-red/30 transition-all"
                        title="Decline"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Sent */}
            <div>
              <p className="text-xs font-bold text-surface-400 px-2 mb-2 uppercase tracking-wider">
                Sent Requests ({sentRequests.length})
              </p>
              {sentRequests.length === 0 ? (
                <p className="text-xs text-surface-500 px-2 py-2">No sent requests</p>
              ) : (
                sentRequests.map((req) => (
                  <div
                    key={req._id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-dark-card border border-dark-border mb-2"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-dark-input border border-dark-border flex items-center justify-center text-white font-bold text-sm">
                        {req.to?.displayName?.charAt(0) || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{req.to?.displayName}</p>
                        <p className="text-xs text-surface-500 truncate">Pending approval</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleCancelRequest(req._id)}
                      className="text-xs text-surface-400 hover:text-accent-red px-2.5 py-1.5 rounded-lg border border-dark-border hover:border-accent-red/30 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* Blocked Users Tab */
          <div>
            <p className="text-xs font-bold text-surface-400 px-2 mb-2 uppercase tracking-wider">
              Blocked Users ({blockedUsers.length})
            </p>
            {blockedUsers.length === 0 ? (
              <div className="text-center py-8">
                <Ban className="w-8 h-8 text-surface-500 mx-auto mb-2 opacity-50" />
                <p className="text-xs text-surface-500">You haven&apos;t blocked any users.</p>
              </div>
            ) : (
              blockedUsers.map((user) => (
                <div
                  key={user._id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-dark-card border border-dark-border mb-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-dark-input border border-dark-border flex items-center justify-center font-bold text-surface-400">
                      {user.displayName?.charAt(0) || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{user.displayName}</p>
                      <p className="text-xs text-surface-500 truncate">@{user.username}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnblock(user._id)}
                    className="text-xs text-accent-green hover:bg-accent-green/10 border border-accent-green/30 px-3 py-1.5 rounded-lg font-semibold transition-all"
                  >
                    Unblock
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
