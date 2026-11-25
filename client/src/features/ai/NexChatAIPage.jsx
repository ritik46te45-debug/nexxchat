import { useState, useEffect, useRef } from 'react';
import {
  Bot, Plus, Trash2, Send, Loader2, Sparkles, Image as ImageIcon,
  MessageSquareText, Copy, Check, RotateCcw, Download, Menu, X,
  Code2, Lightbulb, Wand2, AlertCircle
} from 'lucide-react';
import api from '../../lib/api';
import useChatStore from '../../stores/chatStore';
import useAuthStore from '../../stores/authStore';
import useUIStore from '../../stores/uiStore';
import toast from 'react-hot-toast';
import MarkdownRenderer from './MarkdownRenderer';

const STARTER_PROMPTS = [
  {
    icon: Lightbulb,
    mode: 'chat',
    title: 'Explain or Brainstorm',
    prompt: 'Give me 5 creative startup ideas combining AI and real-time messaging.',
  },
  {
    icon: Code2,
    mode: 'chat',
    title: 'Write & Debug Code',
    prompt: 'Write a clean React custom hook for debounced search with TypeScript.',
  },
  {
    icon: ImageIcon,
    mode: 'image',
    title: 'Generate an Image',
    prompt: 'A futuristic neon cyberpunk city skyline reflected in rain puddles, ultra detailed',
  },
  {
    icon: MessageSquareText,
    mode: 'summarize',
    title: 'Summarize User Chats',
    prompt: '',
  },
];

