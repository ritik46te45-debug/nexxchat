import { useState } from 'react';
import { X, Sparkles } from 'lucide-react';

const STICKER_PACKS = [
  {
    id: 'cool_cats',
    name: 'Cool Cats',
    stickers: [
      { id: 'c1', url: 'https://cdn-icons-png.flaticon.com/512/616/616430.png', name: 'Super Cat' },
      { id: 'c2', url: 'https://cdn-icons-png.flaticon.com/512/616/616408.png', name: 'Happy Cat' },
      { id: 'c3', url: 'https://cdn-icons-png.flaticon.com/512/616/616410.png', name: 'Love Cat' },
      { id: 'c4', url: 'https://cdn-icons-png.flaticon.com/512/616/616418.png', name: 'Cool Cat' },
      { id: 'c5', url: 'https://cdn-icons-png.flaticon.com/512/616/616422.png', name: 'Shock Cat' },
      { id: 'c6', url: 'https://cdn-icons-png.flaticon.com/512/616/616438.png', name: 'Sleepy Cat' },
    ],
  },
  {
    id: 'emojis_3d',
    name: '3D Glossy',
    stickers: [
      { id: 'e1', url: 'https://cdn-icons-png.flaticon.com/512/742/742751.png', name: 'Party Emoji' },
      { id: 'e2', url: 'https://cdn-icons-png.flaticon.com/512/742/742752.png', name: 'Cool Emoji' },
      { id: 'e3', url: 'https://cdn-icons-png.flaticon.com/512/742/742774.png', name: 'Shocked 3D' },
      { id: 'e4', url: 'https://cdn-icons-png.flaticon.com/512/742/742784.png', name: 'Tongue 3D' },
      { id: 'e5', url: 'https://cdn-icons-png.flaticon.com/512/742/742927.png', name: 'Heart Eyes 3D' },
      { id: 'e6', url: 'https://cdn-icons-png.flaticon.com/512/742/742933.png', name: 'Cry Laugh 3D' },
    ],
  },
  {
    id: 'tech_vibes',
    name: 'Tech & Gaming',
    stickers: [
      { id: 't1', url: 'https://cdn-icons-png.flaticon.com/512/1055/1055687.png', name: 'Rocket Launch' },
      { id: 't2', url: 'https://cdn-icons-png.flaticon.com/512/686/686589.png', name: 'Game Controller' },
      { id: 't3', url: 'https://cdn-icons-png.flaticon.com/512/2991/2991148.png', name: 'Neon Lightning' },
      { id: 't4', url: 'https://cdn-icons-png.flaticon.com/512/1152/1152912.png', name: 'Trophy Winner' },
      { id: 't5', url: 'https://cdn-icons-png.flaticon.com/512/786/786205.png', name: 'Fire Blast' },
      { id: 't6', url: 'https://cdn-icons-png.flaticon.com/512/3208/3208726.png', name: 'Cyber Diamond' },
    ],
  },
];

export default function StickerPickerPopover({ onSelectSticker, onClose }) {
  const [activePackId, setActivePackId] = useState(STICKER_PACKS[0].id);

  const activePack = STICKER_PACKS.find((p) => p.id === activePackId) || STICKER_PACKS[0];

  return (
    <div className="w-80 sm:w-96 bg-dark-card border border-dark-border rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-scale-in z-50 select-none">
      {/* Header */}
      <div className="px-4 py-3 border-b border-dark-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary-400" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Sticker Packs</h3>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white flex items-center justify-center transition-all border border-dark-border"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Pack Tabs */}
      <div className="flex gap-1.5 px-3 py-2 border-b border-dark-border bg-dark-input/40 overflow-x-auto hide-scrollbar">
        {STICKER_PACKS.map((pack) => (
          <button
            key={pack.id}
            onClick={() => setActivePackId(pack.id)}
            className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
              activePackId === pack.id
                ? 'gradient-primary text-white shadow-sm'
                : 'bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white border border-dark-border'
            }`}
          >
            {pack.name}
          </button>
        ))}
      </div>

      {/* Stickers Grid */}
      <div className="p-3 max-h-64 overflow-y-auto hide-scrollbar">
        <div className="grid grid-cols-3 gap-3">
          {activePack.stickers.map((sticker) => (
            <button
              key={sticker.id}
              onClick={() => onSelectSticker(sticker.url, sticker.name)}
              className="p-3 rounded-2xl bg-dark-input/50 hover:bg-dark-hover border border-dark-border/60 hover:border-primary-500/60 hover:scale-105 active:scale-95 transition-all flex flex-col items-center gap-1.5 cursor-pointer group"
            >
              <img
                src={sticker.url}
                alt={sticker.name}
                className="w-14 h-14 object-contain filter drop-shadow-md group-hover:scale-110 transition-transform"
              />
              <span className="text-[10px] text-surface-400 font-medium truncate max-w-full">{sticker.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
