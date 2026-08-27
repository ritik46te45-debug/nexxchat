import { useState, useRef } from 'react';
import {
  X, Palette, Check, Sparkles, Upload, Image as ImageIcon,
  Sliders, Type, Layers, RefreshCw
} from 'lucide-react';
import useUIStore from '../../stores/uiStore';
import toast from 'react-hot-toast';

const WALLPAPERS = [
  // Dark & AMOLED
  { id: 'default', name: 'NexChat Dark', category: 'Dark', bg: 'bg-[#0a0a1a]' },
  { id: 'amoled', name: 'AMOLED Black', category: 'Dark', bg: 'bg-[#000000]' },
  { id: 'carbon', name: 'Carbon Fiber', category: 'Dark', bg: 'bg-[#121218]' },
  { id: 'midnight', name: 'Midnight Violet', category: 'Dark', bg: 'bg-gradient-to-b from-[#130d24] to-[#0a0614]' },
  { id: 'ocean', name: 'Deep Space Blue', category: 'Dark', bg: 'bg-gradient-to-b from-[#0a192f] to-[#020c1b]' },

  // Nature & Scenery
  { id: 'forest', name: 'Emerald Forest', category: 'Nature', bg: 'bg-gradient-to-b from-[#06201b] to-[#020e0c]' },
  { id: 'sunset', name: 'Golden Sunset', category: 'Nature', bg: 'bg-gradient-to-b from-[#2a1309] to-[#120502]' },
  { id: 'mountain', name: 'Mountain Mist', category: 'Nature', bg: 'bg-gradient-to-b from-[#161d28] to-[#0c1017]' },
  { id: 'aurora', name: 'Northern Lights', category: 'Nature', bg: 'bg-gradient-to-b from-[#0a1e24] to-[#030d10]' },

  // Abstract & Cyber
  { id: 'cyber', name: 'Neon Cyberpunk', category: 'Cyber', bg: 'bg-gradient-to-b from-[#1c0e29] to-[#0a0514]' },
  { id: 'glass', name: 'Glass Liquid', category: 'Cyber', bg: 'bg-gradient-to-b from-[#1a1429] to-[#0d071a]' },
  { id: 'retro', name: 'Synthwave Neon', category: 'Cyber', bg: 'bg-gradient-to-b from-[#24081c] to-[#0d020a]' },
];

const BUBBLE_STYLES = [
  { id: 'rounded', name: 'Modern Rounded', desc: 'Sleek rounded corners with subtle borders' },
  { id: 'glass', name: 'Glassmorphic', desc: 'Translucent glass effect with blur' },
  { id: 'classic', name: 'Classic Solid', desc: 'High-contrast vibrant solid gradient' },
  { id: 'minimal', name: 'Minimal Compact', desc: 'Tight spacing and minimal padding' },
];

const FONT_SIZES = [
  { id: 'small', label: 'Small (12px)' },
  { id: 'normal', label: 'Normal (14px)' },
  { id: 'large', label: 'Large (16px)' },
  { id: 'xlarge', label: 'Extra Large (18px)' },
];

