import { useState } from 'react';
import { Smile, Sparkles, X, Search } from 'lucide-react';
import EmojiPickerPopover from './EmojiPickerPopover';
import GifPickerPopover from './GifPickerPopover';
import StickerPickerPopover from './StickerPickerPopover';

export default function UnifiedPickerModal({ onSelectEmoji, onSelectGif, onSelectSticker, onClose }) {
  const [activeTab, setActiveTab] = useState('emoji'); // 'emoji' | 'gif' | 'sticker'

  return (
    <div className="w-80 sm:w-96 bg-dark-card border border-dark-border rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-scale-in z-50 select-none">
      {/* Top Tab Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-dark-border bg-dark-input/60">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('emoji')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'emoji'
                ? 'gradient-primary text-white shadow-sm'
                : 'text-surface-400 hover:text-white hover:bg-dark-hover'
            }`}
          >
            <Smile className="w-3.5 h-3.5" /> Emojis
          </button>
          <button
            onClick={() => setActiveTab('gif')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'gif'
                ? 'gradient-primary text-white shadow-sm'
                : 'text-surface-400 hover:text-white hover:bg-dark-hover'
            }`}
          >
            <span className="font-mono text-[10px]">GIF</span> GIFs
          </button>
          <button
            onClick={() => setActiveTab('sticker')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'sticker'
                ? 'gradient-primary text-white shadow-sm'
                : 'text-surface-400 hover:text-white hover:bg-dark-hover'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" /> Stickers
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-7 h-7 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white flex items-center justify-center transition-all border border-dark-border"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tab Content */}
      <div className="p-0">
        {activeTab === 'emoji' && (
          <EmojiPickerPopover onSelectEmoji={onSelectEmoji} onClose={onClose} />
        )}
        {activeTab === 'gif' && (
          <GifPickerPopover onSelectGif={onSelectGif} onClose={onClose} />
        )}
        {activeTab === 'sticker' && (
          <StickerPickerPopover onSelectSticker={onSelectSticker} onClose={onClose} />
        )}
      </div>
    </div>
  );
}
