import { useState, useMemo } from 'react';
import { Search, Smile, Heart, Coffee, Activity, Plane, Lightbulb, Flag, Sparkles } from 'lucide-react';

const EMOJI_CATEGORIES = [
  { id: 'smileys', name: 'Smileys & Emotion', icon: Smile, emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖'] },
  { id: 'gestures', name: 'Hands & Body', icon: Sparkles, emojis: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄'] },
  { id: 'hearts', name: 'Love & Hearts', icon: Heart, emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '💌', '💋', '💍', '💐', '🌹', '🥀', '🌺', '🌸', '🌷'] },
  { id: 'food', name: 'Food & Drink', icon: Coffee, emojis: ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🥦', '🌽', '🥕', '🧄', '🧅', '🥔', '🥐', '🍞', '🥖', '🥨', '🧀', '🍗', '🥩', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🍜', '🍝', '🍣', '🍱', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🍫', '🍬', '🍭', '☕', '🍵', '🧃', '🥤', '🧋', '🍺', '🍻', '🍷', '🥂'] },
  { id: 'activities', name: 'Activities & Sports', icon: Activity, emojis: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸️', '🥌', '🎿', '⛷️', '🏂', '🏋️', '🤼', '🤸', '🤺', '🎮', '🕹️', '🎲', '🧩', '🎯', '🎳', '🏆', '🥇', '🥈', '🥉'] },
  { id: 'travel', name: 'Travel & Places', icon: Plane, emojis: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🛵', '🏍️', '🛺', '🚲', '🛴', '🚨', '🚔', '✈️', '🛫', '🛬', '🚀', '🛸', '🚁', '🛶', '⛵', '🚤', '🚢', '⚓', '🏖️', '🏝️', '🏕️', '⛺', '🏙️', '🌃', '🌆', '🌇', '🌍', '🌎', '🌏'] },
  { id: 'objects', name: 'Objects & Symbols', icon: Lightbulb, emojis: ['💡', '🔦', '🕯️', '📱', '💻', '🖥️', '⌨️', '🖱️', '📷', '📸', '📹', '🎥', '📞', '📟', '📠', '📺', '📻', '🎙️', '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋', '🔌', '💎', '🔑', '🗝️', '🔒', '🔓', '🔔', '🔕', '🎉', '🎊', '🎈', '🎁', '🪄', '🔥', '⚡', '✨', '⭐', '🌟', '💥'] },
  { id: 'flags', name: 'Flags', icon: Flag, emojis: ['🏁', '🚩', '🎌', '🏴', '🏳️', '🏳️‍🌈', '🏳️‍⚧️', '🏴‍☠️', '🇮🇳', '🇺🇸', '🇬🇧', '🇨🇦', '🇦🇺', '🇩🇪', '🇫🇷', '🇯🇵', '🇰🇷', '🇧🇷', '🇷🇺', '🇨🇳'] },
];

export default function EmojiPickerPopover({ onSelectEmoji, onClose }) {
  const [activeCategory, setActiveCategory] = useState('smileys');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEmojis = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const query = searchQuery.toLowerCase();
    const results = [];
    EMOJI_CATEGORIES.forEach((cat) => {
      cat.emojis.forEach((emoji) => {
        results.push(emoji);
      });
    });
    return results;
  }, [searchQuery]);

  return (
    <div className="w-80 sm:w-96 bg-dark-card border border-dark-border rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-scale-in z-50 select-none">
      {/* Search Input */}
      <div className="p-3 border-b border-dark-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search emojis..."
            className="w-full pl-9 pr-3 py-2 bg-dark-input text-white text-xs rounded-xl border border-dark-border focus:border-primary-500 focus:outline-none placeholder:text-surface-500"
            autoFocus
          />
        </div>
      </div>

      {/* Category Tabs (if not searching) */}
      {!searchQuery && (
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-dark-border bg-dark-input/50 overflow-x-auto hide-scrollbar">
          {EMOJI_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`p-2 rounded-xl transition-all flex-shrink-0 ${
                  isActive ? 'bg-primary-500 text-white shadow-sm' : 'text-surface-400 hover:text-white hover:bg-dark-hover'
                }`}
                title={cat.name}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>
      )}

      {/* Emoji Grid */}
      <div className="p-3 max-h-64 overflow-y-auto hide-scrollbar">
        {searchQuery ? (
          <div>
            <p className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">Search Results</p>
            <div className="grid grid-cols-8 gap-1">
              {filteredEmojis.map((emoji, idx) => (
                <button
                  key={`${emoji}-${idx}`}
                  onClick={() => onSelectEmoji(emoji)}
                  className="w-9 h-9 rounded-xl hover:bg-dark-hover text-lg flex items-center justify-center transition-all hover:scale-125 active:scale-95 cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            {EMOJI_CATEGORIES.filter((c) => c.id === activeCategory).map((cat) => (
              <div key={cat.id}>
                <p className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">{cat.name}</p>
                <div className="grid grid-cols-8 gap-1">
                  {cat.emojis.map((emoji, idx) => (
                    <button
                      key={`${emoji}-${idx}`}
                      onClick={() => onSelectEmoji(emoji)}
                      className="w-9 h-9 rounded-xl hover:bg-dark-hover text-lg flex items-center justify-center transition-all hover:scale-125 active:scale-95 cursor-pointer"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
