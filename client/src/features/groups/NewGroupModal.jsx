import { useState, useEffect, useRef } from 'react';
import { X, Users, Camera, Check, Search, Loader2 } from 'lucide-react';
import api from '../../lib/api';
import useChatStore from '../../stores/chatStore';
import useUIStore from '../../stores/uiStore';
import toast from 'react-hot-toast';

export default function NewGroupModal({ onClose }) {
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [friends, setFriends] = useState([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [isLoadingFriends, setIsLoadingFriends] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const fileInputRef = useRef(null);

  const { setActiveConversation } = useChatStore();
  const { isMobile, setShowChatOnMobile } = useUIStore();

  useEffect(() => {
    loadFriends();
  }, []);

  const loadFriends = async () => {
    try {
      const { data } = await api.get('/friends');
      setFriends(data.friends || []);
    } catch (err) {
      console.error('Load friends error:', err);
    } finally {
      setIsLoadingFriends(false);
    }
  };

  const handleAvatarSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const toggleSelectMember = (userId) => {
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) {
      toast.error('Please enter group name');
      return;
    }

    if (selectedMemberIds.length === 0) {
      toast.error('Please select at least one friend for the group');
      return;
    }

    setIsSubmitting(true);
    try {
      let groupAvatar = { url: '', publicId: '' };

      if (avatarFile) {
        const formData = new FormData();
        formData.append('file', avatarFile);
        const { data } = await api.post('/upload/single', formData);
        groupAvatar = { url: data.file.url, publicId: data.file.publicId };
      }

      const { data } = await api.post('/conversations/group', {
        groupName: groupName.trim(),
        groupDescription: groupDescription.trim(),
        memberIds: selectedMemberIds,
        groupAvatar,
      });

      toast.success(`Group "${groupName}" created!`);
      setActiveConversation(data.group);
      if (isMobile) setShowChatOnMobile(true);
      onClose();
    } catch (err) {
      console.error('Create group error:', err);
      toast.error(err.response?.data?.error || 'Failed to create group');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredFriends = friends.filter((f) =>
    f.displayName?.toLowerCase().includes(searchFilter.toLowerCase()) ||
    f.username?.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md glass-card overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <h2 className="text-lg font-bold text-white">Create New Group</h2>
          <button onClick={onClose} className="text-surface-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleCreateGroup} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Avatar & Group Name */}
          <div className="flex items-center gap-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-16 h-16 rounded-2xl bg-dark-input border border-dark-border hover:border-primary-500/50 flex flex-col items-center justify-center text-surface-400 cursor-pointer overflow-hidden relative group transition-all flex-shrink-0"
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
              ) : (
                <>
                  <Camera className="w-6 h-6 mb-1" />
                  <span className="text-[9px] font-semibold">Icon</span>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarSelect}
            />

            <div className="flex-1">
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group Name..."
                maxLength={100}
                className="w-full px-3.5 py-2.5 bg-dark-input border border-dark-border rounded-xl text-sm text-white placeholder-surface-500 input-focus font-semibold"
                required
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <textarea
              value={groupDescription}
              onChange={(e) => setGroupDescription(e.target.value)}
              placeholder="Group description (optional)..."
              rows={2}
              maxLength={500}
              className="w-full px-3.5 py-2.5 bg-dark-input border border-dark-border rounded-xl text-xs text-white placeholder-surface-500 input-focus resize-none"
            />
          </div>

          {/* Select Members Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-surface-400 uppercase tracking-wider">
                Add Members ({selectedMemberIds.length})
              </label>
            </div>

            {/* Friend search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-500" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search friends..."
                className="w-full pl-8 pr-3 py-2 bg-dark-input border border-dark-border rounded-xl text-xs text-white placeholder-surface-500 input-focus"
              />
            </div>

            {/* Friends list checkbox */}
            <div className="max-h-52 overflow-y-auto hide-scrollbar space-y-1 pr-1">
              {isLoadingFriends ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 text-primary-400 animate-spin" />
                </div>
              ) : filteredFriends.length === 0 ? (
                <p className="text-xs text-surface-500 text-center py-6">No friends found</p>
              ) : (
                filteredFriends.map((f) => {
                  const isSelected = selectedMemberIds.includes(f._id);
                  return (
                    <div
                      key={f._id}
                      onClick={() => toggleSelectMember(f._id)}
                      className={`flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer ${
                        isSelected ? 'bg-primary-500/20 border border-primary-500/40' : 'hover:bg-dark-hover border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center font-bold text-white text-xs">
                          {f.displayName?.charAt(0) || '?'}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-white">{f.displayName}</p>
                          <p className="text-[10px] text-surface-500">@{f.username}</p>
                        </div>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                          isSelected
                            ? 'bg-primary-500 border-primary-500 text-white'
                            : 'border-dark-border bg-dark-input'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || selectedMemberIds.length === 0}
              className="w-full py-3 rounded-xl gradient-primary text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25 hover:opacity-95 disabled:opacity-50 transition-all"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Users className="w-4 h-4" />
                  Create Group
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
