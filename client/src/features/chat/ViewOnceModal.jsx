import { useState, useEffect } from 'react';
import { X, Eye, ShieldAlert, Sparkles } from 'lucide-react';
import api from '../../lib/api';

export default function ViewOnceModal({ message, onClose, onMarkViewed }) {
  const [hasViewed, setHasViewed] = useState(false);
  const attachment = message?.attachments?.[0];
  const isVideo = attachment?.type === 'video';

  useEffect(() => {
    // Prevent right click / screenshot attempts in web context
    const handleContextMenu = (e) => e.preventDefault();
    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  const handleClose = async () => {
    if (!hasViewed && message?._id) {
      setHasViewed(true);
      try {
        await api.post(`/messages/${message._id}/view-once`);
        if (typeof onMarkViewed === 'function') {
          onMarkViewed(message._id);
        }
      } catch (err) {
        console.error('Failed to mark view-once viewed:', err);
      }
    }
    onClose();
  };

  if (!attachment?.url) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-black/95 backdrop-blur-xl p-4 select-none animate-fade-in"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Top Bar */}
      <div className="w-full max-w-2xl flex items-center justify-between py-2 px-3 border-b border-white/10 z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary-500/20 text-primary-400 border border-primary-500/30 flex items-center justify-center font-bold text-xs">
            1
          </div>
          <div>
            <p className="text-xs font-semibold text-white">View Once Media</p>
            <p className="text-[10px] text-surface-400">This media will vanish once closed</p>
          </div>
        </div>

        <button
          onClick={handleClose}
          className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-surface-300 hover:text-white transition-all"
          title="Close and destroy"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Content Viewer */}
      <div className="flex-1 flex items-center justify-center w-full max-w-3xl my-4 overflow-hidden relative">
        {isVideo ? (
          <video
            src={attachment.url}
            controls
            autoPlay
            controlsList="nodownload"
            className="max-h-[75vh] max-w-full rounded-2xl shadow-2xl object-contain"
          />
        ) : (
          <img
            src={attachment.url}
            alt="View Once"
            draggable="false"
            className="max-h-[75vh] max-w-full rounded-2xl shadow-2xl object-contain pointer-events-none"
          />
        )}
      </div>

      {/* Bottom Footer Notice */}
      <div className="w-full max-w-md py-3 px-4 rounded-xl bg-dark-card/80 border border-dark-border flex items-center justify-center gap-2 text-center text-xs text-surface-400 mb-2">
        <ShieldAlert className="w-4 h-4 text-accent-yellow flex-shrink-0" />
        <span>For privacy, this message cannot be opened again.</span>
      </div>
    </div>
  );
}
