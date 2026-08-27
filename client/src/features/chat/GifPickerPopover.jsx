import { useState, useEffect } from 'react';
import { Search, Loader2, Sparkles, X } from 'lucide-react';

const PRESET_GIFS = [
  { id: '1', title: 'Thumbs Up', url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif', category: 'reactions' },
  { id: '2', title: 'Laughing', url: 'https://media.giphy.com/media/GpyS1ECqUyZxE22280/giphy.gif', category: 'funny' },
  { id: '3', title: 'Celebration Confetti', url: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif', category: 'party' },
  { id: '4', title: 'Mind Blown', url: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif', category: 'reactions' },
  { id: '5', title: 'Love Heart', url: 'https://media.giphy.com/media/26BRv0ThflsHCqDrG/giphy.gif', category: 'love' },
  { id: '6', title: 'Dancing Cat', url: 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif', category: 'dance' },
  { id: '7', title: 'Clapping Hands', url: 'https://media.giphy.com/media/nbvFVPiEiJH6QtXT30/giphy.gif', category: 'reactions' },
  { id: '8', title: 'Fire Flame', url: 'https://media.giphy.com/media/YrBRYRDN4a5ry/giphy.gif', category: 'party' },
  { id: '9', title: 'Hi Wave', url: 'https://media.giphy.com/media/3pZipqyo1sq2bKjfrW/giphy.gif', category: 'reactions' },
  { id: '10', title: 'Yes Excited', url: 'https://media.giphy.com/media/3oFzmpzTfyABIX6JBm/giphy.gif', category: 'reactions' },
  { id: '11', title: 'No Shock', url: 'https://media.giphy.com/media/12XMGIWtrHBl5e/giphy.gif', category: 'reactions' },
  { id: '12', title: 'Cool Shades', url: 'https://media.giphy.com/media/3o7TKMt1VVNkHV2PaE/giphy.gif', category: 'funny' },
];

const CATEGORIES = [
  { id: 'all', label: 'Trending' },
  { id: 'reactions', label: 'Reactions' },
  { id: 'funny', label: 'Funny' },
  { id: 'party', label: 'Party' },
  { id: 'love', label: 'Love' },
  { id: 'dance', label: 'Dance' },
];

export default function GifPickerPopover({ onSelectGif, onClose }) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [gifs, setGifs] = useState(PRESET_GIFS);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let results = PRESET_GIFS;
    if (activeCategory !== 'all') {
      results = results.filter((g) => g.category === activeCategory);
    }
    if (searchQuery.trim()) {
      results = results.filter((g) =>
        g.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    setGifs(results);
  }, [activeCategory, searchQuery]);

  return (
    <div className="w-80 sm:w-96 bg-dark-card border border-dark-border rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-scale-in z-50 select-none">
      {/* Search Header */}
      <div className="p-3 border-b border-dark-border flex items-center justify-between gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search animated GIFs..."
            className="w-full pl-9 pr-3 py-2 bg-dark-input text-white text-xs rounded-xl border border-dark-border focus:border-primary-500 focus:outline-none placeholder:text-surface-500"
            autoFocus
          />
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white flex items-center justify-center transition-all border border-dark-border flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Category Pills */}
      <div className="flex gap-1.5 px-3 py-2 border-b border-dark-border bg-dark-input/40 overflow-x-auto hide-scrollbar">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
              activeCategory === cat.id
                ? 'gradient-primary text-white shadow-sm'
                : 'bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white border border-dark-border'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* GIFs Grid */}
      <div className="p-3 max-h-72 overflow-y-auto hide-scrollbar">
        {gifs.length === 0 ? (
          <div className="py-8 text-center text-surface-500 text-xs">
            No GIFs found for "{searchQuery}"
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                onClick={() => onSelectGif(gif.url, gif.title)}
                className="relative rounded-2xl overflow-hidden border border-dark-border/60 hover:border-primary-500 hover:scale-[1.02] active:scale-98 transition-all group aspect-video bg-dark-bg cursor-pointer"
              >
                <img
                  src={gif.url}
                  alt={gif.title}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                  <span className="text-[10px] font-bold text-white truncate">{gif.title}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
