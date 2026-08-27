import { useState, useRef } from 'react';
import {
  X, Camera, Trash2, Check, Loader2, User, Eye, Sparkles,
  ArrowLeft, Lock, Globe, Users, Shield
} from 'lucide-react';
import api from '../../lib/api';
import useAuthStore from '../../stores/authStore';
import toast from 'react-hot-toast';

export default function ProfileModal({ onClose }) {
  const { user, updateUser } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [about, setAbout] = useState(user?.about || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [privacy, setPrivacy] = useState(user?.privacy || {
    profilePhoto: 'everyone',
    about: 'everyone',
    lastSeen: 'everyone',
    online: 'everyone',
  });

  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'privacy'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [showFullPhoto, setShowFullPhoto] = useState(false);
  const fileInputRef = useRef(null);

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image size must be less than 10MB');
      return;
    }

    setIsUploadingAvatar(true);
    const toastId = toast.loading('Uploading profile picture...');
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const { data } = await api.put('/users/avatar', formData);

      updateUser({ avatar: data.avatar });
      toast.success('Profile picture updated!', { id: toastId });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update profile photo', { id: toastId });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    const toastId = toast.loading('Removing picture...');
    try {
      await api.delete('/users/avatar');
      updateUser({ avatar: { url: '', publicId: '' } });
      toast.success('Profile picture removed', { id: toastId });
    } catch (err) {
      toast.error('Failed to remove avatar', { id: toastId });
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { data } = await api.put('/users/profile', {
        displayName: displayName.trim(),
        about: about.trim(),
        phone: phone.trim(),
      });

      updateUser(data.user);
      toast.success('Profile saved successfully!');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePrivacy = async (field, value) => {
    try {
      const newPrivacy = { ...privacy, [field]: value };
      setPrivacy(newPrivacy);
      await api.put('/users/privacy', { [field]: value });
      updateUser({ privacy: newPrivacy });
      toast.success(`Updated ${field} privacy to ${value}`);
    } catch (err) {
      toast.error('Failed to update privacy');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div className="w-full max-w-md bg-dark-card border border-dark-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in">
        {/* Header with Back Button */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-dark-border bg-dark-card/90">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-300 hover:text-white transition-all border border-dark-border cursor-pointer text-xs font-semibold"
            title="Go Back"
          >
            <ArrowLeft className="w-4 h-4 text-primary-400" />
            <span>Back</span>
          </button>

          <h2 className="text-sm font-bold text-white">Profile & Privacy</h2>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white flex items-center justify-center transition-all border border-dark-border cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 p-1.5 border-b border-dark-border bg-dark-input/40 text-xs">
          <button
            onClick={() => setActiveTab('profile')}
            className={`py-2 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'profile'
                ? 'gradient-primary text-white shadow-sm'
                : 'text-surface-400 hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Edit Profile</span>
          </button>
          <button
            onClick={() => setActiveTab('privacy')}
            className={`py-2 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'privacy'
                ? 'gradient-primary text-white shadow-sm'
                : 'text-surface-400 hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Who Can See Me</span>
          </button>
        </div>

        {/* Body Container */}
        <div className="flex-1 overflow-y-auto hide-scrollbar">
          {activeTab === 'profile' ? (
            <div>
              {/* Profile Avatar Editor */}
              <div className="p-6 flex flex-col items-center border-b border-dark-border/60 bg-dark-input/30">
                <div className="relative group">
                  {/* Avatar Circle */}
                  <div
                    onClick={() => user?.avatar?.url && setShowFullPhoto(true)}
                    className="w-28 h-28 rounded-full gradient-primary flex items-center justify-center text-4xl font-bold text-white overflow-hidden ring-4 ring-primary-500/40 shadow-2xl cursor-pointer relative"
                    title={user?.avatar?.url ? 'Click to view full photo' : 'Your Avatar'}
                  >
                    {user?.avatar?.url ? (
                      <img src={user.avatar.url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      user?.displayName?.charAt(0) || '?'
                    )}

                    {/* Upload Hover Overlay */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-xs transition-all cursor-pointer"
                    >
                      {isUploadingAvatar ? (
                        <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
                      ) : (
                        <>
                          <Camera className="w-6 h-6 mb-1 text-primary-300" />
                          <span className="font-bold text-[11px]">Change DP</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Quick Camera FAB button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingAvatar}
                    className="absolute bottom-0 right-0 w-8 h-8 rounded-full gradient-primary text-white flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all border-2 border-dark-card cursor-pointer"
                    title="Upload New Photo"
                  >
                    <Camera className="w-4 h-4" />
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>

                {/* Action links */}
                <div className="flex items-center gap-3 mt-3.5">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-primary-400 font-bold hover:underline cursor-pointer"
                  >
                    Upload New Photo
                  </button>
                  {user?.avatar?.url && (
                    <>
                      <span className="text-surface-500">•</span>
                      <button
                        onClick={handleRemoveAvatar}
                        className="text-xs text-accent-red font-bold hover:underline cursor-pointer"
                      >
                        Remove Photo
                      </button>
                    </>
                  )}
                </div>

                {/* 4-digit Unique User Code & Username */}
                <div className="mt-3.5 flex items-center gap-2 bg-dark-input px-3.5 py-1.5 rounded-2xl border border-dark-border">
                  <span className="text-xs text-surface-400 font-medium">@{user?.username || 'user'}</span>
                  <span className="text-surface-500">•</span>
                  <span className="text-xs font-mono font-bold text-primary-400 tracking-wider">
                    #{user?.userCode || '0000'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(user?.userCode || '0000');
                      toast.success(`Copied 4-digit code #${user?.userCode || '0000'}`);
                    }}
                    className="text-[10px] text-surface-400 hover:text-white ml-1 px-2 py-0.5 rounded-lg bg-dark-hover transition-all cursor-pointer font-bold"
                  >
                    Copy
                  </button>
                </div>
              </div>

              {/* Profile Edit Form */}
              <form onSubmit={handleSaveProfile} className="p-5 space-y-3.5 text-xs">
                <div>
                  <label className="text-[11px] font-bold text-surface-400 uppercase tracking-wider block mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-dark-input border border-dark-border rounded-xl text-xs sm:text-sm text-white focus:border-primary-500 focus:outline-none"
                    required
                    maxLength={50}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-surface-400 uppercase tracking-wider block mb-1">
                    About / Bio
                  </label>
                  <textarea
                    value={about}
                    onChange={(e) => setAbout(e.target.value)}
                    placeholder="Tell friends about yourself..."
                    className="w-full px-3.5 py-2.5 bg-dark-input border border-dark-border rounded-xl text-xs sm:text-sm text-white focus:border-primary-500 focus:outline-none resize-none"
                    rows={2}
                    maxLength={500}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-surface-400 uppercase tracking-wider block mb-1">
                    Phone Number (Optional)
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 234 567 8900"
                    className="w-full px-3.5 py-2.5 bg-dark-input border border-dark-border rounded-xl text-xs sm:text-sm text-white focus:border-primary-500 focus:outline-none"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 rounded-xl gradient-primary text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25 hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Profile Changes'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* Privacy & Visibility Settings */
            <div className="p-5 space-y-5 text-xs">
              <div>
                <h3 className="font-bold text-white text-sm mb-1">Profile Visibility Rules</h3>
                <p className="text-surface-400 text-[11px]">
                  Control who is allowed to see your profile picture, bio, and online presence.
                </p>
              </div>

              {/* 1. Profile Photo Privacy */}
              <div className="space-y-2 p-3.5 rounded-2xl bg-dark-input/60 border border-dark-border">
                <div className="flex items-center gap-2 mb-1">
                  <Camera className="w-4 h-4 text-primary-400" />
                  <span className="font-bold text-white">Who can see my Profile Photo (DP)?</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'everyone', label: 'Everyone', icon: Globe },
                    { id: 'contacts', label: 'Friends', icon: Users },
                    { id: 'nobody', label: 'Nobody', icon: Lock },
                  ].map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleUpdatePrivacy('profilePhoto', id)}
                      className={`p-2 rounded-xl border text-center font-semibold transition-all flex flex-col items-center gap-1 ${
                        (privacy.profilePhoto || 'everyone') === id
                          ? 'gradient-primary border-transparent text-white shadow-sm'
                          : 'bg-dark-card border-dark-border text-surface-400 hover:text-white'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span className="text-[11px]">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. About / Bio Privacy */}
              <div className="space-y-2 p-3.5 rounded-2xl bg-dark-input/60 border border-dark-border">
                <div className="flex items-center gap-2 mb-1">
                  <User className="w-4 h-4 text-accent-green" />
                  <span className="font-bold text-white">Who can see my About / Bio?</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'everyone', label: 'Everyone', icon: Globe },
                    { id: 'contacts', label: 'Friends', icon: Users },
                    { id: 'nobody', label: 'Nobody', icon: Lock },
                  ].map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleUpdatePrivacy('about', id)}
                      className={`p-2 rounded-xl border text-center font-semibold transition-all flex flex-col items-center gap-1 ${
                        (privacy.about || 'everyone') === id
                          ? 'gradient-primary border-transparent text-white shadow-sm'
                          : 'bg-dark-card border-dark-border text-surface-400 hover:text-white'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span className="text-[11px]">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Last Seen & Online Privacy */}
              <div className="space-y-2 p-3.5 rounded-2xl bg-dark-input/60 border border-dark-border">
                <div className="flex items-center gap-2 mb-1">
                  <Eye className="w-4 h-4 text-accent-blue" />
                  <span className="font-bold text-white">Who can see my Last Seen & Online?</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'everyone', label: 'Everyone', icon: Globe },
                    { id: 'contacts', label: 'Friends', icon: Users },
                    { id: 'nobody', label: 'Nobody', icon: Lock },
                  ].map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleUpdatePrivacy('lastSeen', id)}
                      className={`p-2 rounded-xl border text-center font-semibold transition-all flex flex-col items-center gap-1 ${
                        (privacy.lastSeen || 'everyone') === id
                          ? 'gradient-primary border-transparent text-white shadow-sm'
                          : 'bg-dark-card border-dark-border text-surface-400 hover:text-white'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span className="text-[11px]">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-primary-500/10 border border-primary-500/20 text-surface-300 text-[11px] leading-relaxed">
                ℹ️ When set to <strong>"Everyone"</strong>, other NexChat members can see your avatar photo and bio when adding you or messaging you.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full Photo Modal Viewer */}
      {showFullPhoto && user?.avatar?.url && (
        <div
          onClick={() => setShowFullPhoto(false)}
          className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center p-4 animate-fade-in cursor-pointer"
        >
          <div className="relative max-w-sm sm:max-w-md w-full bg-dark-card border border-dark-border rounded-3xl overflow-hidden p-2 shadow-2xl">
            <img src={user.avatar.url} alt="" className="w-full h-auto rounded-2xl object-cover" />
            <p className="text-center text-xs font-bold text-white mt-2 mb-1">{user.displayName}</p>
          </div>
        </div>
      )}
    </div>
  );
}
