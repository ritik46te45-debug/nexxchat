import { useState, useEffect } from 'react';
import { Shield, Bell, Lock, Smartphone, Moon, Sun, Trash2, LogOut, Check, ChevronRight } from 'lucide-react';
import api from '../../lib/api';
import useAuthStore from '../../stores/authStore';
import useUIStore from '../../stores/uiStore';
import toast from 'react-hot-toast';

export default function SettingsTab({ onOpenProfile }) {
  const { user, updateUser, logout } = useAuthStore();
  const { theme, setTheme } = useUIStore();

  const [privacy, setPrivacy] = useState(user?.privacy || {});
  const [notifications, setNotifications] = useState(user?.notificationSettings || {});
  const [sessions, setSessions] = useState([]);
  const [activeSection, setActiveSection] = useState('main'); // 'main', 'privacy', 'notifications', 'sessions', 'appearance'

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
            </div>
          </div>
        )}

        {/* Notifications Section */}
        {activeSection === 'notifications' && (
          <div className="p-4 rounded-2xl bg-dark-card border border-dark-border space-y-4">
            {[
              { key: 'messages', label: 'Message Notifications', desc: 'Show notifications for new direct messages' },
              { key: 'calls', label: 'Call Notifications', desc: 'Ringtone and call alerts' },
              { key: 'groups', label: 'Group Alerts', desc: 'Notifications for group messages' },
              { key: 'sound', label: 'Sound', desc: 'Play sounds for incoming messages' },
              { key: 'showPreview', label: 'Show Preview', desc: 'Show message text in notification popup' },
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
