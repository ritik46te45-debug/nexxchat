import { useState, useRef } from 'react';
import { X, Camera, Trash2, Check, Loader2 } from 'lucide-react';
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
  const fileInputRef = useRef(null);

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const { data } = await api.put('/users/avatar', formData);

      updateUser({ avatar: data.avatar });
      toast.success('Profile photo updated');
    } catch (err) {
      toast.error('Failed to update profile photo');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    try {
      await api.delete('/users/avatar');
      updateUser({ avatar: { url: '', publicId: '' } });
      toast.success('Avatar removed');
    } catch (err) {
      toast.error('Failed to remove avatar');
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
      toast.success('Profile saved');
      onClose();
    } catch (err) {
      toast.error('Failed to save profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md glass-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <h2 className="text-lg font-bold text-white">Edit Profile</h2>
          <button onClick={onClose} className="text-surface-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Profile Avatar Editor */}
        <div className="p-6 flex flex-col items-center border-b border-dark-border/50">
          <div className="relative group">
            <div className="w-24 h-24 rounded-full gradient-primary flex items-center justify-center text-3xl font-bold text-white overflow-hidden ring-4 ring-dark-border shadow-2xl">
              {user?.avatar?.url ? (
                <img src={user.avatar.url} alt="" className="w-full h-full object-cover" />
              ) : (
                user?.displayName?.charAt(0) || '?'
              )}
            </div>

            {/* Upload Overlay */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingAvatar}
              className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-xs transition-all cursor-pointer"
            >
              {isUploadingAvatar ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <Camera className="w-6 h-6 mb-1" />
                  Change
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-primary-400 font-semibold hover:underline"
            >
              Upload Photo
            </button>
            {user?.avatar?.url && (
              <>
                <span className="text-surface-500">•</span>
                <button
                  onClick={handleRemoveAvatar}
                  className="text-xs text-accent-red font-semibold hover:underline"
                >
                  Remove
                </button>
              </>
            )}
          </div>

          {/* 4-digit Unique User Code */}
          <div className="mt-3.5 flex items-center gap-2 bg-dark-input px-3.5 py-1.5 rounded-full border border-dark-border">
            <span className="text-xs text-surface-400">Unique ID:</span>
            <span className="text-xs font-mono font-bold text-primary-400 tracking-wider">
              #{user?.userCode || '0000'}
            </span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(user?.userCode || '0000');
                toast.success(`Copied 4-digit code #${user?.userCode || '0000'}`);
              }}
              className="text-[10px] text-surface-400 hover:text-white ml-1 px-2 py-0.5 rounded-md bg-dark-hover transition-all"
            >
              Copy
            </button>
          </div>
        </div>

        {/* Profile Form */}
        <form onSubmit={handleSaveProfile} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-surface-300 block mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-dark-input border border-dark-border rounded-xl text-sm text-white input-focus"
              required
              maxLength={50}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-surface-300 block mb-1">About / Bio</label>
            <textarea
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-dark-input border border-dark-border rounded-xl text-sm text-white input-focus resize-none"
              rows={2}
              maxLength={500}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-surface-300 block mb-1">Phone Number (Optional)</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 234 567 8900"
              className="w-full px-3.5 py-2.5 bg-dark-input border border-dark-border rounded-xl text-sm text-white input-focus"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl gradient-primary text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25 hover:opacity-95 disabled:opacity-50 transition-all"
            >
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
