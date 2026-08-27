import { useState, useMemo } from 'react';
import {
  Search, X, User, Users, MessageSquare, Image, FileText,
  Phone, Video, ArrowRight, Loader2, Link
} from 'lucide-react';
import { format } from 'date-fns';
import useChatStore from '../../stores/chatStore';
import useAuthStore from '../../stores/authStore';
import useUIStore from '../../stores/uiStore';

const CATEGORIES = [
  { id: 'all', label: 'All Results' },
  { id: 'people', label: 'People & Friends', icon: User },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'media', label: 'Photos & Videos', icon: Image },
  { id: 'files', label: 'Documents & Files', icon: FileText },
  { id: 'groups', label: 'Groups', icon: Users },
];

export default function GlobalSearchModal({ onClose, onStartCall }) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const { conversations, messages, setActiveConversation } = useChatStore();
  const { user } = useAuthStore();
  const { isMobile, setShowChatOnMobile } = useUIStore();

  const myId = (user?._id || user)?.toString();

  // Search logic across conversations, users, messages
  const searchResults = useMemo(() => {
    if (!query.trim() || query.length < 2) return { people: [], messages: [], media: [], files: [], groups: [] };
    const q = query.toLowerCase();

    const people = [];
    const groups = [];
    const matchedMessages = [];
    const media = [];
    const files = [];

    (conversations || []).forEach((c) => {
      if (c.type === 'group' || c.type === 'channel') {
        if (c.groupName?.toLowerCase().includes(q)) {
          groups.push(c);
        }
      } else {
        const other = c.participants?.find((p) => (p.user?._id || p.user)?.toString() !== myId);
        if (other && typeof other.user === 'object') {
          const name = other.user.displayName || other.user.username || '';
          const userCode = other.user.userCode || '';
          if (name.toLowerCase().includes(q) || userCode.includes(q)) {
            people.push({ user: other.user, conversation: c });
          }
        }
      }
    });

    (messages || []).forEach((m) => {
      if (m.isDeletedForEveryone) return;
      if (m.content?.toLowerCase().includes(q)) {
        matchedMessages.push(m);
      }
      if (m.attachments && Array.isArray(m.attachments)) {
        m.attachments.forEach((att) => {
          if (att.fileName?.toLowerCase().includes(q)) {
            if (att.type === 'image' || att.type === 'video') media.push({ ...att, message: m });
            else files.push({ ...att, message: m });
          }
        });
      }
    });

    return { people, groups, messages: matchedMessages, media, files };
  }, [conversations, messages, myId, query]);

  const { setSidebarView } = useUIStore();

  const handleOpenConversation = (conv) => {
    setActiveConversation(conv);
    setSidebarView('chats');
    if (isMobile) setShowChatOnMobile(true);
    onClose();
  };

  const totalResultsCount =
    searchResults.people.length +
    searchResults.groups.length +
    searchResults.messages.length +
    searchResults.media.length +
    searchResults.files.length;

  return (
    <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-fade-in select-none">
      <div className="w-full max-w-2xl bg-dark-card border border-dark-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-in">
        {/* Search Header */}
        <div className="p-4 sm:p-5 border-b border-dark-border flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people, messages, media, files, groups..."
              className="w-full pl-10 pr-4 py-2.5 bg-dark-input text-white text-xs sm:text-sm rounded-2xl border border-dark-border focus:border-primary-500 focus:outline-none placeholder:text-surface-500"
              autoFocus
            />
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-2xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white flex items-center justify-center transition-all border border-dark-border flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Pills */}
        <div className="flex gap-1.5 px-4 py-2.5 border-b border-dark-border bg-dark-input/40 overflow-x-auto hide-scrollbar">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 flex-shrink-0 ${
                activeCategory === cat.id
                  ? 'gradient-primary text-white shadow-sm'
                  : 'bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white border border-dark-border'
              }`}
            >
              {cat.icon && <cat.icon className="w-3 h-3" />}
              {cat.label}
            </button>
          ))}
        </div>

        {/* Results Container */}
        <div className="flex-1 overflow-y-auto hide-scrollbar p-4 space-y-4 text-xs">
          {!query.trim() ? (
            <div className="py-12 text-center text-surface-500">
              <Search className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="font-semibold text-white">Search NexChat</p>
              <p className="text-[11px] text-surface-500 mt-1">
                Type names, hashtags, keywords, or filenames to search globally.
              </p>
            </div>
          ) : totalResultsCount === 0 ? (
            <div className="py-12 text-center text-surface-500">
              No results found matching "{query}"
            </div>
          ) : (
            <>
              {/* People Results */}
              {(activeCategory === 'all' || activeCategory === 'people') && searchResults.people.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-2">People & Friends</h4>
                  <div className="space-y-1.5">
                    {searchResults.people.map(({ user: pUser, conversation }) => (
                      <div
                        key={pUser._id}
                        onClick={() => handleOpenConversation(conversation)}
                        className="p-2.5 rounded-2xl bg-dark-input/50 hover:bg-dark-hover border border-dark-border flex items-center justify-between gap-3 cursor-pointer group transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative flex-shrink-0">
                            {pUser.avatar?.url ? (
                              <img src={pUser.avatar.url} alt="" className="w-9 h-9 rounded-full object-cover" />
                            ) : (
                              <div className="w-9 h-9 rounded-full gradient-primary text-white font-bold flex items-center justify-center text-xs">
                                {pUser.displayName?.charAt(0) || '?'}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-white truncate">{pUser.displayName || pUser.username}</p>
                            <p className="text-[10px] text-surface-400 font-mono">#{pUser.userCode || '0000'}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onStartCall && onStartCall(pUser, 'voice');
                              onClose();
                            }}
                            className="p-1.5 rounded-lg bg-dark-card hover:bg-accent-green/20 text-surface-400 hover:text-accent-green border border-dark-border"
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onStartCall && onStartCall(pUser, 'video');
                              onClose();
                            }}
                            className="p-1.5 rounded-lg bg-dark-card hover:bg-primary-500/20 text-surface-400 hover:text-primary-400 border border-dark-border"
                          >
                            <Video className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Groups Results */}
              {(activeCategory === 'all' || activeCategory === 'groups') && searchResults.groups.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-2">Groups</h4>
                  <div className="space-y-1.5">
                    {searchResults.groups.map((grp) => (
                      <div
                        key={grp._id}
                        onClick={() => handleOpenConversation(grp)}
                        className="p-2.5 rounded-2xl bg-dark-input/50 hover:bg-dark-hover border border-dark-border flex items-center justify-between gap-3 cursor-pointer group transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-accent-purple/20 text-accent-purple flex items-center justify-center font-bold">
                            <Users className="w-4 h-4" />
                          </div>
                          <p className="font-bold text-white truncate">{grp.groupName || 'Group'}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-surface-500 group-hover:text-primary-400 group-hover:translate-x-0.5 transition-all" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages Results */}
              {(activeCategory === 'all' || activeCategory === 'messages') && searchResults.messages.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-2">Messages</h4>
                  <div className="space-y-1.5">
                    {searchResults.messages.map((m) => (
                      <div
                        key={m._id}
                        onClick={() => {
                          const conv = conversations.find((c) => c._id === (m.conversation?._id || m.conversation));
                          if (conv) handleOpenConversation(conv);
                        }}
                        className="p-2.5 rounded-2xl bg-dark-input/50 hover:bg-dark-hover border border-dark-border cursor-pointer group transition-all text-left"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-white">{m.sender?.displayName || 'User'}</span>
                          <span className="text-[10px] text-surface-500">
                            {m.createdAt ? format(new Date(m.createdAt), 'MMM d, h:mm a') : ''}
                          </span>
                        </div>
                        <p className="text-surface-300 line-clamp-1">{m.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
