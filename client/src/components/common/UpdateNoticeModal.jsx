import React, { useState, useEffect } from 'react';
import { Download, Sparkles, RefreshCw, X, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export const CURRENT_CLIENT_VERSION = '1.0.2';

// Helper to compare semantic versions (e.g. '1.0.3' > '1.0.2')
function isNewerVersion(latest, current) {
  if (!latest || !current) return false;
  const pLatest = latest.split('.').map((n) => parseInt(n, 10) || 0);
  const pCurrent = current.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pLatest.length, pCurrent.length); i++) {
    const l = pLatest[i] || 0;
    const c = pCurrent[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

export default function UpdateNoticeModal() {
  const isNative = typeof window !== 'undefined' && (Boolean(Capacitor.isNativePlatform()) || Boolean(window.electronAPI?.isElectron));

  // Never show update popup on web browser — web apps update automatically
  if (!isNative) return null;

  const [updateInfo, setUpdateInfo] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const checkVersion = async () => {
      try {
        const { data } = await api.get('/version');
        if (!isMounted || !data?.latestVersion) return;

        const isUpdateAvailable = isNewerVersion(data.latestVersion, CURRENT_CLIENT_VERSION);
        if (isUpdateAvailable) {
          const dismissedVersion = localStorage.getItem('nexchat_dismissed_update_version');
          // If this version hasn't been dismissed, show the prompt
          if (dismissedVersion !== data.latestVersion || data.forceUpdate) {
            setUpdateInfo(data);
            setIsOpen(true);
          }
        }
      } catch (e) {
        // Silent fail — offline or server booting
      }
    };

    // Delay check slightly to prioritize chat/socket connection speed
    const timer = setTimeout(checkVersion, 3000);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  if (!isOpen || !updateInfo) return null;

  const handleUpdate = () => {
    if (isNative) {
      const targetUrl = updateInfo.downloadUrl || 'https://github.com/ritik46te45-debug/nexxchat/actions/runs/40645366535';
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    } else {
      // On web: refresh cache and reload to fetch latest bundle
      toast.loading('Applying update...');
      if ('caches' in window) {
        caches.keys().then((names) => {
          names.forEach((name) => caches.delete(name));
        }).finally(() => {
          window.location.reload(true);
        });
      } else {
        window.location.reload(true);
      }
    }
  };

  const handleDismiss = () => {
    if (updateInfo.forceUpdate) {
      toast.error('This update is required to continue using NexChat.');
      return;
    }
    try {
      localStorage.setItem('nexchat_dismissed_update_version', updateInfo.latestVersion);
    } catch (e) {}
    setIsOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-md p-6 rounded-3xl bg-dark-card/95 border border-primary-500/40 shadow-2xl backdrop-blur-2xl text-white select-none animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button if not forced */}
        {!updateInfo.forceUpdate && (
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 p-2 rounded-2xl text-surface-400 hover:text-white hover:bg-dark-hover transition-colors"
            title="Remind me later"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Header Icon */}
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center shadow-lg shadow-primary-500/30">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Update Available!
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-accent-green/20 text-accent-green border border-accent-green/30">
                v{updateInfo.latestVersion}
              </span>
            </h3>
            <p className="text-xs text-surface-400">
              Current version: <span className="font-mono text-surface-300">v{CURRENT_CLIENT_VERSION}</span>
            </p>
          </div>
        </div>

        {/* Content Box */}
        <div className="p-4 rounded-2xl bg-dark-input border border-dark-border mb-6 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-primary-400">
            <ShieldCheck className="w-4 h-4" />
            <span>What's New in this Update:</span>
          </div>
          <p className="text-xs text-surface-300 leading-relaxed">
            {updateInfo.releaseNotes || 'New features, performance enhancements, and bug fixes are ready.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={handleUpdate}
            className="w-full py-3 rounded-2xl gradient-primary hover:opacity-95 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25 transition-all cursor-pointer"
          >
            {isNative ? (
              <>
                <Download className="w-4 h-4" />
                <span>Download & Install Update</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>Update Now (Reload)</span>
              </>
            )}
          </button>

          {!updateInfo.forceUpdate && (
            <button
              onClick={handleDismiss}
              className="w-full sm:w-auto px-4 py-3 rounded-2xl bg-dark-hover hover:bg-dark-border text-surface-400 hover:text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              Later
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
