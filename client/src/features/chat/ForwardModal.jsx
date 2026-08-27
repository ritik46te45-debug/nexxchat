import { useState, useMemo } from 'react';
import { X, Search, Check, Send, Users, User, ArrowRight, Loader2 } from 'lucide-react';
import useChatStore from '../../stores/chatStore';
import useAuthStore from '../../stores/authStore';
import toast from 'react-hot-toast';

export default function ForwardModal({ message, onClose }) {
  const { conversations, forwardMessage } = useChatStore();
  const { user } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConvIds, setSelectedConvIds] = useState([]);
  const [isSending, setIsSending] = useState(false);

  const myId = (user?._id || user)?.toString();

  // Filter conversations
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      let displayName = '';
      if (c.type === 'group' || c.type === 'channel') {
        displayName = c.groupName || 'Group';
      } else {
        const other = c.participants?.find((p) => (p.user?._id || p.user)?.toString() !== myId);
        displayName = other?.user?.displayName || other?.user?.username || 'User';
      }
      return displayName.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [conversations, myId, searchQuery]);

  const toggleSelect = (convId) => {
    setSelectedConvIds((prev) =>
      prev.includes(convId) ? prev.filter((id) => id !== convId) : [...prev, convId]
    );
  };

  const handleForward = async () => {
    if (selectedConvIds.length === 0 || !message) return;
    setIsSending(true);
    try {
      await forwardMessage(message._id, selectedConvIds);
      toast.success(`Message forwarded to ${selectedConvIds.length} chat${selectedConvIds.length > 1 ? 's' : ''}`);
      onClose();
    } catch (err) {
      toast.error('Failed to forward message');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 select-none animate-fade-in">
      <div className="w-full max-w-md bg-dark-card border border-dark-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-dark-border flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white leading-tight">Forward Message</h3>
            <p className="text-[11px] text-surface-400">Select one or multiple conversations</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white flex items-center justify-center transition-all border border-dark-border"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message preview snippet */}
        <div className="px-5 py-2.5 bg-dark-input/60 border-b border-dark-border/60 text-xs text-surface-300 flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] font-bold text-primary-400 uppercase tracking-wider">Preview:</span>
          <span className="truncate italic">{message?.content || `[${message?.type || 'Media'}]`}</span>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-dark-border flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats or groups..."
              className="w-full pl-9 pr-3 py-2 bg-dark-input text-white text-xs rounded-xl border border-dark-border focus:border-primary-500 focus:outline-none placeholder:text-surface-500"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto hide-scrollbar p-2 space-y-1">
          {filteredConversations.length === 0 ? (
            <div className="py-10 text-center text-surface-500 text-xs">No matching conversations found</div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = selectedConvIds.includes(conv._id);
              let title = '';
              let avatar = '';
              const isGroup = conv.type === 'group' || conv.type === 'channel';

              if (isGroup) {
                title = conv.groupName || 'Group';
                avatar = conv.groupAvatar?.url;
              } else {
                const other = conv.participants?.find((p) => (p.user?._id || p.user)?.toString() !== myId);
                title = other?.user?.displayName || other?.user?.username || 'User';
                avatar = other?.user?.avatar?.url;
              }

              return (
                <button
                  key={conv._id}
                  onClick={() => toggleSelect(conv._id)}
                  className={`w-full p-2.5 rounded-2xl flex items-center justify-between gap-3 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-primary-500/15 border border-primary-500/40 text-white'
                      : 'hover:bg-dark-hover text-surface-200 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative flex-shrink-0">
                      {avatar ? (
                        <img src={avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-sm">
                          {isGroup ? <Users className="w-4 h-4" /> : title.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-xs font-bold text-white truncate">{title}</p>
                      <p className="text-[10px] text-surface-400 capitalize">{conv.type}</p>
                    </div>
                  </div>

                  {/* Selection Checkbox */}
                  <div
                    className={`w-5 h-5 rounded-lg flex items-center justify-center border transition-all flex-shrink-0 ${
                      isSelected
                        ? 'gradient-primary border-transparent text-white shadow-sm'
                        : 'border-dark-border bg-dark-input'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Bottom Action Footer */}
        <div className="p-4 border-t border-dark-border bg-dark-card flex-shrink-0 flex items-center justify-between gap-3">
          <span className="text-xs text-surface-400 font-medium">
            {selectedConvIds.length} chat{selectedConvIds.length !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={handleForward}
            disabled={selectedConvIds.length === 0 || isSending}
            className="px-5 py-2.5 rounded-xl gradient-primary text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-primary-500/30 hover:opacity-95 active:scale-95 disabled:opacity-40 transition-all cursor-pointer"
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Forwarding...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" /> Forward Now
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
