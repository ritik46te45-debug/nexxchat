import React from 'react';
import { ExternalLink, X, Info, Sparkles } from 'lucide-react';
import useUIStore from '../../stores/uiStore';
import { ADMOB_CONFIG } from '../../lib/admob';

export default function AdBannerPreview() {
  const { showAdPreview, toggleAdPreview, isMobile, showChatOnMobile } = useUIStore();

  // If preview is off, or if currently inside an active chat on mobile, hide the banner
  if (!showAdPreview) return null;
  if (isMobile && showChatOnMobile) return null;

  return (
    <div
      className={`
        fixed z-30 transition-all duration-300 select-none animate-slide-up
        ${isMobile
          ? 'bottom-[56px] left-0 right-0 px-2 pb-1 flex justify-center'
          : 'bottom-4 right-4 max-w-sm'
        }
      `}
    >
      <div className="relative w-full max-w-[360px] h-[52px] rounded-xl bg-gradient-to-r from-[#1f2937] via-[#111827] to-[#1f2937] border border-primary-500/40 shadow-2xl shadow-primary-500/10 flex items-center justify-between px-3 overflow-hidden group">
        {/* Ad Badge Indicator */}
        <div className="absolute top-0 left-0 bg-amber-500 text-black text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded-br-md flex items-center gap-0.5 shadow-sm">
          <span>Ad</span>
          <span className="text-[7px] opacity-75">• AdMob</span>
        </div>

        {/* Ad Content Simulation */}
        <div className="flex items-center gap-2.5 min-w-0 pl-7">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-indigo flex items-center justify-center text-white flex-shrink-0 shadow-md">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0 text-left">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-bold text-white truncate leading-tight">
                Google AdMob Banner
              </p>
              <span className="text-[9px] text-surface-400 font-mono hidden sm:inline">320×50</span>
            </div>
            <p className="text-[10px] text-surface-400 truncate leading-tight mt-0.5">
              Target ID: <span className="font-mono text-primary-400">...2180697273</span>
            </p>
          </div>
        </div>

        {/* CTA Button & Dismiss */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="px-2.5 py-1 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-[10px] font-bold shadow-md cursor-pointer transition-colors">
            Install
          </span>
          <button
            onClick={toggleAdPreview}
            className="w-5 h-5 rounded-full hover:bg-white/10 text-surface-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Hide preview banner"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
