import { useState, useEffect } from 'react';
import { Star, X, Search, Loader2, MessageSquare, ExternalLink } from 'lucide-react';
import api from '../../lib/api';
import useChatStore from '../../stores/chatStore';
import useUIStore from '../../stores/uiStore';
import toast from 'react-hot-toast';

export default function StarredMessagesModal({ onClose, onSelectConversation }) {
  const [starredMessages, setStarredMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const { setActiveConversation } = useChatStore();
  const { isMobile, setShowChatOnMobile, setSidebarView } = useUIStore();

  useEffect(() => {
    fetchStarred();
  }, []);

  const fetchStarred = async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get('/messages/starred');
      setStarredMessages(data.messages || []);
    } catch (err) {
      console.error('Failed to load starred messages:', err);
      toast.error('Could not load starred messages');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnstar = async (e, messageId) => {
    e.stopPropagation();
    try {
      await api.post(`/messages/${messageId}/star`);
      setStarredMessages((prev) => prev.filter((m) => m._id !== messageId));
      toast.success('Removed from starred');
    } catch (err) {
      toast.error('Failed to unstar message');
    }
  };

  const handleOpenMessage = async (msg) => {
    if (msg.conversation?._id || msg.conversation) {
      const convId = msg.conversation._id || msg.conversation;
      try {
        const { data } = await api.get(`/conversations/${convId}`);
        if (data.conversation) {
          setActiveConversation(data.conversation);
          setSidebarView('chats');
          if (isMobile) setShowChatOnMobile(true);
          onClose();
        }
      } catch (err) {
        toast.error('Could not open conversation');
      }
    }
  };

  const filtered = starredMessages.filter((msg) => {
    if (!searchQuery.trim()) return true;
    const contentMatch = msg.content?.toLowerCase().includes(searchQuery.toLowerCase());
    const senderMatch = msg.sender?.displayName?.toLowerCase().includes(searchQuery.toLowerCase());
    return contentMatch || senderMatch;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-lg bg-dark-card border border-dark-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-dark-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-yellow-500/20 text-yellow-400 flex items-center justify-center border border-yellow-500/30">
              <Star className="w-4 h-4 fill-current" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Starred Messages</h2>
              <p className="text-xs text-surface-400">{starredMessages.length} saved bookmarks</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white flex items-center justify-center transition-all border border-dark-border"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-dark-border/40">
          <div className="relative">
            <Search className="w-4 h-4 text-surface-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search starred messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-dark-input text-white text-xs pl-9 pr-3 py-2 rounded-xl border border-dark-border focus:border-primary-500 focus:outline-none placeholder:text-surface-500"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto hide-scrollbar p-3 space-y-2">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-surface-500">
              <Loader2 className="w-6 h-6 animate-spin text-primary-500 mb-2" />
              <p className="text-xs">Loading starred messages...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 px-4">
              <Star className="w-12 h-12 text-surface-500 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-semibold text-surface-300">No starred messages</p>
              <p className="text-xs text-surface-500 mt-1 max-w-xs mx-auto">
                {searchQuery ? 'No bookmarks match your search.' : 'Star important messages in any chat to save them here for quick access.'}
              </p>
            </div>
          ) : (
            filtered.map((msg) => (
              <div
                key={msg._id}
                onClick={() => handleOpenMessage(msg)}
                className="p-3.5 rounded-2xl bg-dark-input border border-dark-border/60 hover:border-primary-500/40 hover:bg-dark-hover transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full gradient-primary flex items-center justify-center text-white text-[10px] font-bold">
                      {msg.sender?.displayName?.charAt(0) || '?'}
                    </div>
                    <span className="text-xs font-semibold text-white">{msg.sender?.displayName}</span>
                    <span className="text-[10px] text-surface-500">
                      • {new Date(msg.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>

                  <button
                    onClick={(e) => handleUnstar(e, msg._id)}
                    className="p-1 rounded-lg text-yellow-400 hover:text-surface-400 hover:bg-dark-card transition-all"
                    title="Unstar message"
                  >
                    <Star className="w-4 h-4 fill-current" />
                  </button>
                </div>

                <p className="text-xs text-surface-200 line-clamp-3 leading-relaxed">
                  {msg.content || (msg.type ? `[${msg.type.toUpperCase()}]` : 'Attachment')}
                </p>

                <div className="flex items-center justify-between mt-2 pt-2 border-t border-dark-border/40 text-[10px] text-primary-400 font-medium">
                  <span>Open in chat</span>
                  <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
