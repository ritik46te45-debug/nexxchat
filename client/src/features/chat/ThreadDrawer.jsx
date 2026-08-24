import { useState, useEffect, useRef } from 'react';
import { X, Send, MessageSquare, Loader2, CornerDownRight } from 'lucide-react';
import api from '../../lib/api';
import useAuthStore from '../../stores/authStore';
import { getSocket } from '../../lib/socket';
import toast from 'react-hot-toast';

export default function ThreadDrawer({ parentMessage, conversationId, onClose, onReplyAdded }) {
  const { user } = useAuthStore();
  const [replies, setReplies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchThreadReplies();
  }, [parentMessage?._id]);

  // Socket listener for incoming replies in this thread
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !parentMessage?._id) return;

    const onNewMessage = ({ message }) => {
      if (message.replyTo?._id === parentMessage._id || message.replyTo === parentMessage._id) {
        setReplies((prev) => {
          if (prev.some((m) => m._id === message._id)) return prev;
          return [...prev, message];
        });
      }
    };

    socket.on('message:new', onNewMessage);
    return () => socket.off('message:new', onNewMessage);
  }, [parentMessage?._id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [replies]);

  const fetchThreadReplies = async () => {
    if (!parentMessage?._id || !conversationId) return;
    setIsLoading(true);
    try {
      // Fetch messages with replyTo = parentMessage._id
      const { data } = await api.get(`/messages/${conversationId}?limit=100`);
      const threadReplies = (data.messages || []).filter(
        (m) => (m.replyTo?._id || m.replyTo)?.toString() === parentMessage._id.toString()
      );
      setReplies(threadReplies);
    } catch (err) {
      console.error('Failed to load thread replies:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendReply = async () => {
    if (!text.trim() || isSending) return;
    setIsSending(true);

    try {
      const { data } = await api.post(`/messages/${conversationId}`, {
        content: text.trim(),
        replyTo: parentMessage._id,
        type: 'text',
      });

      if (data.message) {
        setReplies((prev) => [...prev, data.message]);
        if (onReplyAdded) onReplyAdded(parentMessage._id);
      }
      setText('');
    } catch (err) {
      toast.error('Failed to send reply');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  };

  if (!parentMessage) return null;

  return (
    <div className="w-full sm:w-80 md:w-96 border-l border-dark-border bg-dark-bg flex flex-col h-full z-20 animate-slide-left shadow-2xl flex-shrink-0">
      {/* Header */}
      <div className="h-16 px-4 border-b border-dark-border flex items-center justify-between bg-dark-card/60 flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary-400" />
          <h3 className="font-bold text-sm text-white">Thread</h3>
          <span className="text-[11px] text-surface-500 font-mono">({replies.length})</span>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white flex items-center justify-center transition-all border border-dark-border"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Parent Message Card */}
      <div className="p-3.5 border-b border-dark-border/80 bg-dark-card/30 flex-shrink-0">
        <div className="flex items-center gap-2.5 mb-1.5">
          {parentMessage.sender?.avatar?.url ? (
            <img src={parentMessage.sender.avatar.url} alt="" className="w-7 h-7 rounded-full object-cover" />
          ) : (
            <div className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center font-bold text-white text-xs">
              {parentMessage.sender?.displayName?.charAt(0) || '?'}
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-white">{parentMessage.sender?.displayName}</p>
            <p className="text-[10px] text-surface-500">
              {new Date(parentMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
        <p className="text-xs text-surface-200 leading-relaxed pl-9 whitespace-pre-wrap">
          {parentMessage.content || `[${parentMessage.type}]`}
        </p>
      </div>

      {/* Thread Replies List */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
          </div>
        ) : replies.length === 0 ? (
          <div className="text-center py-10 text-surface-500">
            <CornerDownRight className="w-8 h-8 mx-auto mb-2 opacity-40 text-primary-400" />
            <p className="text-xs font-medium">No replies yet</p>
            <p className="text-[11px] text-surface-600 mt-0.5">Start the conversation below</p>
          </div>
        ) : (
          replies.map((reply) => {
            const isOwn = (reply.sender?._id || reply.sender)?.toString() === (user?._id || user)?.toString();
            return (
              <div key={reply._id} className="flex items-start gap-2.5 group">
                <div className="w-6 h-6 rounded-full gradient-primary flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5">
                  {reply.sender?.displayName?.charAt(0) || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-white">{reply.sender?.displayName || 'User'}</span>
                    <span className="text-[10px] text-surface-500">
                      {new Date(reply.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-surface-200 mt-0.5 leading-relaxed break-words bg-dark-card/50 p-2 rounded-xl border border-dark-border/40">
                    {reply.content}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply Input */}
      <div className="p-3 border-t border-dark-border bg-dark-card/60 flex items-center gap-2 flex-shrink-0">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Reply in thread..."
          className="flex-1 bg-dark-input text-white text-xs px-3 py-2.5 rounded-xl border border-dark-border focus:border-primary-500 focus:outline-none placeholder:text-surface-500"
        />
        <button
          onClick={handleSendReply}
          disabled={!text.trim() || isSending}
          className="w-9 h-9 rounded-xl gradient-primary text-white flex items-center justify-center flex-shrink-0 hover:opacity-90 active:scale-95 disabled:opacity-40 transition-all shadow-md shadow-primary-500/20"
        >
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
