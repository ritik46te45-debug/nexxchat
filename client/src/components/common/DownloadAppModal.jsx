import React, { useState, useEffect } from 'react';
import { X, Smartphone, Monitor, Globe, Download, Check, ExternalLink, Sparkles } from 'lucide-react';
import useUIStore from '../../stores/uiStore';
import toast from 'react-hot-toast';

export default function DownloadAppModal() {
  const { showDownloadModal, setShowDownloadModal } = useUIStore();
  const [copied, setCopied] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  if (!showDownloadModal) return null;

  const handleCopyLink = () => {
    const url = typeof window !== 'undefined' ? window.location.origin : 'https://nexxchat-zeta.vercel.app';
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('App link copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInstallPWA = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        toast.success('NexChat installed to Home Screen!');
      }
      setDeferredPrompt(null);
    } else {
      toast('To install: tap your browser menu (⋮) and select "Add to Home Screen" or "Install App".', {
        icon: '📱',
        duration: 4000,
      });
    }
  };

  const githubReleasesUrl = 'https://github.com/ritik46te45-debug/nexxchat/releases';

  return (
    <div
      onClick={() => setShowDownloadModal(false)}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in"
    >
      <div
        className="relative w-full max-w-md p-6 rounded-3xl bg-dark-card/95 border border-dark-border shadow-2xl backdrop-blur-2xl text-white select-none animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={() => setShowDownloadModal(false)}
          className="absolute top-4 right-4 p-2 rounded-2xl text-surface-400 hover:text-white hover:bg-dark-hover transition-colors"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center shadow-lg shadow-primary-500/30">
            <Download className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Download NexChat
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-400 border border-primary-500/30">
                v1.0.2
              </span>
            </h3>
            <p className="text-xs text-surface-400">Available on Android, Windows, and Web</p>
          </div>
        </div>

        {/* Options List */}
        <div className="space-y-3 mb-6">
          {/* 1. Android APK */}
          <a
            href={githubReleasesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3.5 rounded-2xl bg-dark-input hover:bg-dark-hover border border-dark-border hover:border-accent-green/50 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-green/10 text-accent-green flex items-center justify-center group-hover:scale-105 transition-transform">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-white group-hover:text-accent-green transition-colors">
                  Android App (.apk)
                </p>
                <p className="text-[11px] text-surface-400">Free download for all Android phones</p>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-surface-400 group-hover:text-accent-green transition-colors" />
          </a>

          {/* 2. Windows Desktop EXE */}
          <a
            href={githubReleasesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3.5 rounded-2xl bg-dark-input hover:bg-dark-hover border border-dark-border hover:border-primary-400/50 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-500/10 text-primary-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Monitor className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-white group-hover:text-primary-400 transition-colors">
                  Windows PC App (.exe)
                </p>
                <p className="text-[11px] text-surface-400">Installer & Portable editions for Windows 10/11</p>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-surface-400 group-hover:text-primary-400 transition-colors" />
          </a>

          {/* 3. Install Web App PWA */}
          <button
            onClick={handleInstallPWA}
            className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-dark-input hover:bg-dark-hover border border-dark-border hover:border-amber-400/50 transition-all group text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-400/10 text-amber-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">
                  Web App (PWA)
                </p>
                <p className="text-[11px] text-surface-400">Install directly to your home screen or browser</p>
              </div>
            </div>
            <Sparkles className="w-4 h-4 text-surface-400 group-hover:text-amber-400 transition-colors" />
          </button>
        </div>

        {/* Installation Tip */}
        <div className="p-3 mb-4 rounded-xl bg-primary-500/10 border border-primary-500/20 text-xs text-surface-300">
          💡 <span className="font-semibold text-white">Windows Tip:</span> If SmartScreen says &quot;Windows protected your PC&quot;, click <span className="text-primary-400 font-semibold">More info</span> → <span className="text-primary-400 font-semibold">Run anyway</span>.
        </div>

        {/* Footer: Share Link */}
        <div className="pt-4 border-t border-dark-border flex items-center justify-between">
          <span className="text-xs text-surface-400">Share with friends:</span>
          <button
            onClick={handleCopyLink}
            className="px-3.5 py-1.5 rounded-xl bg-dark-hover hover:bg-dark-border text-xs font-semibold text-white flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-accent-green" />
                <span>Copied!</span>
              </>
            ) : (
              <span>Copy Website URL</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
