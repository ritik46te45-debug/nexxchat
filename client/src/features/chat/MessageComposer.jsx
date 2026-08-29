import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Smile, Mic, X, Image, FileText, Camera,
  Reply, Loader2, Video, MapPin, Bell, BellOff, Plus,
  Sparkles, Check, Edit3, BarChart2, Gift, Image as ImageIcon
} from 'lucide-react';
import useChatStore from '../../stores/chatStore';
import useAuthStore from '../../stores/authStore';
import { getSocket } from '../../lib/socket';
import { playSentMessageSound } from '../../lib/notifications';
import CircularVideoRecorder from './CircularVideoRecorder';
import LocationPickerModal from './LocationPickerModal';
import CreatePollModal from './CreatePollModal';
import UnifiedPickerModal from './UnifiedPickerModal';
import VoiceRecorder from './VoiceRecorder';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function MessageComposer() {
  const {
    activeConversation, sendMessage, saveDraft, getDraft,
    editingMessage, setEditingMessage,
    replyingMessage, setReplyingMessage, editMessage
  } = useChatStore();
  const { user } = useAuthStore();

  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isViewOnce, setIsViewOnce] = useState(false);
  const [isSilent, setIsSilent] = useState(false);

  // Popover & modal triggers
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showUnifiedPicker, setShowUnifiedPicker] = useState(false);
  const [showVideoNoteRecorder, setShowVideoNoteRecorder] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaInputRef = useRef(null);
  const pickerRef = useRef(null);
  const attachMenuRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const conversationId = activeConversation?._id;

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [text]);

  // Click-outside listener for popovers
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowUnifiedPicker(false);
      }
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Prepopulate text on edit
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content || '');
      textareaRef.current?.focus();
    }
  }, [editingMessage]);

  // Load draft on conversation change
  useEffect(() => {
    if (conversationId && !editingMessage) {
      const draft = getDraft(conversationId);
      setText(draft || '');
    }
  }, [conversationId, editingMessage]);

  // Auto-focus on conversation switch
  useEffect(() => {
    textareaRef.current?.focus();
  }, [conversationId]);

  // Typing indicator
  const handleTyping = useCallback(() => {
    if (user?.privacy?.typingIndicator === false) return;
    const socket = getSocket();
    if (!socket || !conversationId) return;

    socket.emit('typing:start', { conversationId });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing:stop', { conversationId });
    }, 2000);
  }, [conversationId, user?.privacy?.typingIndicator]);

  const handleTextChange = (e) => {
    const value = e.target.value;
    setText(value);
    if (!editingMessage) {
      saveDraft(conversationId, value);
    }
    handleTyping();
  };

  // Keyboard shortcut: Enter to send, Shift+Enter for new line
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (editingMessage) {
        handleSaveEdit();
      } else {
        handleSend();
      }
    }
  };

  // Clipboard Image Paste handler (Ctrl+V)
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const pastedFiles = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1 || items[i].type.indexOf('video') !== -1) {
        const file = items[i].getAsFile();
        if (file) pastedFiles.push(file);
      }
    }

    if (pastedFiles.length > 0) {
      e.preventDefault();
      setFiles((prev) => [...prev, ...pastedFiles]);
      toast.success(`Pasted ${pastedFiles.length} image${pastedFiles.length > 1 ? 's' : ''}`);
    }
  };

  // Handle Save Edit
  const handleSaveEdit = async () => {
    if (!editingMessage || !text.trim()) return;
    try {
      await editMessage(editingMessage._id, text.trim());
      toast.success('Message updated');
      setEditingMessage(null);
      setText('');
      if (conversationId) saveDraft(conversationId, '');
    } catch {
      toast.error('Failed to edit message');
    }
  };

  // Send message — Instant zero-latency like WhatsApp
  const handleSend = () => {
    const trimmedText = text.trim();
    if (!trimmedText && files.length === 0) return;
    if (!conversationId) return;

    const socket = getSocket();
    if (socket) socket.emit('typing:stop', { conversationId });

    // 1. Upload files if any
    if (files.length > 0) {
      setIsUploading(true);
      const toastId = toast.loading(`Uploading ${files.length} attachment${files.length > 1 ? 's' : ''}...`);
      (async () => {
        try {
          for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);
            const { data } = await api.post('/upload/single', formData);

            const attachment = data.file;
            const msgType = ['image', 'video', 'audio', 'voice', 'document', 'file'].includes(attachment?.type)
              ? attachment.type
              : 'document';

            await sendMessage(conversationId, {
              type: msgType,
              content: trimmedText || '',
              attachments: [attachment],
              replyTo: replyingMessage?._id,
              isViewOnce: isViewOnce && (msgType === 'image' || msgType === 'video'),
              isSilent,
            });
          }
          if (!isSilent) playSentMessageSound();
          toast.success('Sent successfully!', { id: toastId });
          setFiles([]);
          setIsViewOnce(false);
          setText('');
          setReplyingMessage(null);
          if (conversationId) saveDraft(conversationId, '');
        } catch (error) {
          toast.error('Failed to upload file', { id: toastId });
        } finally {
          setIsUploading(false);
        }
      })();
      return;
    }

    // 2. Text-only message: INSTANT ZERO-LATENCY (0ms)
    if (trimmedText && files.length === 0) {
      const msgContent = trimmedText;
      const replyId = replyingMessage?._id;
      const silent = isSilent;

      // Clear input, play audio, and retain focus immediately
      setText('');
      setReplyingMessage(null);
      if (conversationId) saveDraft(conversationId, '');
      if (!silent) playSentMessageSound();
      textareaRef.current?.focus();

      // Trigger optimistic render & background HTTP post
      sendMessage(conversationId, {
        type: 'text',
        content: msgContent,
        replyTo: replyId,
        isSilent: silent,
      }).catch((err) => {
        console.error('Send message error:', err);
        toast.error('Failed to send message');
      });
    }
  };

  // Send Voice Message
  const handleSendVoice = async (audioBlob, duration) => {
    if (!conversationId) return;
    setIsVoiceRecording(false);
    setIsUploading(true);
    const toastId = toast.loading('Sending voice message...');

    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'voice_message.webm');
      const { data } = await api.post('/upload/single', formData);

      const attachment = {
        ...data.file,
        type: 'voice',
        duration,
      };

      await sendMessage(conversationId, {
        type: 'voice',
        attachments: [attachment],
        replyTo: replyingMessage?._id,
        isSilent,
      });

      if (!isSilent) playSentMessageSound();
      toast.success('Voice message sent!', { id: toastId });
    } catch {
      toast.error('Failed to send voice message', { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  // Send GIF
  const handleSendGif = async (gifUrl, title) => {
    if (!conversationId) return;
    setShowUnifiedPicker(false);
    try {
      await sendMessage(conversationId, {
        type: 'gif',
        content: title || 'GIF',
        attachments: [{
          type: 'image',
          url: gifUrl,
          fileName: `${title || 'animated'}.gif`,
        }],
        replyTo: replyingMessage?._id,
        isSilent,
      });
      if (!isSilent) playSentMessageSound();
    } catch {
      toast.error('Failed to send GIF');
    }
  };

  // Send Sticker
  const handleSendSticker = async (stickerUrl, name) => {
    if (!conversationId) return;
    setShowUnifiedPicker(false);
    try {
      await sendMessage(conversationId, {
        type: 'sticker',
        content: name || 'Sticker',
        attachments: [{
          type: 'image',
          url: stickerUrl,
          fileName: `${name || 'sticker'}.png`,
        }],
        replyTo: replyingMessage?._id,
        isSilent,
      });
      if (!isSilent) playSentMessageSound();
    } catch {
      toast.error('Failed to send sticker');
    }
  };

  // Send Poll
  const handleSendPoll = async (pollData) => {
    if (!conversationId) return;
    setShowPollModal(false);
    try {
      await sendMessage(conversationId, {
        type: 'poll',
        content: pollData.question,
        poll: pollData,
        isSilent,
      });
      if (!isSilent) playSentMessageSound();
      toast.success('Poll published!');
    } catch {
      toast.error('Failed to create poll');
    }
  };

  // Send Location
  const handleSendLocation = async (locationData) => {
    if (!conversationId) return;
    setShowLocationPicker(false);
    try {
      await sendMessage(conversationId, {
        type: 'location',
        content: locationData.name || 'Shared Location',
        location: locationData,
        isSilent,
      });
      if (!isSilent) playSentMessageSound();
      toast.success('Location shared!');
    } catch {
      toast.error('Failed to send location');
    }
  };

  // Send Video Note
  const handleSendVideoNote = async (videoBlob, duration) => {
    if (!conversationId) return;
    setShowVideoNoteRecorder(false);
    setIsUploading(true);
    const toastId = toast.loading('Sending video note...');

    try {
      const formData = new FormData();
      formData.append('file', videoBlob, 'video_note.webm');
      const { data } = await api.post('/upload/single', formData);

      const attachment = {
        ...data.file,
        type: 'video',
        duration,
      };

      await sendMessage(conversationId, {
        type: 'video_note',
        attachments: [attachment],
        isSilent,
      });

      if (!isSilent) playSentMessageSound();
      toast.success('Video note sent!', { id: toastId });
    } catch {
      toast.error('Failed to send video note', { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) {
      setFiles((prev) => [...prev, ...selected]);
    }
    setShowAttachMenu(false);
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="border-t border-dark-border bg-dark-card/90 backdrop-blur-xl p-2.5 sm:p-3.5 relative flex-shrink-0 safe-bottom">
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />
      <input
        ref={mediaInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Reply Banner */}
      {replyingMessage && (
        <div className="flex items-center justify-between px-3.5 py-2 mb-2 rounded-2xl bg-dark-input/80 border-l-4 border-primary-500 border border-dark-border text-xs animate-slide-up">
          <div className="flex items-center gap-2 min-w-0">
            <Reply className="w-4 h-4 text-primary-400 flex-shrink-0" />
            <div className="min-w-0">
              <span className="font-bold text-primary-400 block truncate">
                Replying to {replyingMessage.sender?.displayName || 'User'}
              </span>
              <span className="text-surface-400 truncate block text-[11px]">
                {replyingMessage.content || `[${replyingMessage.type}]`}
              </span>
            </div>
          </div>
          <button
            onClick={() => setReplyingMessage(null)}
            className="p-1 rounded-lg hover:bg-dark-hover text-surface-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Editing Banner */}
      {editingMessage && (
        <div className="flex items-center justify-between px-3.5 py-2 mb-2 rounded-2xl bg-primary-500/15 border border-primary-500/40 text-xs animate-slide-up">
          <div className="flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-primary-400" />
            <span className="font-bold text-white">Editing Message</span>
          </div>
          <button
            onClick={() => {
              setEditingMessage(null);
              setText('');
            }}
            className="p-1 rounded-lg hover:bg-dark-hover text-surface-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* File Attachment Previews Carousel */}
      {files.length > 0 && (
        <div className="flex gap-2 mb-2 overflow-x-auto pb-1 hide-scrollbar">
          {files.map((file, idx) => {
            const isImg = file.type.startsWith('image/');
            const previewUrl = isImg ? URL.createObjectURL(file) : null;

            return (
              <div
                key={idx}
                className="relative rounded-2xl bg-dark-input border border-dark-border p-2 flex items-center gap-2 min-w-[140px] max-w-[200px] flex-shrink-0 animate-scale-in"
              >
                {isImg && previewUrl ? (
                  <img src={previewUrl} alt="" className="w-10 h-10 rounded-xl object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-primary-500/20 text-primary-400 flex items-center justify-center font-bold text-xs">
                    <FileText className="w-5 h-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-white truncate">{file.name}</p>
                  <p className="text-[9px] text-surface-400">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
                <button
                  onClick={() => removeFile(idx)}
                  className="w-5 h-5 rounded-full bg-black/60 hover:bg-accent-red text-white flex items-center justify-center transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Main Composer Row */}
      {isVoiceRecording ? (
        <VoiceRecorder
          onSendVoice={handleSendVoice}
          onCancel={() => setIsVoiceRecording(false)}
        />
      ) : (
        <div className="flex items-end gap-1.5 sm:gap-2">
          {/* Unified + Attachment Action Button */}
          <div className="relative" ref={attachMenuRef}>
            <button
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
                showAttachMenu
                  ? 'gradient-primary text-white rotate-45 shadow-lg shadow-primary-500/30'
                  : 'bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white border border-dark-border'
              }`}
              title="Attachments & Tools"
            >
              <Plus className="w-5 h-5 transition-transform" />
            </button>

            {/* Floating Popover Action Menu */}
            {showAttachMenu && (
              <div className="absolute left-0 bottom-12 w-64 bg-dark-card border border-dark-border rounded-3xl p-2 shadow-2xl z-50 animate-scale-in space-y-1">
                <button
                  onClick={() => mediaInputRef.current?.click()}
                  className="w-full px-3.5 py-2.5 rounded-2xl hover:bg-dark-hover text-surface-200 hover:text-white flex items-center gap-3 text-xs font-semibold transition-all cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-xl bg-accent-purple/20 text-accent-purple flex items-center justify-center">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <span>Photos & Videos</span>
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full px-3.5 py-2.5 rounded-2xl hover:bg-dark-hover text-surface-200 hover:text-white flex items-center gap-3 text-xs font-semibold transition-all cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-xl bg-accent-blue/20 text-accent-blue flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  <span>Document / Files</span>
                </button>

                <button
                  onClick={() => {
                    setShowPollModal(true);
                    setShowAttachMenu(false);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-2xl hover:bg-dark-hover text-surface-200 hover:text-white flex items-center gap-3 text-xs font-semibold transition-all cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-xl bg-accent-green/20 text-accent-green flex items-center justify-center">
                    <BarChart2 className="w-4 h-4" />
                  </div>
                  <span>Create Poll</span>
                </button>

                <button
                  onClick={() => {
                    setShowLocationPicker(true);
                    setShowAttachMenu(false);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-2xl hover:bg-dark-hover text-surface-200 hover:text-white flex items-center gap-3 text-xs font-semibold transition-all cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-xl bg-accent-red/20 text-accent-red flex items-center justify-center">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <span>Share Location</span>
                </button>

                <button
                  onClick={() => {
                    setShowVideoNoteRecorder(true);
                    setShowAttachMenu(false);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-2xl hover:bg-dark-hover text-surface-200 hover:text-white flex items-center gap-3 text-xs font-semibold transition-all cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-xl bg-primary-500/20 text-primary-400 flex items-center justify-center">
                    <Video className="w-4 h-4" />
                  </div>
                  <span>Circular Video Note</span>
                </button>

                <div className="border-t border-dark-border pt-1 mt-1">
                  <button
                    onClick={() => setIsSilent(!isSilent)}
                    className="w-full px-3.5 py-2 rounded-2xl hover:bg-dark-hover text-surface-400 hover:text-white flex items-center justify-between text-xs transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      {isSilent ? <BellOff className="w-3.5 h-3.5 text-accent-red" /> : <Bell className="w-3.5 h-3.5 text-surface-400" />}
                      <span>Silent Delivery</span>
                    </div>
                    {isSilent && <Check className="w-3.5 h-3.5 text-primary-400" />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Text Input Capsule */}
          <div className="flex-1 min-w-0 bg-dark-input border border-dark-border focus-within:border-primary-500 rounded-3xl p-1.5 flex items-end gap-1.5 transition-all shadow-inner relative">
            {/* Unified Emojis / GIFs / Stickers Switcher */}
            <div className="relative" ref={pickerRef}>
              <button
                onClick={() => setShowUnifiedPicker(!showUnifiedPicker)}
                className={`p-2 rounded-2xl transition-all cursor-pointer ${
                  showUnifiedPicker
                    ? 'text-primary-400 bg-primary-500/20'
                    : 'text-surface-400 hover:text-white hover:bg-dark-hover'
                }`}
                title="Emojis, GIFs & Stickers"
              >
                <Smile className="w-5 h-5" />
              </button>

              {/* Active Unified Popover */}
              {showUnifiedPicker && (
                <div className="absolute left-0 bottom-12 z-50">
                  <UnifiedPickerModal
                    onSelectEmoji={(emoji) => setText((prev) => prev + emoji)}
                    onSelectGif={handleSendGif}
                    onSelectSticker={handleSendSticker}
                    onClose={() => setShowUnifiedPicker(false)}
                  />
                </div>
              )}
            </div>

            {/* Auto-expanding Multiline Textarea */}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onFocus={() => {
                window.scrollTo(0, 0);
                document.body.scrollTop = 0;
              }}
              placeholder={editingMessage ? 'Edit your message...' : 'Message...'}
              rows={1}
              className="flex-1 bg-transparent text-white text-xs sm:text-sm resize-none focus:outline-none placeholder:text-surface-500 py-2 px-1 max-h-36 hide-scrollbar leading-relaxed"
            />
          </div>

          {/* Dynamic Action Button: Voice Recorder / Video Note vs Send Button */}
          {editingMessage ? (
            <button
              onClick={handleSaveEdit}
              className="w-10 h-10 rounded-2xl gradient-primary text-white flex items-center justify-center shadow-lg shadow-primary-500/30 hover:opacity-90 active:scale-95 transition-all flex-shrink-0 cursor-pointer"
              title="Save Edit"
            >
              <Check className="w-5 h-5" />
            </button>
          ) : text.trim() || files.length > 0 ? (
            <button
              onClick={handleSend}
              disabled={isUploading}
              className="w-10 h-10 rounded-2xl gradient-primary text-white flex items-center justify-center shadow-lg shadow-primary-500/30 hover:opacity-90 active:scale-95 transition-all flex-shrink-0 cursor-pointer disabled:opacity-40"
              title="Send Message"
            >
              {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-0.5" />}
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowVideoNoteRecorder(true)}
                className="w-10 h-10 rounded-2xl bg-dark-input hover:bg-primary-500/20 text-surface-300 hover:text-primary-400 border border-dark-border flex items-center justify-center transition-all flex-shrink-0 cursor-pointer"
                title="Circular Video Note"
              >
                <Video className="w-5 h-5" />
              </button>
              <button
                onClick={() => setIsVoiceRecording(true)}
                className="w-10 h-10 rounded-2xl bg-dark-input hover:bg-primary-500/20 text-surface-300 hover:text-primary-400 border border-dark-border flex items-center justify-center transition-all flex-shrink-0 cursor-pointer"
                title="Record Voice Note"
              >
                <Mic className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Circular Video Note Modal */}
      {showVideoNoteRecorder && (
        <CircularVideoRecorder
          onSendVideoNote={handleSendVideoNote}
          onClose={() => setShowVideoNoteRecorder(false)}
        />
      )}

      {/* Location Picker Modal */}
      {showLocationPicker && (
        <LocationPickerModal
          onSendLocation={handleSendLocation}
          onClose={() => setShowLocationPicker(false)}
        />
      )}

      {/* Create Poll Modal */}
      {showPollModal && (
        <CreatePollModal
          onCreatePoll={handleSendPoll}
          onClose={() => setShowPollModal(false)}
        />
      )}
    </div>
  );
}
