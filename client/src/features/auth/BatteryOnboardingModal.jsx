import { useState, useEffect } from 'react';
import {
  BatteryCharging, Bell, ShieldCheck, ChevronRight, CheckCircle2,
  AlertTriangle, Smartphone, ExternalLink, X, Zap
} from 'lucide-react';
import { getPlatformName } from '../../lib/capacitorPush';

export default function BatteryOnboardingModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('general');
  const [isDone, setIsDone] = useState(false);

  if (!isOpen) return null;

  const handleOpenSettings = async () => {
    try {
      if (window.Capacitor?.Plugins?.App?.openUrl) {
        // Try opening native application details settings
        await window.Capacitor.Plugins.App.openUrl({ url: 'package:app.nexchat.messenger' });
      } else {
        alert('Please open your Android Settings > Apps > NexChat > Battery > Set to "Unrestricted"');
      }
    } catch (e) {
      alert('Please open your Android Settings > Apps > NexChat > Battery > Set to "Unrestricted"');
    }
  };

  const handleComplete = () => {
    localStorage.setItem('nexchat_battery_onboarded', 'true');
    if (onClose) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
      <div className="w-full max-w-md bg-dark-card border border-dark-border rounded-3xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto hide-scrollbar">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/20">
            <BatteryCharging className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white">Enable Instant Background Alerts</h2>
          <p className="text-xs text-surface-400 leading-relaxed">
            Android power-savers often kill background apps. To receive incoming calls and messages when NexChat is closed, allow unrestricted background running.
          </p>
        </div>

        {/* 3 Core Requirements */}
        <div className="space-y-2.5">
          <div className="p-3.5 rounded-2xl bg-dark-bg/70 border border-dark-border/60 flex items-start gap-3">
            <div className="p-2 rounded-xl bg-primary-500/20 text-primary-400 flex-shrink-0 mt-0.5">
              <Zap className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-white">1. Battery Optimization: Unrestricted</h4>
              <p className="text-[11px] text-surface-400 mt-0.5">
                Set NexChat battery usage to <strong>Unrestricted / No Restrictions</strong> in App Info.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-dark-bg/70 border border-dark-border/60 flex items-start gap-3">
            <div className="p-2 rounded-xl bg-accent-green/20 text-accent-green flex-shrink-0 mt-0.5">
              <Bell className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-white">2. Notification Permission (Android 13+)</h4>
              <p className="text-[11px] text-surface-400 mt-0.5">
                Ensure <strong>All Notifications</strong> and sound/lockscreen alerts are enabled.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-dark-bg/70 border border-dark-border/60 flex items-start gap-3">
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 flex-shrink-0 mt-0.5">
              <Smartphone className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-white">3. Autostart (Xiaomi / Oppo / Vivo)</h4>
              <p className="text-[11px] text-surface-400 mt-0.5">
                Enable <strong>Auto-start / Background App Management</strong> in system manager.
              </p>
            </div>
          </div>
        </div>

        {/* OEM Brand Quick Guides */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-surface-400 uppercase tracking-wider">Device Specific Instructions</span>
          </div>
          <div className="flex gap-1.5 p-1 bg-dark-input rounded-xl text-[11px]">
            {['general', 'xiaomi', 'oppo', 'samsung'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-1.5 rounded-lg font-bold capitalize transition-all ${
                  activeTab === tab ? 'bg-primary-500 text-white shadow-sm' : 'text-surface-400 hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="p-3 rounded-xl bg-dark-bg/40 border border-dark-border/40 text-[11px] text-surface-300 space-y-1">
            {activeTab === 'general' && (
              <p>Go to <strong>Settings ➔ Apps ➔ NexChat ➔ Battery</strong> and select <strong>Unrestricted</strong>.</p>
            )}
            {activeTab === 'xiaomi' && (
              <p>Open <strong>Security App ➔ Manage Apps ➔ NexChat</strong> ➔ Enable <strong>Autostart</strong> ➔ Set Battery Saver to <strong>No Restrictions</strong>.</p>
            )}
            {activeTab === 'oppo' && (
              <p>Go to <strong>Settings ➔ Battery ➔ App Battery Management ➔ NexChat</strong> ➔ Allow <strong>Background Activity</strong> and <strong>Auto-launch</strong>.</p>
            )}
            {activeTab === 'samsung' && (
              <p>Go to <strong>Settings ➔ Battery and Device Care ➔ Battery ➔ Background Usage Limits</strong> ➔ Add NexChat to <strong>Never Sleeping Apps</strong>.</p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          <button
            onClick={handleOpenSettings}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all active:scale-95"
          >
            <ExternalLink className="w-4 h-4" />
            Open Android App Settings
          </button>

          <button
            onClick={handleComplete}
            className="w-full py-3 rounded-xl gradient-primary text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-primary-500/20 hover:opacity-95 transition-all active:scale-95"
          >
            <CheckCircle2 className="w-4 h-4" />
            I've Whitelisted NexChat (Continue)
          </button>
        </div>
      </div>
    </div>
  );
}
