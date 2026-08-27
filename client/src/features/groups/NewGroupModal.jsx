import { useState, useEffect, useRef } from 'react';
import {
  X, Users, Camera, Check, Search, Loader2, ArrowLeft,
  ArrowRight, Shield, Clock, Smile, Sparkles, Image as ImageIcon
} from 'lucide-react';
import api from '../../lib/api';
import useChatStore from '../../stores/chatStore';
import useUIStore from '../../stores/uiStore';
import toast from 'react-hot-toast';

export default function NewGroupModal({ onClose }) {
  const [step, setStep] = useState(1); // Step 1: Select Participants, Step 2: Group Info
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [friends, setFriends] = useState([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [isLoadingFriends, setIsLoadingFriends] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [disappearingDuration, setDisappearingDuration] = useState('off');
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

  const removeMember = (userId) => {
    setSelectedMemberIds((prev) => prev.filter((id) => id !== userId));
  };

  const handleNextStep = () => {
    if (selectedMemberIds.length === 0) {
      toast.error('Please select at least one contact to create a group');
      return;
    }
    setStep(2);
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) {
      toast.error('Please enter a group subject / name');
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading('Creating group...');
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
        disappearingTimer: disappearingDuration,
      });

      toast.success(`Group "${groupName}" created!`, { id: toastId });
      setActiveConversation(data.group);
      if (isMobile) setShowChatOnMobile(true);
      onClose();
    } catch (err) {
      console.error('Create group error:', err);
      toast.error(err.response?.data?.error || 'Failed to create group', { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredFriends = friends.filter((f) =>
    (f.displayName || f.username || '').toLowerCase().includes(searchFilter.toLowerCase()) ||
    (f.userCode || '').includes(searchFilter)
  );

  const selectedFriendsList = friends.filter((f) => selectedMemberIds.includes(f._id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div className="w-full max-w-md bg-dark-card border border-dark-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in">
        {/* WhatsApp-Style Wizard Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-dark-border bg-dark-card/90">
          <div className="flex items-center gap-3">
            {step === 2 ? (
              <button
                onClick={() => setStep(1)}
                className="w-8 h-8 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white flex items-center justify-center transition-all border border-dark-border cursor-pointer"
                title="Back to participants"
              >
                <ArrowLeft className="w-4 h-4 text-primary-400" />
              </button>
            ) : (
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white flex items-center justify-center transition-all border border-dark-border cursor-pointer"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <div>
              <h2 className="text-sm font-bold text-white">
                {step === 1 ? 'New Group' : 'Group Info'}
              </h2>
              <p className="text-[10px] text-surface-400">
                {step === 1
                  ? selectedMemberIds.length > 0
                    ? `${selectedMemberIds.length} of ${friends.length} selected`
                    : 'Add participants'
                  : 'Provide group subject and icon'
                }
              </p>
            </div>
          </div>

          <span className="text-[10px] font-bold text-primary-400 uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary-500/15 border border-primary-500/30">
            Step {step} of 2
          </span>
        </div>

        {/* STEP 1: Add Participants */}
        {step === 1 && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Selected Members Chips */}
            {selectedFriendsList.length > 0 && (
              <div className="p-3 border-b border-dark-border bg-dark-input/30 flex gap-2.5 overflow-x-auto hide-scrollbar">
                {selectedFriendsList.map((friend) => (
                  <div
                    key={friend._id}
                    className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full bg-dark-card border border-primary-500/40 shadow-sm flex-shrink-0 animate-scale-in"
                  >
                    {friend.avatar?.url ? (
                      <img src={friend.avatar.url} alt="" className="w-5 h-5 rounded-full object-cover" />
                    ) : (
                      <div className="w-5 h-5 rounded-full gradient-primary text-white text-[10px] font-bold flex items-center justify-center">
                        {(friend.displayName || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs text-white font-medium max-w-[80px] truncate">
                      {friend.displayName || friend.username}
                    </span>
                    <button
                      onClick={() => removeMember(friend._id)}
                      className="w-4 h-4 rounded-full bg-dark-hover text-surface-400 hover:text-white flex items-center justify-center ml-0.5"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Search Filter */}
            <div className="p-3 border-b border-dark-border">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Search contacts..."
                  className="w-full pl-10 pr-4 py-2 bg-dark-input text-xs text-white rounded-xl border border-dark-border focus:border-primary-500 focus:outline-none"
                  autoFocus
                />
              </div>
            </div>

            {/* Contact List */}
            <div className="flex-1 overflow-y-auto hide-scrollbar p-2 space-y-1 text-xs">
              {isLoadingFriends ? (
                <div className="py-12 flex flex-col items-center justify-center text-surface-500">
                  <Loader2 className="w-6 h-6 animate-spin text-primary-400 mb-2" />
                  <p>Loading friends...</p>
                </div>
              ) : filteredFriends.length === 0 ? (
                <div className="py-12 text-center text-surface-500">
                  No contacts found
                </div>
              ) : (
                filteredFriends.map((friend) => {
                  const isSelected = selectedMemberIds.includes(friend._id);
                  return (
                    <div
                      key={friend._id}
                      onClick={() => toggleSelectMember(friend._id)}
                      className={`p-2.5 rounded-2xl flex items-center justify-between gap-3 cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-primary-500/15 border border-primary-500/40 text-white'
                          : 'hover:bg-dark-hover text-surface-300 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative flex-shrink-0">
                          {friend.avatar?.url ? (
                            <img src={friend.avatar.url} alt="" className="w-10 h-10 rounded-full object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-full gradient-primary text-white font-bold flex items-center justify-center text-xs">
                              {(friend.displayName || 'U').charAt(0).toUpperCase()}
                            </div>
                          )}
                          {friend.isOnline && (
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-accent-green border-2 border-dark-card" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-white truncate text-xs">{friend.displayName || friend.username}</p>
                          <p className="text-[10px] text-surface-400 truncate">{friend.about || `User #${friend.userCode || '0000'}`}</p>
                        </div>
                      </div>

                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                        isSelected
                          ? 'gradient-primary border-transparent text-white shadow-sm'
                          : 'border-dark-border bg-dark-input'
                      }`}>
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Next Step Floating Action Button */}
            <div className="p-3 border-t border-dark-border bg-dark-card flex justify-end">
              <button
                onClick={handleNextStep}
                disabled={selectedMemberIds.length === 0}
                className="px-5 py-2.5 rounded-2xl gradient-primary text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-primary-500/25 hover:opacity-95 disabled:opacity-40 transition-all cursor-pointer"
              >
                <span>Next</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Group Details & Subject */}
        {step === 2 && (
          <form onSubmit={handleCreateGroup} className="flex-1 flex flex-col overflow-y-auto hide-scrollbar p-5 space-y-4 text-xs">
            {/* Group Icon & Subject Row */}
            <div className="flex items-center gap-4">
              <div className="relative group flex-shrink-0">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-16 h-16 rounded-full bg-dark-input border-2 border-dashed border-primary-500/60 hover:border-primary-400 flex items-center justify-center overflow-hidden cursor-pointer shadow-md transition-all"
                  title="Upload Group Photo"
                >
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-6 h-6 text-primary-400" />
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarSelect}
                />
              </div>

              <div className="flex-1">
                <label className="text-[11px] font-bold text-surface-400 uppercase tracking-wider block mb-1">
                  Group Subject
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Type group subject..."
                  maxLength={50}
                  className="w-full px-3.5 py-2.5 bg-dark-input border border-dark-border rounded-xl text-xs sm:text-sm text-white focus:border-primary-500 focus:outline-none"
                  required
                  autoFocus
                />
              </div>
            </div>

            {/* Group Description */}
            <div>
              <label className="text-[11px] font-bold text-surface-400 uppercase tracking-wider block mb-1">
                Group Description (Optional)
              </label>
              <textarea
                value={groupDescription}
                onChange={(e) => setGroupDescription(e.target.value)}
                placeholder="Group purpose, rules, topics..."
                rows={2}
                maxLength={300}
                className="w-full px-3.5 py-2 bg-dark-input border border-dark-border rounded-xl text-xs text-white focus:border-primary-500 focus:outline-none resize-none"
              />
            </div>

            {/* Disappearing Messages Settings */}
            <div className="p-3.5 rounded-2xl bg-dark-input/40 border border-dark-border space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary-400" />
                <span className="font-bold text-white text-xs">Disappearing Messages</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: 'off', label: 'Off' },
                  { id: '24h', label: '24 Hours' },
                  { id: '7d', label: '7 Days' },
                  { id: '90d', label: '90 Days' },
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDisappearingDuration(id)}
                    className={`py-1.5 rounded-xl border text-center font-semibold transition-all text-[10px] ${
                      disappearingDuration === id
                        ? 'gradient-primary border-transparent text-white shadow-sm'
                        : 'bg-dark-card border-dark-border text-surface-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Participants Summary */}
            <div className="p-3.5 rounded-2xl bg-dark-input/40 border border-dark-border">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-white text-xs">Participants ({selectedFriendsList.length})</span>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-[11px] text-primary-400 hover:underline font-semibold"
                >
                  Edit members
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto hide-scrollbar py-1">
                {selectedFriendsList.map((f) => (
                  <div key={f._id} className="text-center flex-shrink-0">
                    {f.avatar?.url ? (
                      <img src={f.avatar.url} alt="" className="w-8 h-8 rounded-full object-cover mx-auto" />
                    ) : (
                      <div className="w-8 h-8 rounded-full gradient-primary text-white text-[10px] font-bold flex items-center justify-center mx-auto">
                        {(f.displayName || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <p className="text-[9px] text-surface-400 max-w-[50px] truncate mt-0.5">{f.displayName || f.username}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Create Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-2xl gradient-primary text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25 hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Create Group</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
