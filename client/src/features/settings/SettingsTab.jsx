import { useState, useEffect } from 'react';
import { Shield, Bell, Lock, Smartphone, Moon, Sun, Trash2, LogOut, Check, ChevronRight, Volume2, Music, Play } from 'lucide-react';
import api from '../../lib/api';
import useAuthStore from '../../stores/authStore';
import useUIStore from '../../stores/uiStore';
import { playIncomingMessageSound, playSentMessageSound } from '../../lib/notifications';
import toast from 'react-hot-toast';

export default function SettingsTab({ onOpenProfile }) {
  const { user, updateUser, logout } = useAuthStore();
  const { theme, setTheme } = useUIStore();

  const [privacy, setPrivacy] = useState(user?.privacy || {});
  const [notifications, setNotifications] = useState(user?.notificationSettings || {});
  const [sessions, setSessions] = useState([]);
  const [activeSection, setActiveSection] = useState('main'); // 'main', 'privacy', 'notifications', 'sessions', 'appearance'

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
    } catch (err) {
      toast.error('Failed to update privacy');
    }
  };

  const handleUpdateNotification = async (field, value) => {
    try {
      const newNotifs = { ...notifications, [field]: value };
      setNotifications(newNotifs);
      await api.put('/users/notifications', { [field]: value });
      updateUser({ notificationSettings: newNotifs });
      toast.success('Notification settings saved');
    } catch (err) {
      toast.error('Failed to update settings');
    }
  };

  const handleRevokeSession = async (sessionId) => {
    try {
      await api.delete(`/auth/sessions/${sessionId}`);
      toast.success('Session revoked');
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      toast.error('Failed to revoke session');
    }
  };

  const handleRevokeAllSessions = async () => {
    try {
      await api.delete('/auth/sessions');
      toast.success('All other devices logged out');
      loadSessions();
    } catch (err) {
      toast.error('Failed to revoke sessions');
    }
  };

  return (
    <div className="flex flex-col h-full bg-dark-bg">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-dark-border">
        {activeSection !== 'main' && (
          <button
            onClick={() => setActiveSection('main')}
            className="text-surface-400 hover:text-white p-1"
          >
            ←
          </button>
        )}
        <h1 className="text-xl font-bold text-white capitalize">
          {activeSection === 'main' ? 'Settings' : activeSection}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto hide-scrollbar p-4 space-y-4">
        {activeSection === 'main' && (
          <>
            {/* User Profile Card */}
            <div
              onClick={onOpenProfile}
              className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-dark-card border border-dark-border hover:bg-dark-hover transition-all cursor-pointer"
            >
              <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center font-bold text-white text-lg overflow-hidden flex-shrink-0">
                {user?.avatar?.url ? (
                  <img src={user.avatar.url} alt="" className="w-full h-full object-cover" />
                ) : (
                  user?.displayName?.charAt(0) || '?'
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-white truncate">{user?.displayName}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs text-surface-400 truncate">@{user?.username}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 bg-primary-500/20 text-primary-400 rounded-md border border-primary-500/30">
                    #{user?.userCode || '0000'}
                  </span>
                </div>
                <p className="text-xs text-primary-400 mt-1 font-medium">Edit Profile →</p>
              </div>
            </div>

            {/* Settings Options */}
            <div className="space-y-1.5 pt-2">
              <button
                onClick={() => setActiveSection('privacy')}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-dark-card hover:bg-dark-hover border border-dark-border transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary-500/20 text-primary-400 flex items-center justify-center">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-white">Privacy & Security</p>
                    <p className="text-xs text-surface-500">Last seen, online status, read receipts</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-surface-500" />
              </button>

              <button
                onClick={() => setActiveSection('notifications')}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-dark-card hover:bg-dark-hover border border-dark-border transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent-green/20 text-accent-green flex items-center justify-center">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-white">Notifications</p>
                    <p className="text-xs text-surface-500">Message tones, call alerts, preview</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-surface-500" />
              </button>

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

              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-dark-card hover:bg-dark-hover border border-dark-border transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent-yellow/20 text-yellow-400 flex items-center justify-center">
                    {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-white">Theme</p>
                    <p className="text-xs text-surface-500">{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-primary-400">Toggle</span>
              </button>
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

        {/* Privacy Section */}
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
                  <p className="text-xs text-surface-500">If turned off, you won&apos;t send or receive read receipts</p>
                </div>
                <input
                  type="checkbox"
                  checked={privacy.readReceipts !== false}
                  onChange={(e) => handleUpdatePrivacy('readReceipts', e.target.checked)}
                  className="w-5 h-5 accent-primary-500 rounded"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div>
                  <p className="text-sm font-semibold text-white">Typing Indicator</p>
                  <p className="text-xs text-surface-500">Show when you are composing a message</p>
                </div>
                <input
                  type="checkbox"
                  checked={privacy.typingIndicator !== false}
                  onChange={(e) => handleUpdatePrivacy('typingIndicator', e.target.checked)}
                  className="w-5 h-5 accent-primary-500 rounded"
                />
              </div>

              {/* App Passcode Lock Section */}
              <div className="pt-4 border-t border-dark-border/70 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-primary-400" /> App Passcode Lock
                    </p>
                    <p className="text-xs text-surface-500">Require 4-digit PIN or fingerprint to open NexChat</p>
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
            <div className="w-full max-w-sm bg-dark-surface border border-dark-border rounded-2xl p-5 shadow-2xl space-y-4">
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

        {/* Notifications Section */}
        {activeSection === 'notifications' && (
          <div className="space-y-4">
            {/* Sound & Chimes Card */}
            <div className="p-4 rounded-2xl bg-dark-card border border-dark-border space-y-4">
              <div className="flex items-center gap-2 border-b border-dark-border/60 pb-2">
                <Volume2 className="w-4 h-4 text-primary-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Message Sounds & Chimes</h3>
              </div>

              {/* Master Sound Switch */}
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-semibold text-white">Incoming Message Sound</p>
                  <p className="text-xs text-surface-500">Play chime when new messages arrive</p>
                </div>
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => handleToggleSound(e.target.checked)}
                  className="w-5 h-5 accent-primary-500 rounded"
                />
              </div>

              {/* Incoming Tone Picker */}
              {soundEnabled && (
                <div className="bg-dark-bg/60 p-3 rounded-xl border border-dark-border/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-surface-400">Incoming Message Tone</label>
                    <button
                      onClick={() => playIncomingMessageSound(receiveTone)}
                      className="px-2 py-1 rounded-lg bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 text-xs font-medium flex items-center gap-1 transition-all"
                    >
                      <Play className="w-3 h-3 fill-current" /> Preview
                    </button>
                  </div>
                  <select
                    value={receiveTone}
                    onChange={(e) => handleChangeReceiveTone(e.target.value)}
                    className="w-full bg-dark-input border border-dark-border text-white text-xs p-2 rounded-xl"
                  >
                    <option value="classic">🎵 Classic Double Chime</option>
                    <option value="pluck">🔔 Pop & Pluck (Marimba Chord)</option>
                    <option value="crystal">✨ Crystal Sparkle (High Bell)</option>
                    <option value="ping">💬 Subtle Glass Ping</option>
                  </select>
                </div>
              )}

              {/* Outgoing Message Sound */}
              <div className="flex items-center justify-between py-1 pt-2 border-t border-dark-border/40">
                <div>
                  <p className="text-sm font-semibold text-white">Outgoing Message Sound</p>
                  <p className="text-xs text-surface-500">Play subtle pop/swoosh when sending a message</p>
                </div>
                <input
                  type="checkbox"
                  checked={sentSoundEnabled}
                  onChange={(e) => handleToggleSentSound(e.target.checked)}
                  className="w-5 h-5 accent-primary-500 rounded"
                />
              </div>

              {/* Outgoing Tone Picker */}
              {sentSoundEnabled && (
                <div className="bg-dark-bg/60 p-3 rounded-xl border border-dark-border/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-surface-400">Outgoing Message Tone</label>
                    <button
                      onClick={() => playSentMessageSound(sentTone)}
                      className="px-2 py-1 rounded-lg bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 text-xs font-medium flex items-center gap-1 transition-all"
                    >
                      <Play className="w-3 h-3 fill-current" /> Preview
                    </button>
                  </div>
                  <select
                    value={sentTone}
                    onChange={(e) => handleChangeSentTone(e.target.value)}
                    className="w-full bg-dark-input border border-dark-border text-white text-xs p-2 rounded-xl"
                  >
                    <option value="swoosh">🚀 Smooth Swoosh (Default)</option>
                    <option value="pop">🫧 Bubble Pop</option>
                    <option value="click">⚡ Soft Click</option>
                  </select>
                </div>
              )}
            </div>

            {/* Notification Alerts Card */}
            <div className="p-4 rounded-2xl bg-dark-card border border-dark-border space-y-4">
              <div className="flex items-center gap-2 border-b border-dark-border/60 pb-2">
                <Bell className="w-4 h-4 text-primary-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">System Alerts</h3>
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
