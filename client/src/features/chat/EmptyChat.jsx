import { MessageCircle, ShieldCheck, Command, Search, Sparkles } from 'lucide-react';

export default function EmptyChat() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#0B0F17] relative overflow-hidden select-none">
      {/* Subtle ambient light */}
      <div className="absolute inset-x-0 top-1/3 h-72 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(99,102,241,0.06),transparent_70%)] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-md animate-fade-in">
        {/* Sleek Minimal App Mark */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-b from-indigo-500/20 to-indigo-600/10 border border-indigo-500/30 flex items-center justify-center mb-5 shadow-xl shadow-black/40">
          <MessageCircle className="w-8 h-8 text-indigo-400 stroke-[2]" />
        </div>

        <h2 className="text-xl font-bold text-white tracking-tight mb-2">NexChat Messenger</h2>
        <p className="text-surface-400 text-xs sm:text-sm leading-relaxed mb-6">
          Select a chat from the sidebar to start messaging, share files, or place encrypted HD calls.
        </p>

        {/* Keyboard shortcut pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#151D2C] border border-white/[0.08] text-xs text-surface-300">
            <kbd className="text-[10px] font-mono bg-white/[0.08] px-1.5 py-0.5 rounded text-white font-medium">Ctrl + K</kbd>
            <span className="text-[11px] text-surface-400">Quick Actions</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#151D2C] border border-white/[0.08] text-xs text-surface-300">
            <kbd className="text-[10px] font-mono bg-white/[0.08] px-1.5 py-0.5 rounded text-white font-medium">Ctrl + Shift + F</kbd>
            <span className="text-[11px] text-surface-400">Search</span>
          </div>
        </div>

        {/* Trust & Security Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] text-surface-400 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-accent-green" />
          <span>Encrypted real-time communication</span>
        </div>
      </div>
    </div>
  );
}