export default function NexChatAIPage() {
  const user = useAuthStore((s) => s.user);
  const conversations = useChatStore((s) => s.conversations);
  const fetchConversations = useChatStore((s) => s.fetchConversations);
  const isMobile = useUIStore((s) => s.isMobile);

  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [activeTitle, setActiveTitle] = useState('New AI Chat');
  const [activeModel, setActiveModel] = useState('gemini-3.5-flash');

  const [mode, setMode] = useState('chat'); // 'chat' | 'image' | 'summarize'
  const [input, setInput] = useState('');
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [showDrawer, setShowDrawer] = useState(false);
  const [copiedMsgIdx, setCopiedMsgIdx] = useState(null);
  const [selectedConvId, setSelectedConvId] = useState('');
  const [summaryFocus, setSummaryFocus] = useState('full');
  const [imageQuotaNotice, setImageQuotaNotice] = useState('');

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const myId = (user?._id || user)?.toString();

  const nonSecretConversations = (conversations || []).filter((c) => !c.isSecret);

  const getConversationDisplayName = (conv) => {
    if (!conv) return 'Chat';
    if (conv.type === 'group') return conv.groupName || 'Group Chat';
    const other = conv.participants?.find((p) => (p.user?._id || p.user)?.toString() !== myId);
    return other?.user?.displayName || other?.user?.username || 'Direct Chat';
  };

  const loadThreads = async () => {
    setIsLoadingThreads(true);
    try {
      const { data } = await api.get('/ai/threads');
      setThreads(data.threads || []);
    } catch (err) {
      console.warn('[AI] Failed to load threads:', err.message);
    } finally {
      setIsLoadingThreads(false);
    }
  };

  useEffect(() => {
    loadThreads();
    if (!conversations || conversations.length === 0) {
      fetchConversations?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, isGenerating]);

  const handleSelectThread = async (threadId) => {
    setActiveThreadId(threadId);
    setShowDrawer(false);
    setIsLoadingMessages(true);
    setStreamingText('');
    setImageQuotaNotice('');
    try {
      const { data } = await api.get(`/ai/threads/${threadId}`);
      setMessages(data.thread?.messages || []);
      setActiveTitle(data.thread?.title || 'AI Chat');
      if (data.thread?.model) setActiveModel(data.thread.model);
    } catch {
      toast.error('Failed to load AI conversation');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const handleNewChat = () => {
    setActiveThreadId(null);
    setMessages([]);
    setActiveTitle('New AI Chat');
    setStreamingText('');
    setImageQuotaNotice('');
    setMode('chat');
    setShowDrawer(false);
    textareaRef.current?.focus();
  };

  const handleDeleteThread = async (e, threadId) => {
    e.stopPropagation();
    try {
      await api.delete(`/ai/threads/${threadId}`);
      setThreads((prev) => prev.filter((t) => t._id !== threadId));
      if (activeThreadId === threadId) {
        handleNewChat();
      }
      toast.success('Deleted AI chat');
    } catch {
      toast.error('Failed to delete chat');
    }
  };

  const handleCopyMessage = (text, idx) => {
    navigator.clipboard.writeText(text || '');
    setCopiedMsgIdx(idx);
    toast.success('Copied response');
    setTimeout(() => setCopiedMsgIdx(null), 1800);
  };

  const handleDownloadImage = (imageUrl, prompt) => {
    const link = document.createElement('a');
    link.href = imageUrl;
    const safeSlug = (prompt || 'nexchat-ai-image').replace(/[^a-z0-9]+/gi, '_').slice(0, 32);
    link.download = `${safeSlug}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /**
   * Stream chat response via SSE with automatic fallback to standard POST /ai/chat.
   */
  const sendChatPrompt = async (promptText, regenerate = false) => {
    setIsGenerating(true);
    setStreamingText('');
    setImageQuotaNotice('');

    if (!regenerate) {
      setMessages((prev) => [...prev, { role: 'user', content: promptText }]);
    } else {
      setMessages((prev) => {
        const copy = [...prev];
        if (copy[copy.length - 1]?.role === 'assistant') copy.pop();
        return copy;
      });
    }

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${api.defaults.baseURL}/ai/chat/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          threadId: activeThreadId,
          message: promptText,
          regenerate,
        }),
      });

      if (!res.ok || !res.body) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let assembled = '';
      let resolvedThreadId = activeThreadId;
      let resolvedTitle = activeTitle;
      let resolvedModel = activeModel;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const events = sseBuffer.split('\n\n');
        sseBuffer = events.pop() || '';

        for (const ev of events) {
          const line = ev.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          try {
            const payload = JSON.parse(line.slice(5).trim());
            if (payload.error) throw new Error(payload.error);
            if (payload.meta) {
              resolvedThreadId = payload.meta.threadId || resolvedThreadId;
              resolvedTitle = payload.meta.title || resolvedTitle;
              resolvedModel = payload.meta.model || resolvedModel;
            }
            if (payload.delta) {
              assembled += payload.delta;
              setStreamingText(assembled);
            }
            if (payload.done) {
              resolvedThreadId = payload.threadId || resolvedThreadId;
              resolvedTitle = payload.title || resolvedTitle;
              resolvedModel = payload.model || resolvedModel;
            }
          } catch (parseErr) {
            if (parseErr.message && !parseErr.message.includes('JSON')) {
              throw parseErr;
            }
          }
        }
      }

      setStreamingText('');
      setActiveThreadId(resolvedThreadId);
      setActiveTitle(resolvedTitle);
      setActiveModel(resolvedModel);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: assembled || 'No response received.', modelUsed: resolvedModel },
      ]);
      loadThreads();
    } catch (streamErr) {
      // Fallback to non-streaming POST /ai/chat if streaming fails mid-flight before output
      if (!regenerate && promptText) {
        try {
          const { data } = await api.post('/ai/chat', {
            threadId: activeThreadId,
            message: promptText,
          });
          setStreamingText('');
          setActiveThreadId(data.threadId);
          setActiveTitle(data.title);
          setActiveModel(data.model);
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: data.reply, modelUsed: data.model },
          ]);
          loadThreads();
          return;
        } catch (fallbackErr) {
          toast.error(fallbackErr.response?.data?.error || streamErr.message || 'AI chat failed');
        }
      } else {
        toast.error(streamErr.message || 'AI request failed');
      }
      setStreamingText('');
    } finally {
      setIsGenerating(false);
    }
  };

  const sendImagePrompt = async (promptText) => {
    setIsGenerating(true);
    setImageQuotaNotice('');
    setMessages((prev) => [...prev, { role: 'user', content: `Generate image: ${promptText}` }]);

    try {
      const { data } = await api.post('/ai/generate-image', {
        prompt: promptText,
        threadId: activeThreadId,
      });
      setActiveThreadId(data.threadId);
      setActiveTitle(data.title);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.caption,
          imageUrl: data.imageUrl,
          isImage: true,
          promptUsed: promptText,
          modelUsed: data.model,
        },
      ]);
      loadThreads();
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.code === 'IMAGE_QUOTA_EXCEEDED' || err.response?.status === 429) {
        setImageQuotaNotice(errData?.error || 'Gemini Image Generation requires paid/billing quota on Google AI Studio.');
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              '⚠️ **Image Generation Quota Limit Reached**: Your current Google AI Studio Free Tier key has image-generation quota set to `0`. Enable billing on your Gemini API key in Google AI Studio to unlock image generation — Chat & Chat Summarization continue to work normally.',
          },
        ]);
      } else {
        toast.error(errData?.error || 'Image generation failed');
        setMessages((prev) => prev.slice(0, -1));
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSummarizeSelectedChat = async (convIdOverride) => {
    const targetId = convIdOverride || selectedConvId;
    if (!targetId) {
      toast.error('Please pick a conversation to summarize');
      return;
    }

    const conv = nonSecretConversations.find((c) => c._id === targetId);
    const convName = getConversationDisplayName(conv);
    setIsGenerating(true);
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: `Summarize recent messages from **${convName}**` },
    ]);

    try {
      const { data } = await api.post(`/ai/summarize/${targetId}`, {
        limit: 60,
        focus: summaryFocus,
        saveToThread: !activeThreadId,
      });
      if (data.threadId && !activeThreadId) {
        setActiveThreadId(data.threadId);
        setActiveTitle(`Summary: ${data.conversationName}`);
        loadThreads();
      }
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.summary,
          modelUsed: data.model,
        },
      ]);
      setMode('chat');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to summarize chat');
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (isGenerating) return;

    if (mode === 'summarize') {
      handleSummarizeSelectedChat();
      return;
    }

    const trimmed = input.trim();
    if (!trimmed) return;

    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    if (mode === 'image' || trimmed.toLowerCase().startsWith('/imagine ')) {
      const prompt = trimmed.replace(/^\/imagine\s+/i, '');
      sendImagePrompt(prompt);
    } else {
      sendChatPrompt(trimmed, false);
    }
  };

  const handleStarterClick = (item) => {
    setMode(item.mode);
    if (item.mode === 'summarize') {
      if (nonSecretConversations.length > 0) {
        setSelectedConvId(nonSecretConversations[0]._id);
      }
      return;
    }
    if (item.mode === 'image') {
      sendImagePrompt(item.prompt);
    } else {
      sendChatPrompt(item.prompt, false);
    }
  };

  const ThreadSidebarContent = (
    <div className="flex flex-col h-full bg-dark-card border-r border-dark-border">
      <div className="p-3.5 border-b border-dark-border flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleNewChat}
          className="flex-1 py-2.5 px-3 rounded-2xl gradient-primary text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20 hover:opacity-95 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New AI Chat</span>
        </button>
        {isMobile && (
          <button
            type="button"
            onClick={() => setShowDrawer(false)}
            className="p-2 rounded-xl hover:bg-dark-hover text-surface-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
        <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-surface-500">
          History
        </p>
        {isLoadingThreads ? (
          <div className="flex items-center justify-center py-8 text-surface-500">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : threads.length === 0 ? (
          <p className="px-3 py-4 text-xs text-surface-500 text-center">
            No saved AI chats yet. Start a conversation!
          </p>
        ) : (
          threads.map((t) => {
            const isSelected = activeThreadId === t._id;
            return (
              <div
                key={t._id}
                onClick={() => handleSelectThread(t._id)}
                className={`group flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-primary-500/15 text-white border border-primary-500/30 font-semibold'
                    : 'text-surface-300 hover:bg-dark-hover hover:text-white border border-transparent'
                }`}
              >
                <span className="truncate flex-1">{t.title || 'AI Chat'}</span>
                <button
                  type="button"
                  onClick={(e) => handleDeleteThread(e, t._id)}
                  className="opacity-70 sm:opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-500/20 text-surface-400 hover:text-red-400 transition-all cursor-pointer"
                  title="Delete chat"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className={`flex-1 flex h-full min-h-0 bg-dark-bg overflow-hidden relative ${isMobile ? 'pb-[56px]' : ''}`}>
      {/* Desktop Thread Sidebar */}
      {!isMobile && <div className="w-64 lg:w-72 flex-shrink-0 h-full">{ThreadSidebarContent}</div>}

      {/* Mobile Drawer */}
      {isMobile && showDrawer && (
        <div className="fixed inset-0 z-50 flex">
          <div className="w-72 max-w-[82vw] h-full shadow-2xl animate-slide-right">
            {ThreadSidebarContent}
          </div>
          <div className="flex-1 bg-black/60 backdrop-blur-xs" onClick={() => setShowDrawer(false)} />
        </div>
      )}

      {/* Main Chat Workspace */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Top Bar */}
        <div className="px-4 py-3 border-b border-dark-border bg-dark-card/60 backdrop-blur-xl flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {isMobile && (
              <button
                type="button"
                onClick={() => setShowDrawer(true)}
                className="p-2 rounded-xl hover:bg-dark-hover text-surface-300 cursor-pointer"
                title="AI Chat History"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            <div className="w-9 h-9 rounded-2xl gradient-primary flex items-center justify-center text-white shadow-md shadow-primary-500/20 flex-shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white truncate">{activeTitle}</h2>
              <p className="text-[11px] text-surface-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-green" />
                <span>NexChat AI • {activeModel}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleNewChat}
            className="px-3 py-1.5 rounded-xl bg-dark-input hover:bg-dark-hover border border-dark-border text-xs font-semibold text-surface-200 flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Chat</span>
          </button>
        </div>

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
          <div className="max-w-3xl mx-auto space-y-5">
            {isLoadingMessages ? (
              <div className="flex items-center justify-center py-20 text-surface-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-primary-400" />
                <span className="text-sm">Loading conversation...</span>
              </div>
            ) : messages.length === 0 && !streamingText ? (
              /* Welcome Screen */
              <div className="py-6 sm:py-12 space-y-8 animate-fade-in">
                <div className="text-center space-y-2.5">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-3xl gradient-primary text-white shadow-xl shadow-primary-500/25 mb-1">
                    <Sparkles className="w-7 h-7" />
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                    How can NexChat AI help you?
                  </h1>
                  <p className="text-xs sm:text-sm text-surface-400 max-w-md mx-auto">
                    Ask anything, write code, generate images, or summarize your NexChat group and direct conversations.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {STARTER_PROMPTS.map((item, idx) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleStarterClick(item)}
                        className="text-left p-4 rounded-2xl bg-dark-card hover:bg-dark-hover border border-dark-border hover:border-primary-500/40 transition-all group cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 mb-1.5">
                          <Icon className="w-4 h-4 text-primary-400 group-hover:scale-110 transition-transform" />
                          <span className="text-xs font-bold text-white">{item.title}</span>
                        </div>
                        <p className="text-xs text-surface-400 line-clamp-2">
                          {item.prompt || 'Pick any friend or group chat to get instant bullet-point highlights.'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Message History */
              <>
                {messages.map((msg, idx) => {
                  const isUser = msg.role === 'user';
                  const isLastAssistant = !isUser && idx === messages.length - 1;
                  return (
                    <div
                      key={msg._id || idx}
                      className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      {!isUser && (
                        <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center text-white flex-shrink-0 mt-0.5 shadow-md">
                          <Sparkles className="w-4 h-4" />
                        </div>
                      )}

                      <div
                        className={`max-w-[88%] sm:max-w-[82%] rounded-2xl px-4 py-3 ${
                          isUser
                            ? 'bg-primary-600 text-white rounded-br-md shadow-md'
                            : 'bg-dark-card border border-dark-border text-surface-100 rounded-tl-md'
                        }`}
                      >
                        {msg.isImage && msg.imageUrl ? (
                          <div className="space-y-2.5">
                            <img
                              src={msg.imageUrl}
                              alt={msg.promptUsed || 'AI generated'}
                              className="rounded-xl max-h-96 w-auto object-contain border border-dark-border bg-black/30"
                            />
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs text-surface-400 truncate">{msg.content}</span>
                              <button
                                type="button"
                                onClick={() => handleDownloadImage(msg.imageUrl, msg.promptUsed)}
                                className="px-2.5 py-1 rounded-lg bg-dark-input hover:bg-dark-hover text-xs font-semibold text-white flex items-center gap-1 flex-shrink-0 cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Save</span>
                              </button>
                            </div>
                          </div>
                        ) : isUser ? (
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                        ) : (
                          <MarkdownRenderer content={msg.content} />
                        )}

                        {!isUser && !msg.isImage && (
                          <div className="flex items-center gap-3 mt-2.5 pt-2 border-t border-dark-border/50 text-[11px] text-surface-500">
                            <button
                              type="button"
                              onClick={() => handleCopyMessage(msg.content, idx)}
                              className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
                            >
                              {copiedMsgIdx === idx ? (
                                <Check className="w-3.5 h-3.5 text-accent-green" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                              <span>{copiedMsgIdx === idx ? 'Copied' : 'Copy'}</span>
                            </button>
                            {isLastAssistant && !isGenerating && (
                              <button
                                type="button"
                                onClick={() => sendChatPrompt('', true)}
                                className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Regenerate</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Live Streaming Bubble */}
                {(streamingText || isGenerating) && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center text-white flex-shrink-0 mt-0.5 animate-pulse">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="max-w-[88%] sm:max-w-[82%] rounded-2xl rounded-tl-md px-4 py-3 bg-dark-card border border-dark-border text-surface-100">
                      {streamingText ? (
                        <div>
                          <MarkdownRenderer content={streamingText} />
                          <span className="inline-block w-2 h-4 ml-1 bg-primary-400 animate-pulse align-middle" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-surface-400 py-1">
                          <Loader2 className="w-4 h-4 animate-spin text-primary-400" />
                          <span>{mode === 'image' ? 'Generating image...' : 'Thinking...'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Bottom Prompt Bar */}
        <div className="px-4 sm:px-6 pb-4 pt-2 border-t border-dark-border/60 bg-dark-bg/95 flex-shrink-0">
          <div className="max-w-3xl mx-auto space-y-2.5">
            {imageQuotaNotice && (
              <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{imageQuotaNotice}</span>
              </div>
            )}

            {/* Mode Switcher Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setMode('chat')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  mode === 'chat'
                    ? 'bg-primary-500/20 text-primary-300 border border-primary-500/40'
                    : 'bg-dark-card text-surface-400 border border-dark-border hover:text-white'
                }`}
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Chat</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('image')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  mode === 'image'
                    ? 'bg-accent-purple/20 text-purple-300 border border-accent-purple/40'
                    : 'bg-dark-card text-surface-400 border border-dark-border hover:text-white'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Generate Image</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('summarize');
                  if (!selectedConvId && nonSecretConversations.length > 0) {
                    setSelectedConvId(nonSecretConversations[0]._id);
                  }
                }}
                className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  mode === 'summarize'
                    ? 'bg-accent-green/20 text-emerald-300 border border-accent-green/40'
                    : 'bg-dark-card text-surface-400 border border-dark-border hover:text-white'
                }`}
              >
                <MessageSquareText className="w-3.5 h-3.5" />
                <span>Summarize Chat</span>
              </button>
            </div>

            {mode === 'summarize' ? (
              <div className="p-3 rounded-2xl bg-dark-card border border-dark-border flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <select
                  value={selectedConvId}
                  onChange={(e) => setSelectedConvId(e.target.value)}
                  className="flex-1 bg-dark-input border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-primary-500"
                >
                  <option value="">Select a NexChat conversation...</option>
                  {nonSecretConversations.map((c) => (
                    <option key={c._id} value={c._id}>
                      {getConversationDisplayName(c)} ({c.type})
                    </option>
                  ))}
                </select>
                <select
                  value={summaryFocus}
                  onChange={(e) => setSummaryFocus(e.target.value)}
                  className="bg-dark-input border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-primary-500"
                >
                  <option value="full">Full Summary</option>
                  <option value="action_items">Action Items</option>
                  <option value="decisions">Key Decisions</option>
                  <option value="brief">Ultra-Brief</option>
                </select>
                <button
                  type="button"
                  onClick={() => handleSummarizeSelectedChat()}
                  disabled={isGenerating || !selectedConvId}
                  className="px-4 py-2 rounded-xl gradient-primary text-xs font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>Summarize</span>
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="flex items-end gap-2 p-2 rounded-2xl bg-dark-card border border-dark-border focus-within:border-primary-500/60 transition-colors shadow-lg"
              >
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder={
                    mode === 'image'
                      ? 'Describe the image you want to generate...'
                      : 'Message NexChat AI... (or type /imagine <prompt>)'
                  }
                  className="flex-1 bg-transparent px-2.5 py-2 text-sm text-white placeholder-surface-500 resize-none focus:outline-none max-h-40"
                />
                <button
                  type="submit"
                  disabled={isGenerating || !input.trim()}
                  className="w-10 h-10 rounded-xl gradient-primary text-white flex items-center justify-center disabled:opacity-40 hover:opacity-95 transition-all flex-shrink-0 cursor-pointer"
                  title="Send"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
