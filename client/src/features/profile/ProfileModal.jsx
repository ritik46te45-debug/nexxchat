import { useState, useRef } from 'react';
import { X, Camera, Trash2, Check, Loader2, User, Eye, Sparkles } from 'lucide-react';
import api from '../../lib/api';
import useAuthStore from '../../stores/authStore';
import toast from 'react-hot-toast';

export default function ProfileModal({ onClose }) {
  const { user, updateUser } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [about, setAbout] = useState(user?.about || '');
  const [phone, setPhone] = useState(user?.phone || '');
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div className="w-full max-w-md bg-dark-card border border-dark-border rounded-3xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary-400" />
            <h2 className="text-base font-bold text-white">Your Profile & DP</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white flex items-center justify-center transition-all border border-dark-border cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

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
        <form onSubmit={handleSaveProfile} className="p-5 sm:p-6 space-y-3.5 text-xs">
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
