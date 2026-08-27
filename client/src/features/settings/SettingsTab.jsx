import { useState, useEffect } from 'react';
import {
  Shield, Bell, Lock, Smartphone, Moon, Sun, Trash2, LogOut,
  Check, ChevronRight, Volume2, Music, Play, QrCode, Key,
  Radio, Send, AlertTriangle, Fingerprint, Sparkles, Palette,
  Search
} from 'lucide-react';
import api from '../../lib/api';
import useAuthStore from '../../stores/authStore';
import useUIStore from '../../stores/uiStore';
import { playIncomingMessageSound, playSentMessageSound } from '../../lib/notifications';
import { registerPushNotifications } from '../../lib/pushNotifications';
import toast from 'react-hot-toast';

export default function SettingsTab({ onOpenProfile }) {
  const { user, updateUser, logout } = useAuthStore();
  const { theme, setTheme, setShowWallpaperModal } = useUIStore();
  const [searchQuery, setSearchQuery] = useState('');

  const [privacy, setPrivacy] = useState(user?.privacy || {});
  const [notifications, setNotifications] = useState(user?.notificationSettings || {});
  const [sessions, setSessions] = useState([]);
  const [activeSection, setActiveSection] = useState('main'); // 'main', 'privacy', 'sounds', 'notifications', 'sessions', '2fa'

  // Sound preferences state
  const [soundEnabled, setSoundEnabled] = useState(localStorage.getItem('nexchat_sound_enabled') !== 'false');
  const [sentSoundEnabled, setSentSoundEnabled] = useState(localStorage.getItem('nexchat_sent_sound_enabled') !== 'false');
  const [receiveTone, setReceiveTone] = useState(localStorage.getItem('nexchat_receive_tone') || 'classic');
  const [sentTone, setSentTone] = useState(localStorage.getItem('nexchat_sent_tone') || 'swoosh');

  // App Lock Passcode state
  const [isLockEnabled, setIsLockEnabled] = useState(localStorage.getItem('nexchat_lock_enabled') === 'true');
  const [lockTimeout, setLockTimeout] = useState(localStorage.getItem('nexchat_lock_timeout') || '0');
  const [showPinModal, setShowPinModal] = useState(false);
  const [newPin, setNewPin] = useState('');

  // 2FA state
  const [is2FAEnabled, setIs2FAEnabled] = useState(user?.twoFactor?.enabled || false);
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [qrCodeData, setQrCodeData] = useState(null);
  const [totpToken, setTotpToken] = useState('');
  const [isVerifying2FA, setIsVerifying2FA] = useState(false);

  // Web Push status
  const [isPushRegistering, setIsPushRegistering] = useState(false);

  const handleToggleSound = (enabled) => {
    setSoundEnabled(enabled);
    localStorage.setItem('nexchat_sound_enabled', enabled ? 'true' : 'false');
    handleUpdateNotification('sound', enabled);
    if (enabled) playIncomingMessageSound(receiveTone);
  };

  const handleToggleSentSound = (enabled) => {
    setSentSoundEnabled(enabled);
    localStorage.setItem('nexchat_sent_sound_enabled', enabled ? 'true' : 'false');
    if (enabled) playSentMessageSound(sentTone);
  };

  const handleChangeReceiveTone = (tone) => {
    setReceiveTone(tone);
    localStorage.setItem('nexchat_receive_tone', tone);
    playIncomingMessageSound(tone);
    toast.success('Incoming tone updated');
  };

  const handleChangeSentTone = (tone) => {
    setSentTone(tone);
    localStorage.setItem('nexchat_sent_tone', tone);
    playSentMessageSound(tone);
    toast.success('Sent tone updated');
  };

  const handleToggleAppLock = (enabled) => {
    if (enabled) {
      const existingPin = localStorage.getItem('nexchat_lock_pin');
      if (!existingPin) {
        setShowPinModal(true);
        return;
      }
      localStorage.setItem('nexchat_lock_enabled', 'true');
      setIsLockEnabled(true);
      toast.success('App Lock enabled');
    } else {
      localStorage.setItem('nexchat_lock_enabled', 'false');
      setIsLockEnabled(false);
      toast.success('App Lock disabled');
    }
  };

  const handleChangeLockTimeout = (val) => {
    setLockTimeout(val);
    localStorage.setItem('nexchat_lock_timeout', val);
    toast.success('Lock timeout updated');
  };

  const handleSavePin = () => {
    if (newPin.length !== 4) {
      toast.error('PIN must be exactly 4 digits');
      return;
    }
    localStorage.setItem('nexchat_lock_pin', newPin);
    localStorage.setItem('nexchat_lock_enabled', 'true');
    setIsLockEnabled(true);
    setShowPinModal(false);
    setNewPin('');
    toast.success('Passcode PIN saved & App Lock enabled');
  };

  // 2FA Handlers
  const handleStart2FASetup = async () => {
    try {
      const { data } = await api.post('/auth/2fa/setup');
      setQrCodeData(data);
      setShow2FAModal(true);
    } catch {
      toast.error('Failed to initiate 2FA setup');
    }
  };

  const handleVerifyAndEnable2FA = async () => {
    if (!totpToken.trim() || totpToken.length !== 6) {
      toast.error('Enter a valid 6-digit code from your authenticator app');
      return;
    }

    setIsVerifying2FA(true);
    try {
      await api.post('/auth/2fa/enable', { token: totpToken.trim() });
      setIs2FAEnabled(true);
      updateUser({ twoFactor: { enabled: true } });
      setShow2FAModal(false);
      setTotpToken('');
      toast.success('Two-Factor Authentication enabled!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid 2FA code');
    } finally {
      setIsVerifying2FA(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!window.confirm('Are you sure you want to disable Two-Factor Authentication?')) return;
    try {
      await api.post('/auth/2fa/disable');
      setIs2FAEnabled(false);
      updateUser({ twoFactor: { enabled: false } });
      toast.success('2FA disabled');
    } catch {
      toast.error('Failed to disable 2FA');
    }
  };

  // Web Push Handlers
  const handleEnableWebPush = async () => {
    setIsPushRegistering(true);
    try {
      const success = await registerPushNotifications();
      if (success) {
        toast.success('Background Web Push enabled!');
      } else {
        toast('Please allow notification permissions in your browser', { icon: '🔔' });
      }
    } catch {
      toast.error('Failed to register push notifications');
    } finally {
      setIsPushRegistering(false);
    }
  };

  useEffect(() => {
    if (activeSection === 'sessions') {
      loadSessions();
    }
  }, [activeSection]);

  const loadSessions = async () => {
    try {
      const { data } = await api.get('/auth/sessions');
      setSessions(data.sessions || []);
    } catch (err) {
      console.error('Load sessions error:', err);
    }
  };

  const handleUpdatePrivacy = async (field, value) => {
    try {
      const newPrivacy = { ...privacy, [field]: value };
      setPrivacy(newPrivacy);
      await api.put('/users/privacy', { [field]: value });
      updateUser({ privacy: newPrivacy });
      toast.success('Privacy updated');
    } catch {
      toast.error('Failed to update privacy');
    }
  };

  const handleUpdateNotification = async (field, value) => {
    try {
      const newNotifications = { ...notifications, [field]: value };
      setNotifications(newNotifications);
      await api.put('/users/notifications', { [field]: value });
      updateUser({ notificationSettings: newNotifications });
    } catch {
      toast.error('Failed to update notification');
    }
  };

  const handleRevokeSession = async (sessionId) => {
    try {
      await api.delete(`/auth/sessions/${sessionId}`);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      toast.success('Device session revoked');
    } catch {
      toast.error('Failed to revoke session');
    }
  };

  const handleRevokeAllSessions = async () => {
    try {
      await api.delete('/auth/sessions');
      setSessions((prev) => prev.filter((s) => s.isCurrent));
      toast.success('All other sessions revoked');
    } catch {
      toast.error('Failed to revoke sessions');
    }
  };

  return (
    <div className="flex flex-col h-full bg-dark-bg select-none">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-dark-border">
        {activeSection !== 'main' && (
          <button
            onClick={() => setActiveSection('main')}
            className="p-1 rounded-lg text-surface-400 hover:text-white hover:bg-dark-hover"
          >
            ←
          </button>
        )}
        <h1 className="text-xl font-bold text-white">
          {activeSection === 'main' && 'Settings'}
          {activeSection === 'privacy' && 'Privacy & Security'}
          {activeSection === 'sounds' && 'Chat Sounds & Chimes'}
          {activeSection === 'notifications' && 'Notifications & Alerts'}
          {activeSection === 'sessions' && 'Active Devices & Sessions'}
          {activeSection === '2fa' && 'Two-Factor Authentication'}
        </h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar p-4 space-y-4">
        {activeSection === 'main' && (
          <>
            {/* User card */}
            <div
              onClick={onOpenProfile}
              className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-dark-card border border-dark-border hover:bg-dark-hover transition-all cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-primary-500/30 bg-dark-input flex items-center justify-center">
                {user?.avatar?.url ? (
                  <img
                    src={user.avatar.url}
                    alt={user.displayName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full gradient-primary flex items-center justify-center font-bold text-white text-lg">
                    {user?.displayName?.charAt(0) || '?'}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white group-hover:text-primary-400 transition-colors">
                  {user?.displayName}
                </p>
                <p className="text-xs text-surface-500">@{user?.username}</p>
                <p className="text-xs text-surface-400 truncate mt-0.5">{user?.about}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-surface-500 group-hover:text-white transition-colors flex-shrink-0" />
            </div>

            {/* Settings Search Bar */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search settings..."
                className="w-full pl-10 pr-4 py-2.5 bg-dark-input text-white text-xs sm:text-sm rounded-xl border border-dark-border focus:border-primary-500 focus:outline-none placeholder:text-surface-500"
              />
            </div>

            {/* Settings links */}
            <div className="space-y-2">
              {(!searchQuery || 'chat wallpaper appearance theme background'.includes(searchQuery.toLowerCase())) && (
                <button
                  onClick={() => setShowWallpaperModal(true)}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl bg-dark-card hover:bg-dark-hover border border-dark-border transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-pink-500/20 text-pink-400 flex items-center justify-center">
                      <Palette className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-white">Chat Wallpaper & Appearance</p>
                      <p className="text-xs text-surface-500">AMOLED, nature backgrounds, bubble styles & font</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-surface-500" />
                </button>
              )}

              {(!searchQuery || 'privacy lock passcode pin biometrics'.includes(searchQuery.toLowerCase())) && (
                <button
                  onClick={() => setActiveSection('privacy')}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl bg-dark-card hover:bg-dark-hover border border-dark-border transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary-500/20 text-primary-400 flex items-center justify-center">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-white">Privacy & App Lock</p>
                      <p className="text-xs text-surface-500">Passcode PIN, biometrics, last seen</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-surface-500" />
                </button>
              )}

              {(!searchQuery || '2fa two factor authentication security'.includes(searchQuery.toLowerCase())) && (
                <button
                  onClick={() => setActiveSection('2fa')}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl bg-dark-card hover:bg-dark-hover border border-dark-border transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-accent-green/20 text-accent-green flex items-center justify-center">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-white">Two-Factor Authentication (2FA)</p>
                      <p className="text-xs text-surface-500">{is2FAEnabled ? 'Enabled • Authenticator App' : 'Disabled • Add extra security'}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-surface-500" />
                </button>
              )}

              {(!searchQuery || 'sounds chimes tones ringtone audio'.includes(searchQuery.toLowerCase())) && (
                <button
                  onClick={() => setActiveSection('sounds')}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl bg-dark-card hover:bg-dark-hover border border-dark-border transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
                      <Volume2 className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-white">Chat Sounds & Chimes</p>
                      <p className="text-xs text-surface-500">Sent & incoming message tones, sound previews</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-surface-500" />
                </button>
              )}

              {(!searchQuery || 'notifications push web alerts background'.includes(searchQuery.toLowerCase())) && (
                <button
                  onClick={() => setActiveSection('notifications')}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl bg-dark-card hover:bg-dark-hover border border-dark-border transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-accent-green/20 text-accent-green flex items-center justify-center">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-white">Notifications & Web Push</p>
                      <p className="text-xs text-surface-500">Background alerts when browser is closed</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-surface-500" />
                </button>
              )}

              {(!searchQuery || 'sessions devices logged in active'.includes(searchQuery.toLowerCase())) && (
                <button
                  onClick={() => setActiveSection('sessions')}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl bg-dark-card hover:bg-dark-hover border border-dark-border transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-white">Active Sessions & Devices</p>
                      <p className="text-xs text-surface-500">Manage logged-in devices</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-surface-500" />
                </button>
              )}

              {(!searchQuery || 'theme dark midnight amoled cyber emerald mode'.includes(searchQuery.toLowerCase())) && (
                <div className="p-3.5 rounded-2xl bg-dark-card border border-dark-border space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-yellow-500/20 text-yellow-400 flex items-center justify-center">
                        <Moon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">App Color Theme</p>
                        <p className="text-xs text-surface-500">Choose from 5 premium color themes</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                    {[
                      { id: 'dark', name: 'NexChat Dark', color: 'from-[#0a0a1a] to-[#111128]', border: 'border-primary-500' },
                      { id: 'light', name: 'Light Mode', color: 'from-[#e2e8f0] to-[#f8fafc]', border: 'border-blue-400' },
                      { id: 'midnight', name: 'Midnight Violet', color: 'from-[#0d061e] to-[#160c33]', border: 'border-purple-500' },
                      { id: 'amoled', name: 'AMOLED Black', color: 'from-[#000000] to-[#0a0a0a]', border: 'border-neutral-700' },
                      { id: 'cyber', name: 'Cyberpunk Neon', color: 'from-[#080314] to-[#13072b]', border: 'border-cyan-500' },
                      { id: 'emerald', name: 'Emerald Matrix', color: 'from-[#03120e] to-[#08211b]', border: 'border-emerald-500' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setTheme(t.id);
                          toast.success(`Applied ${t.name} theme!`);
                        }}
                        className={`p-2.5 rounded-xl border bg-gradient-to-b ${t.color} text-left transition-all cursor-pointer ${
                          theme === t.id
                            ? 'border-primary-500 ring-2 ring-primary-500/40 scale-105 shadow-md text-white'
                            : 'border-dark-border text-surface-400 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-bold">{t.name}</span>
                          {theme === t.id && <Check className="w-3.5 h-3.5 text-primary-400" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Logout button */}
            <div className="pt-4">
              <button
                onClick={logout}
                className="w-full py-3 rounded-xl bg-accent-red/10 border border-accent-red/20 text-accent-red hover:bg-accent-red/20 text-sm font-semibold flex items-center justify-center gap-2 transition-all"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </>
        )}

        {/* 2FA Section */}
        {activeSection === '2fa' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-dark-card border border-dark-border space-y-4">
              <div className="flex items-center gap-2 border-b border-dark-border/60 pb-2">
                <Shield className="w-4 h-4 text-accent-green" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Two-Factor Authentication</h3>
              </div>

              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-semibold text-white">Authenticator App (TOTP)</p>
                  <p className="text-xs text-surface-500">Google Authenticator, Authy, or 1Password</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${is2FAEnabled ? 'bg-accent-green/20 text-accent-green' : 'bg-surface-800 text-surface-400'}`}>
                  {is2FAEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              {is2FAEnabled ? (
                <button
                  onClick={handleDisable2FA}
                  className="w-full py-2.5 rounded-xl bg-accent-red/20 hover:bg-accent-red/30 text-accent-red text-xs font-semibold border border-accent-red/30 transition-all"
                >
                  Disable Two-Factor Authentication
                </button>
              ) : (
                <button
                  onClick={handleStart2FASetup}
                  className="w-full py-2.5 rounded-xl gradient-primary text-white text-xs font-bold shadow-lg shadow-primary-500/25 hover:opacity-95 transition-all"
                >
                  Set Up Two-Factor Authentication
                </button>
              )}
            </div>
          </div>
        )}

        {/* 2FA Setup Modal */}
        {show2FAModal && qrCodeData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in">
            <div className="w-full max-w-sm bg-dark-card border border-dark-border rounded-3xl p-5 shadow-2xl space-y-4 animate-scale-in">
              <div className="text-center">
                <div className="w-10 h-10 rounded-2xl bg-accent-green/20 text-accent-green flex items-center justify-center mx-auto mb-2">
                  <QrCode className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">Scan QR Code</h3>
                <p className="text-xs text-surface-400 mt-0.5">Scan this with your authenticator app</p>
              </div>

              <div className="flex justify-center p-3 bg-white rounded-2xl">
                <img src={qrCodeData.qrCode} alt="2FA QR Code" className="w-44 h-44" />
              </div>

              <div className="p-2.5 bg-dark-input rounded-xl text-center border border-dark-border">
                <p className="text-[10px] text-surface-400">Manual secret key:</p>
                <p className="text-xs font-mono font-bold text-primary-400 select-all">{qrCodeData.secret}</p>
              </div>

              <div>
                <input
                  type="text"
                  maxLength={6}
                  value={totpToken}
                  onChange={(e) => setTotpToken(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Enter 6-digit code"
                  className="w-full py-2.5 text-center text-lg tracking-[0.5em] bg-dark-input border border-dark-border rounded-xl text-white font-mono"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShow2FAModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleVerifyAndEnable2FA}
                  disabled={isVerifying2FA}
                  className="flex-1 py-2.5 rounded-xl gradient-primary text-white text-xs font-bold shadow-md shadow-primary-500/25"
                >
                  {isVerifying2FA ? 'Verifying...' : 'Verify & Enable'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Privacy & App Lock Section */}
        {activeSection === 'privacy' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-dark-card border border-dark-border space-y-4">
              <div>
                <label className="text-xs font-semibold text-surface-400 block mb-1.5">Who can see my Last Seen</label>
                <select
                  value={privacy.lastSeen || 'everyone'}
                  onChange={(e) => handleUpdatePrivacy('lastSeen', e.target.value)}
                  className="w-full bg-dark-input border border-dark-border text-white text-xs p-2.5 rounded-xl"
                >
                  <option value="everyone">Everyone</option>
                  <option value="friends">My Friends</option>
                  <option value="nobody">Nobody</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-surface-400 block mb-1.5">Online Status Visibility</label>
                <select
                  value={privacy.online || 'everyone'}
                  onChange={(e) => handleUpdatePrivacy('online', e.target.value)}
                  className="w-full bg-dark-input border border-dark-border text-white text-xs p-2.5 rounded-xl"
                >
                  <option value="everyone">Everyone</option>
                  <option value="friends">My Friends</option>
                  <option value="nobody">Nobody</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-surface-400 block mb-1.5">Profile Photo Visibility</label>
                <select
                  value={privacy.profilePhoto || 'everyone'}
                  onChange={(e) => handleUpdatePrivacy('profilePhoto', e.target.value)}
                  className="w-full bg-dark-input border border-dark-border text-white text-xs p-2.5 rounded-xl"
                >
                  <option value="everyone">Everyone</option>
                  <option value="friends">My Friends</option>
                  <option value="nobody">Nobody</option>
                </select>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div>
                  <p className="text-sm font-semibold text-white">Read Receipts</p>
                  <p className="text-xs text-surface-500">Show blue checkmarks when messages are read</p>
                </div>
                <input
                  type="checkbox"
                  checked={privacy.readReceipts !== false}
                  onChange={(e) => handleUpdatePrivacy('readReceipts', e.target.checked)}
                  className="w-5 h-5 accent-primary-500 rounded"
                />
              </div>

              {/* App Passcode Lock Section */}
              <div className="pt-4 border-t border-dark-border/70 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-primary-400" /> App Passcode & Biometric Lock
                    </p>
                    <p className="text-xs text-surface-500">Lock NexChat behind 4-digit PIN or fingerprint</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={isLockEnabled}
                    onChange={(e) => handleToggleAppLock(e.target.checked)}
                    className="w-5 h-5 accent-primary-500 rounded"
                  />
                </div>

                {isLockEnabled && (
                  <div className="space-y-3 pt-2 bg-dark-bg/60 p-3 rounded-xl border border-dark-border/50">
                    <div>
                      <label className="text-xs font-semibold text-surface-400 block mb-1">Auto-Lock Screen Timer</label>
                      <select
                        value={lockTimeout}
                        onChange={(e) => handleChangeLockTimeout(e.target.value)}
                        className="w-full bg-dark-input border border-dark-border text-white text-xs p-2 rounded-xl"
                      >
                        <option value="0">Immediately (when minimizing / switching tabs)</option>
                        <option value="1">After 1 minute of inactivity</option>
                        <option value="5">After 5 minutes of inactivity</option>
                        <option value="15">After 15 minutes of inactivity</option>
                      </select>
                    </div>

                    <button
                      onClick={() => setShowPinModal(true)}
                      className="w-full py-2 rounded-xl bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 text-xs font-semibold border border-primary-500/30 transition-all"
                    >
                      Change 4-Digit Passcode PIN
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PIN Setup Modal */}
        {showPinModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
            <div className="w-full max-w-sm bg-dark-card border border-dark-border rounded-3xl p-5 shadow-2xl space-y-4">
              <div className="text-center">
                <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-2 text-white shadow-lg shadow-primary-500/30">
                  <Lock className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-white">Set 4-Digit Passcode</h3>
                <p className="text-xs text-surface-400 mt-0.5">Enter a 4-digit PIN to secure your NexChat app</p>
              </div>

              <div>
                <input
                  type="password"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="••••"
                  className="w-full py-3 text-center text-2xl tracking-[1em] bg-dark-input border border-dark-border rounded-xl text-white font-mono"
                  autoFocus
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowPinModal(false);
                    setNewPin('');
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-300 text-xs font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePin}
                  className="flex-1 py-2.5 rounded-xl gradient-primary text-white text-xs font-semibold shadow-lg shadow-primary-500/25 transition-all"
                >
                  Save Passcode
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sounds Section */}
        {activeSection === 'sounds' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-dark-card border border-dark-border space-y-4">
              <div className="flex items-center gap-2 border-b border-dark-border/60 pb-2">
                <Volume2 className="w-4 h-4 text-purple-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Incoming Message Sounds</h3>
              </div>

              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-semibold text-white">Incoming Message Chime</p>
                  <p className="text-xs text-surface-500">Play alert sound when you receive messages</p>
                </div>
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => handleToggleSound(e.target.checked)}
                  className="w-5 h-5 accent-primary-500 rounded"
                />
              </div>

              {soundEnabled && (
                <div className="bg-dark-bg/60 p-3 rounded-xl border border-dark-border/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-surface-400">Choose Incoming Tone</label>
                    <button
                      type="button"
                      onClick={() => playIncomingMessageSound(receiveTone)}
                      className="px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                    >
                      <Play className="w-3 h-3 fill-current" /> Test Sound
                    </button>
                  </div>
                  <select
                    value={receiveTone}
                    onChange={(e) => handleChangeReceiveTone(e.target.value)}
                    className="w-full bg-dark-input border border-dark-border text-white text-xs p-2.5 rounded-xl"
                  >
                    <option value="classic">🎵 Classic Double Chime (Default)</option>
                    <option value="pluck">🔔 Pop & Pluck (Marimba Chord)</option>
                    <option value="crystal">✨ Crystal Sparkle (High Bell)</option>
                    <option value="ping">💬 Subtle Glass Ping</option>
                  </select>
                </div>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-dark-card border border-dark-border space-y-4">
              <div className="flex items-center gap-2 border-b border-dark-border/60 pb-2">
                <Music className="w-4 h-4 text-primary-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Outgoing Message Sounds</h3>
              </div>

              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-semibold text-white">Sent Message Sound</p>
                  <p className="text-xs text-surface-500">Play subtle sound when sending your messages</p>
                </div>
                <input
                  type="checkbox"
                  checked={sentSoundEnabled}
                  onChange={(e) => handleToggleSentSound(e.target.checked)}
                  className="w-5 h-5 accent-primary-500 rounded"
                />
              </div>

              {sentSoundEnabled && (
                <div className="bg-dark-bg/60 p-3 rounded-xl border border-dark-border/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-surface-400">Choose Sent Tone</label>
                    <button
                      type="button"
                      onClick={() => playSentMessageSound(sentTone)}
                      className="px-2.5 py-1 rounded-lg bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                    >
                      <Play className="w-3 h-3 fill-current" /> Test Sound
                    </button>
                  </div>
                  <select
                    value={sentTone}
                    onChange={(e) => handleChangeSentTone(e.target.value)}
                    className="w-full bg-dark-input border border-dark-border text-white text-xs p-2.5 rounded-xl"
                  >
                    <option value="swoosh">🚀 Smooth Swoosh (Default)</option>
                    <option value="pop">🫧 Bubble Pop</option>
                    <option value="click">⚡ Soft Click</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notifications Section */}
        {activeSection === 'notifications' && (
          <div className="space-y-4">
            {/* Background Web Push Card */}
            <div className="p-4 rounded-2xl bg-dark-card border border-dark-border space-y-3">
              <div className="flex items-center gap-2 border-b border-dark-border/60 pb-2">
                <Radio className="w-4 h-4 text-accent-green" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Background Web Push</h3>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Receive Alerts When Browser Is Closed</p>
                <p className="text-xs text-surface-400 mt-0.5">
                  Enables OS push notifications on Windows, Mac, Android, and iOS through Service Workers.
                </p>
              </div>
              <button
                onClick={handleEnableWebPush}
                disabled={isPushRegistering}
                className="w-full py-2.5 rounded-xl gradient-primary text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-primary-500/20 hover:opacity-95 transition-all"
              >
                <Bell className="w-4 h-4" />
                {isPushRegistering ? 'Connecting...' : 'Enable & Verify Background Web Push'}
              </button>
            </div>

            {/* Notification Alerts Card */}
            <div className="p-4 rounded-2xl bg-dark-card border border-dark-border space-y-4">
              <div className="flex items-center gap-2 border-b border-dark-border/60 pb-2">
                <Bell className="w-4 h-4 text-primary-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">System Alerts & Popups</h3>
              </div>

              {[
                { key: 'messages', label: 'Message Popups', desc: 'Show desktop/phone system notifications for DMs' },
                { key: 'calls', label: 'Call Notifications', desc: 'Ringtone and incoming call alerts' },
                { key: 'groups', label: 'Group Alerts', desc: 'Notifications for group messages' },
                { key: 'showPreview', label: 'Show Message Preview', desc: 'Show message text inside popup notifications' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm font-semibold text-white">{label}</p>
                    <p className="text-xs text-surface-500">{desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications[key] !== false}
                    onChange={(e) => handleUpdateNotification(key, e.target.checked)}
                    className="w-5 h-5 accent-primary-500 rounded"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sessions Section */}
        {activeSection === 'sessions' && (
          <div className="space-y-4">
            <button
              onClick={handleRevokeAllSessions}
              className="w-full py-2.5 rounded-xl bg-accent-red/20 text-accent-red hover:bg-accent-red/30 text-xs font-semibold border border-accent-red/30 transition-all"
            >
              Log Out From All Other Devices
            </button>

            <div className="space-y-2">
              {sessions.map((sess) => (
                <div
                  key={sess.id}
                  className="p-3.5 rounded-2xl bg-dark-card border border-dark-border flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <Smartphone className="w-5 h-5 text-primary-400" />
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {sess.deviceName}
                        {sess.isCurrent && (
                          <span className="ml-2 px-1.5 py-0.5 bg-accent-green/20 text-accent-green text-[10px] rounded-md">
                            Current Device
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-surface-500">
                        {sess.browser} • Last active: {new Date(sess.lastActive).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {!sess.isCurrent && (
                    <button
                      onClick={() => handleRevokeSession(sess.id)}
                      className="p-1.5 text-surface-400 hover:text-accent-red transition-colors"
                      title="Revoke session"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
