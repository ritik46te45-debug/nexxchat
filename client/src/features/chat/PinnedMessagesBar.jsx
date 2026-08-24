import { useState } from 'react';
import { Pin, X, ChevronRight, ChevronLeft } from 'lucide-react';

export default function PinnedMessagesBar({ pinnedMessages = [], onJumpToMessage, onUnpinMessage }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!pinnedMessages || pinnedMessages.length === 0) return null;

  const currentPin = pinnedMessages[currentIndex] || pinnedMessages[0];
  const messageObj = typeof currentPin?.message === 'object' ? currentPin.message : currentPin;
  if (!messageObj) return null;

  const senderName = messageObj.sender?.displayName || messageObj.sender?.username || 'Message';
  const previewText = messageObj.content || (messageObj.type ? `[${messageObj.type}]` : 'Pinned attachment');

  const handleNext = (e) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % pinnedMessages.length);
  };

  const handlePrev = (e) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + pinnedMessages.length) % pinnedMessages.length);
  };

  return (
    <div
      onClick={() => onJumpToMessage && onJumpToMessage(messageObj._id)}
      className="flex items-center justify-between px-3 sm:px-4 py-2 bg-dark-card/90 backdrop-blur-md border-b border-dark-border/80 cursor-pointer hover:bg-dark-hover transition-all z-10 select-none animate-slide-down"
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div className="w-7 h-7 rounded-lg bg-primary-500/20 text-primary-400 flex items-center justify-center flex-shrink-0">
          <Pin className="w-3.5 h-3.5 rotate-45" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-primary-400 truncate">
              {pinnedMessages.length > 1 ? `Pinned Message (${currentIndex + 1}/${pinnedMessages.length})` : 'Pinned Message'}
            </span>
            <span className="text-[11px] text-surface-400">• {senderName}</span>
          </div>
          <p className="text-xs text-surface-300 truncate">{previewText}</p>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
        {pinnedMessages.length > 1 && (
          <div className="flex items-center gap-0.5 mr-1">
            <button
              onClick={handlePrev}
              className="p-1 rounded-md text-surface-400 hover:text-white hover:bg-dark-input transition-all"
              title="Previous pin"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleNext}
              className="p-1 rounded-md text-surface-400 hover:text-white hover:bg-dark-input transition-all"
              title="Next pin"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {onUnpinMessage && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUnpinMessage(messageObj._id);
            }}
            className="p-1 rounded-md text-surface-500 hover:text-accent-red hover:bg-accent-red/10 transition-all"
            title="Unpin message"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
