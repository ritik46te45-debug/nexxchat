import { useState, useEffect } from 'react';
import {
  Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed,
  Trash2, Search, Filter, Loader2, Calendar, Clock, AlertCircle
} from 'lucide-react';
import api from '../../lib/api';
import useAuthStore from '../../stores/authStore';
import toast from 'react-hot-toast';

export default function CallsTab({ onStartCall }) {
  const { user } = useAuthStore();
  const [calls, setCalls] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'missed', 'voice', 'video'
  const [searchQuery, setSearchQuery] = useState('');
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    fetchCallHistory();
  }, []);

  const fetchCallHistory = async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get('/calls/history?limit=50');
      setCalls(data.calls || []);
    } catch (err) {
      console.error('Failed to load calls:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Are you sure you want to clear all call history?')) return;
    setIsClearing(true);
    try {
      await api.delete('/calls/history');
      setCalls([]);
      toast.success('Call history cleared');
    } catch (err) {
      toast.error('Failed to clear call history');
    } finally {
      setIsClearing(false);
    }
  };

  const formatDuration = (secs) => {
    if (!secs || secs <= 0) return '0s';
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const remSecs = secs % 60;

    if (hrs > 0) {
      return `${hrs}h ${mins}m ${remSecs}s`;
    }
    if (mins > 0) {
      return `${mins}m ${remSecs}s`;
    }
    return `${remSecs}s`;
  };

  const formatCallTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) {
      return `Today, ${timeStr}`;
    }
    const isYesterday = new Date(now.setDate(now.getDate() - 1)).toDateString() === date.toDateString();
    if (isYesterday) {
      return `Yesterday, ${timeStr}`;
    }
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
  };

  const myId = (user?._id || user)?.toString();

  const filteredCalls = calls.filter((call) => {
    const isCaller = (call.caller?._id || call.caller)?.toString() === myId;
    const otherUser = isCaller ? call.receiver : call.caller;
    const displayName = otherUser?.displayName || otherUser?.username || 'User';

    // Search query filter
    if (searchQuery.trim()) {
      const match = displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    otherUser?.username?.toLowerCase().includes(searchQuery.toLowerCase());
      if (!match) return false;
    }

    // Type / Status filter
    if (filter === 'missed') {
      return call.status === 'missed' || call.status === 'rejected';
    }
    if (filter === 'voice') {
      return call.type === 'voice';
    }
    if (filter === 'video') {
      return call.type === 'video';
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-dark-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-dark-border">
        <h1 className="text-xl font-bold text-white">Call Logs</h1>
        {calls.length > 0 && (
          <button
            onClick={handleClearHistory}
            disabled={isClearing}
            className="p-2 rounded-xl text-surface-400 hover:text-accent-red hover:bg-accent-red/10 transition-all text-xs font-semibold flex items-center gap-1.5"
            title="Clear Call History"
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </button>
        )}
      </div>

      {/* Search & Filters */}
      <div className="p-3 space-y-2.5 border-b border-dark-border">
        <div className="relative">
          <Search className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search call logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-dark-input text-white text-xs pl-9 pr-3 py-2 rounded-xl border border-dark-border focus:border-primary-500 focus:outline-none placeholder:text-surface-500"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar">
          {[
            { id: 'all', label: 'All' },
            { id: 'missed', label: 'Missed' },
            { id: 'voice', label: 'Voice' },
            { id: 'video', label: 'Video' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex-shrink-0 ${
                filter === id
                  ? 'bg-primary-500 text-white shadow-md shadow-primary-500/20'
                  : 'bg-dark-card text-surface-400 hover:text-white border border-dark-border hover:bg-dark-hover'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Calls List */}
      <div className="flex-1 overflow-y-auto hide-scrollbar p-3 space-y-1.5">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-surface-500">
            <Loader2 className="w-7 h-7 animate-spin text-primary-500 mb-3" />
            <p className="text-xs font-medium">Loading call history...</p>
          </div>
        ) : filteredCalls.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <Phone className="w-12 h-12 text-surface-500 mb-3 opacity-40" />
            <p className="text-sm font-semibold text-surface-300">No call logs found</p>
            <p className="text-xs text-surface-500 mt-1 max-w-xs">
              {searchQuery ? `No calls match "${searchQuery}"` : 'Voice and video calls you make or receive will appear here with full duration & timestamps.'}
            </p>
          </div>
        ) : (
          filteredCalls.map((call) => {
            const isCaller = (call.caller?._id || call.caller)?.toString() === myId;
            const otherUser = isCaller ? call.receiver : call.caller;
            const displayName = otherUser?.displayName || otherUser?.username || 'Unknown Contact';
            const isVideo = call.type === 'video';
            const isMissed = call.status === 'missed' || call.status === 'rejected';

            return (
              <div
                key={call._id}
                className="flex items-center justify-between p-3 rounded-2xl bg-dark-card border border-dark-border hover:bg-dark-hover transition-all group"
              >
                {/* Avatar & User Info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative flex-shrink-0">
                    {otherUser?.avatar?.url ? (
                      <img
                        src={otherUser.avatar.url}
                        alt={displayName}
                        className="w-11 h-11 rounded-full object-cover ring-2 ring-dark-border"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full gradient-primary flex items-center justify-center font-bold text-white text-sm">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold text-white truncate max-w-[160px] sm:max-w-[200px]">
                        {displayName}
                      </p>
                      {otherUser?.userCode && (
                        <span className="text-[10px] font-mono px-1 py-0.2 bg-primary-500/20 text-primary-400 rounded border border-primary-500/30">
                          #{otherUser.userCode}
                        </span>
                      )}
                    </div>

                    {/* Status & Date */}
                    <div className="flex items-center gap-1.5 text-xs text-surface-400 mt-0.5">
                      {isMissed ? (
                        <PhoneMissed className="w-3.5 h-3.5 text-accent-red flex-shrink-0" />
                      ) : isCaller ? (
                        <PhoneOutgoing className="w-3.5 h-3.5 text-accent-green flex-shrink-0" />
                      ) : (
                        <PhoneIncoming className="w-3.5 h-3.5 text-primary-400 flex-shrink-0" />
                      )}

                      <span className={isMissed ? 'text-accent-red font-medium' : 'text-surface-400'}>
                        {isMissed ? 'Missed' : formatDuration(call.duration)}
                      </span>
                      <span>•</span>
                      <span className="text-[11px] text-surface-500">{formatCallTime(call.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Call Back Action Buttons */}
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                  <button
                    onClick={() => onStartCall && onStartCall(otherUser, 'voice')}
                    className="w-8 h-8 rounded-xl bg-dark-input hover:bg-primary-500/20 text-surface-300 hover:text-primary-400 flex items-center justify-center transition-all border border-dark-border"
                    title="Voice Call"
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onStartCall && onStartCall(otherUser, 'video')}
                    className="w-8 h-8 rounded-xl bg-dark-input hover:bg-primary-500/20 text-surface-300 hover:text-primary-400 flex items-center justify-center transition-all border border-dark-border"
                    title="Video Call"
                  >
                    <Video className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