export default function WallpaperModal({ onClose, conversationId }) {
  const {
    chatFontSize, setChatFontSize,
    bubbleStyle, setBubbleStyle
  } = useUIStore();

  const storageKey = conversationId ? `nexchat_wp_${conversationId}` : 'nexchat_global_wp';
  const brightnessKey = conversationId ? `nexchat_wp_bright_${conversationId}` : 'nexchat_global_wp_bright';
  const blurKey = conversationId ? `nexchat_wp_blur_${conversationId}` : 'nexchat_global_wp_blur';

  const [selectedWp, setSelectedWp] = useState(localStorage.getItem(storageKey) || 'default');
  const [brightness, setBrightness] = useState(Number(localStorage.getItem(brightnessKey) || 100));
  const [blur, setBlur] = useState(Number(localStorage.getItem(blurKey) || 0));
  const [activeCategory, setActiveCategory] = useState('All');
  const fileInputRef = useRef(null);

  const categories = ['All', 'Dark', 'Nature', 'Cyber'];

  const filteredWallpapers = activeCategory === 'All'
    ? WALLPAPERS
    : WALLPAPERS.filter((w) => w.category === activeCategory);

  const notifyChange = (wpId, bright, blr) => {
    window.dispatchEvent(new CustomEvent('nexchat_wallpaper_changed', {
      detail: {
        conversationId,
        wallpaperId: wpId || selectedWp,
        brightness: bright !== undefined ? bright : brightness,
        blur: blr !== undefined ? blr : blur,
      }
    }));
  };

  const handleSelectWp = (wpId) => {
    setSelectedWp(wpId);
    localStorage.setItem(storageKey, wpId);
    notifyChange(wpId, brightness, blur);
    toast.success('Chat wallpaper applied!');
  };

  const handleBrightnessChange = (val) => {
    setBrightness(val);
    localStorage.setItem(brightnessKey, String(val));
    notifyChange(selectedWp, val, blur);
  };

  const handleBlurChange = (val) => {
    setBlur(val);
    localStorage.setItem(blurKey, String(val));
    notifyChange(selectedWp, brightness, val);
  };

  const handleCustomUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      localStorage.setItem(`nexchat_custom_wp_data`, dataUrl);
      localStorage.setItem(storageKey, 'custom');
      setSelectedWp('custom');
      notifyChange('custom', brightness, blur);
      toast.success('Custom wallpaper uploaded & applied!');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-[130] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 select-none animate-fade-in">
      <div className="w-full max-w-2xl bg-dark-card border border-dark-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-dark-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary-500/20 text-primary-400 flex items-center justify-center border border-primary-500/30">
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm sm:text-base">Wallpaper & Chat Customizer</h3>
              <p className="text-[11px] text-surface-400">Personalize backgrounds, bubble styles, and text density</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white flex items-center justify-center transition-all border border-dark-border"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto hide-scrollbar p-5 space-y-6 text-xs">
          {/* 1. Wallpaper Gallery */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-white text-xs uppercase tracking-wider">Choose Wallpaper</h4>
              {/* Category Pills */}
              <div className="flex gap-1">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                      activeCategory === cat
                        ? 'gradient-primary text-white'
                        : 'bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {filteredWallpapers.map((wp) => (
                <button
                  key={wp.id}
                  onClick={() => handleSelectWp(wp.id)}
                  className={`h-24 rounded-2xl border-2 transition-all p-3 flex flex-col justify-between relative overflow-hidden group cursor-pointer ${
                    wp.bg
                  } ${
                    selectedWp === wp.id
                      ? 'border-primary-500 scale-105 shadow-xl ring-2 ring-primary-500/40'
                      : 'border-dark-border hover:border-surface-400'
                  }`}
                >
                  <span className="text-[11px] font-bold text-white drop-shadow-md">{wp.name}</span>
                  {selectedWp === wp.id && (
                    <div className="w-6 h-6 rounded-full gradient-primary text-white flex items-center justify-center self-end shadow-md">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                </button>
              ))}

              {/* Upload Custom Wallpaper Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="h-24 rounded-2xl border-2 border-dashed border-dark-border hover:border-primary-500 bg-dark-input/40 flex flex-col items-center justify-center gap-1.5 transition-all text-surface-400 hover:text-white cursor-pointer"
              >
                <Upload className="w-5 h-5 text-primary-400" />
                <span className="text-[11px] font-bold">Upload Custom</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCustomUpload}
              />
            </div>
          </div>

          {/* 2. Wallpaper Controls (Brightness & Blur) */}
          <div className="p-4 rounded-2xl bg-dark-input/50 border border-dark-border space-y-3">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider">Wallpaper Visual Tuning</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between text-[11px] text-surface-400 mb-1">
                  <span>Brightness</span>
                  <span className="font-mono font-bold text-white">{brightness}%</span>
                </div>
                <input
                  type="range"
                  min={30}
                  max={100}
                  value={brightness}
                  onChange={(e) => handleBrightnessChange(Number(e.target.value))}
                  className="w-full h-1.5 bg-dark-card rounded-lg appearance-none cursor-pointer accent-primary-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-surface-400 mb-1">
                  <span>Background Blur</span>
                  <span className="font-mono font-bold text-white">{blur}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={12}
                  value={blur}
                  onChange={(e) => handleBlurChange(Number(e.target.value))}
                  className="w-full h-1.5 bg-dark-card rounded-lg appearance-none cursor-pointer accent-primary-500"
                />
              </div>
            </div>
          </div>

          {/* 3. Chat Bubble Style */}
          <div>
            <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-2.5">Chat Bubble Style</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {BUBBLE_STYLES.map((style) => (
                <button
                  key={style.id}
                  onClick={() => setBubbleStyle(style.id)}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    bubbleStyle === style.id
                      ? 'border-primary-500 bg-primary-500/15 text-white'
                      : 'border-dark-border bg-dark-input/50 hover:bg-dark-hover text-surface-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{style.name}</span>
                    {bubbleStyle === style.id && <Check className="w-4 h-4 text-primary-400" />}
                  </div>
                  <p className="text-[10px] text-surface-400 mt-0.5">{style.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 4. Chat Font Size */}
          <div>
            <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-2.5">Message Font Size</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {FONT_SIZES.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setChatFontSize(f.id)}
                  className={`py-2 px-3 rounded-xl border font-bold text-center transition-all cursor-pointer ${
                    chatFontSize === f.id
                      ? 'gradient-primary border-transparent text-white shadow-sm'
                      : 'border-dark-border bg-dark-input hover:bg-dark-hover text-surface-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-dark-border bg-dark-card flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl gradient-primary text-white text-xs font-bold shadow-lg hover:opacity-95 transition-all"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
}
