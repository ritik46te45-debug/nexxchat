import { useState, useMemo } from 'react';
import {
  Search, X, Image, Video, FileText, Link, Mic,
  BarChart2, Calendar, User, ArrowRight, MessageSquare
} from 'lucide-react';
import { format } from 'date-fns';

const FILTER_TYPES = [
  { id: 'all', label: 'All Messages' },
  { id: 'image', label: 'Photos', icon: Image },
  { id: 'video', label: 'Videos', icon: Video },
  { id: 'document', label: 'Documents', icon: FileText },
  { id: 'link', label: 'Links', icon: Link },
  { id: 'voice', label: 'Voice / Audio', icon: Mic },
  { id: 'poll', label: 'Polls', icon: BarChart2 },
];

export default function ChatSearchModal({ messages = [], onJumpToMessage, onClose }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  const filteredMessages = useMemo(() => {
    return messages.filter((msg) => {
      if (msg.isDeletedForEveryone) return false;

      // Filter by type
      if (activeFilter !== 'all') {
        if (activeFilter === 'image' && msg.type !== 'image' && !msg.attachments?.some((a) => a.type === 'image')) return false;
        if (activeFilter === 'video' && msg.type !== 'video' && msg.type !== 'video_note' && !msg.attachments?.some((a) => a.type === 'video')) return false;
        if (activeFilter === 'document' && msg.type !== 'document' && msg.type !== 'file' && !msg.attachments?.some((a) => a.type === 'document' || a.type === 'file')) return false;
        if (activeFilter === 'link' && msg.type !== 'link' && !msg.linkPreview && !msg.content?.match(/https?:\/\//i)) return false;
        if (activeFilter === 'voice' && msg.type !== 'voice' && msg.type !== 'audio' && !msg.attachments?.some((a) => a.type === 'voice' || a.type === 'audio')) return false;
        if (activeFilter === 'poll' && msg.type !== 'poll') return false;
      }

      // Filter by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const contentMatch = msg.content?.toLowerCase().includes(query);
        const senderMatch = msg.sender?.displayName?.toLowerCase().includes(query) || msg.sender?.username?.toLowerCase().includes(query);
        const fileNameMatch = msg.attachments?.some((a) => a.fileName?.toLowerCase().includes(query));
        const pollMatch = msg.poll?.question?.toLowerCase().includes(query);
        if (!contentMatch && !senderMatch && !fileNameMatch && !pollMatch) return false;
      }

      return true;
    });
  }, [messages, searchQuery, activeFilter]);

  const handleSelectMessage = (msgId) => {
    onJumpToMessage(msgId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 select-none animate-fade-in">
      <div className="w-full max-w-lg bg-dark-card border border-dark-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-in">
        {/* Search Header */}
        <div className="p-4 border-b border-dark-border flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chat messages, files, links..."
              className="w-full pl-10 pr-3.5 py-2.5 bg-dark-input text-white text-xs sm:text-sm rounded-2xl border border-dark-border focus:border-primary-500 focus:outline-none placeholder:text-surface-500"
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

        {/* Filter Pills */}
        <div className="flex gap-1.5 px-4 py-2.5 border-b border-dark-border bg-dark-input/40 overflow-x-auto hide-scrollbar">
          {FILTER_TYPES.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 flex items-center gap-1.5 ${
                activeFilter === filter.id
                  ? 'gradient-primary text-white shadow-sm'
                  : 'bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white border border-dark-border'
              }`}
            >
              {filter.icon && <filter.icon className="w-3 h-3" />}
              {filter.label}
            </button>
          ))}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto hide-scrollbar p-3 space-y-1.5 text-xs">
          {filteredMessages.length === 0 ? (
            <div className="py-14 text-center text-surface-500">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>No messages match your search criteria</p>
            </div>
          ) : (
            filteredMessages.map((msg) => (
              <button
                key={msg._id}
                onClick={() => handleSelectMessage(msg._id)}
                className="w-full p-3 rounded-2xl bg-dark-input/40 hover:bg-dark-hover border border-dark-border/60 hover:border-primary-500/50 flex items-center justify-between gap-3 transition-all text-left group cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-white text-xs truncate">
                      {msg.sender?.displayName || msg.sender?.username || 'User'}
                    </span>
                    <span className="text-[10px] text-surface-500 font-mono">
                      {msg.createdAt ? format(new Date(msg.createdAt), 'MMM d, h:mm a') : ''}
                    </span>
                    {msg.type !== 'text' && (
                      <span className="px-1.5 py-0.2 rounded bg-primary-500/20 text-primary-300 text-[10px] uppercase font-bold">
                        {msg.type}
                      </span>
                    )}
                  </div>
                  <p className="text-surface-300 text-xs truncate line-clamp-1">
                    {msg.content || (msg.attachments?.[0]?.fileName ? `📎 ${msg.attachments[0].fileName}` : `[${msg.type}]`)}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-surface-500 group-hover:text-primary-400 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
