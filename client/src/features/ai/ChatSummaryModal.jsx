import { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, Copy, Check, RefreshCw, MessageSquareText } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import MarkdownRenderer from './MarkdownRenderer';
import useUIStore from '../../stores/uiStore';

const FOCUS_OPTIONS = [
  { id: 'full', label: 'Full Summary' },
  { id: 'action_items', label: 'Action Items' },
  { id: 'decisions', label: 'Key Decisions' },
  { id: 'brief', label: 'Ultra-Brief' },
];

const LIMIT_OPTIONS = [30, 60, 100];

export default function ChatSummaryModal({ isOpen, onClose, conversationId, conversationName }) {
  const setSidebarView = useUIStore((s) => s.setSidebarView);
  const setShowChatOnMobile = useUIStore((s) => s.setShowChatOnMobile);

  const [limit, setLimit] = useState(60);
  const [focus, setFocus] = useState('full');
  const [isLoading, setIsLoading] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);

  const runSummary = async (saveToThread = false) => {
    if (!conversationId) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const { data } = await api.post(`/ai/summarize/${conversationId}`, {
        limit,
        focus,
        saveToThread,
      });
      setSummaryData(data);
      if (saveToThread && data.threadId) {
        toast.success('Saved summary to NexChat AI');
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to generate chat summary';
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && conversationId) {
      setSummaryData(null);
      runSummary(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, conversationId]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!summaryData?.summary) return;
    navigator.clipboard.writeText(summaryData.summary);
    setCopied(true);
    toast.success('Summary copied');
    setTimeout(() => setCopied(false), 1800);
  };

  const handleOpenInAI = async () => {
    if (summaryData?.threadId) {
      onClose();
      setShowChatOnMobile(false);
      setSidebarView('ai');
      return;
    }
    await runSummary(true);
    onClose();
    setShowChatOnMobile(false);
    setSidebarView('ai');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl max-h-[85vh] flex flex-col bg-dark-card border border-dark-border rounded-3xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border bg-gradient-to-r from-primary-600/15 via-accent-purple/10 to-transparent">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl gradient-primary flex items-center justify-center text-white shadow-lg shadow-primary-500/25 flex-shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white truncate">
                AI Chat Summary
              </h3>
              <p className="text-xs text-surface-400 truncate">
                {conversationName || 'Conversation'} {summaryData ? `• ${summaryData.messageCount} messages` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-surface-400 hover:text-white hover:bg-dark-hover transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls */}
        <div className="px-5 py-3 border-b border-dark-border/60 bg-dark-bg/40 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {FOCUS_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFocus(opt.id)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold transition-all cursor-pointer ${
                  focus === opt.id
                    ? 'bg-primary-500/20 text-primary-300 border border-primary-500/40'
                    : 'bg-dark-card text-surface-400 border border-dark-border hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {LIMIT_OPTIONS.map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setLimit(num)}
                className={`px-2 py-1 rounded-lg text-[11px] font-mono transition-all cursor-pointer ${
                  limit === num
                    ? 'bg-accent-purple/20 text-purple-300 border border-accent-purple/40'
                    : 'bg-dark-card text-surface-400 border border-dark-border hover:text-white'
                }`}
              >
                {num}m
              </button>
            ))}
            <button
              type="button"
              onClick={() => runSummary(false)}
              disabled={isLoading}
              className="ml-1 px-2.5 py-1 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
              title="Regenerate Summary"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Loader2 className="w-8 h-8 text-primary-400 animate-spin mb-3" />
              <p className="text-sm font-semibold text-white">Analyzing conversation...</p>
              <p className="text-xs text-surface-400 mt-1">Extracting key topics, decisions, and action items</p>
            </div>
          ) : errorMsg ? (
            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-center space-y-2">
              <p className="text-sm font-semibold text-red-300">{errorMsg}</p>
              <button
                type="button"
                onClick={() => runSummary(false)}
                className="px-4 py-1.5 rounded-xl bg-dark-hover text-xs font-semibold text-white hover:bg-dark-border cursor-pointer"
              >
                Try Again
              </button>
            </div>
          ) : summaryData?.summary ? (
            <MarkdownRenderer content={summaryData.summary} />
          ) : null}
        </div>

        {/* Footer */}
        {summaryData?.summary && !isLoading && (
          <div className="px-5 py-3 border-t border-dark-border bg-dark-card/80 flex items-center justify-between gap-2">
            <span className="text-[11px] text-surface-500 font-mono">
              Model: {summaryData.model}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-xl bg-dark-input hover:bg-dark-hover border border-dark-border text-xs font-semibold text-surface-200 flex items-center gap-1.5 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                type="button"
                onClick={handleOpenInAI}
                className="px-3.5 py-1.5 rounded-xl gradient-primary text-xs font-semibold text-white flex items-center gap-1.5 shadow-lg shadow-primary-500/20 cursor-pointer"
              >
                <MessageSquareText className="w-3.5 h-3.5" />
                <span>Continue in NexChat AI</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
