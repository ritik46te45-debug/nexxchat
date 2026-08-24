import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Send, Smile, Paperclip, Mic, X, Image, FileText, Camera,
  Reply, Loader2, Video, MapPin, Bell, BellOff, Plus, File,
  Sparkles, Check
} from 'lucide-react';
import useChatStore from '../../stores/chatStore';
import useAuthStore from '../../stores/authStore';
import { getSocket } from '../../lib/socket';
import { playSentMessageSound } from '../../lib/notifications';
import CircularVideoRecorder from './CircularVideoRecorder';
import LocationPickerModal from './LocationPickerModal';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function MessageComposer() {
  const { activeConversation, sendMessage, saveDraft, getDraft } = useChatStore();
  const { user } = useAuthStore();
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isViewOnce, setIsViewOnce] = useState(false);
  const [isSilent, setIsSilent] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showVideoNoteRecorder, setShowVideoNoteRecorder] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [isRecording, setIsRecording] = useState(false);

  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaInputRef = useRef(null);
  const attachMenuRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const conversationId = activeConversation?._id;

  // Click-outside listener for attachment popup menu
  useEffect(() => {
    if (!showAttachMenu) return;
    const handleClickOutside = (e) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAttachMenu]);

  // Load draft
  useEffect(() => {
    if (conversationId) {
      const draft = getDraft(conversationId);
      setText(draft);
    }
  }, [conversationId]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, [conversationId]);

  // Handle typing indicator
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
    saveDraft(conversationId, value);
    handleTyping();
  };

  // Send message
  const handleSend = async () => {
    if (!text.trim() && files.length === 0) return;
    if (!conversationId) return;

    const socket = getSocket();
    if (socket) socket.emit('typing:stop', { conversationId });

    // Handle file upload first
    if (files.length > 0) {
      setIsUploading(true);
      const toastId = toast.loading(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`);
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
            content: text.trim() || '',
            attachments: [attachment],
            replyTo: replyTo?._id,
            isViewOnce: isViewOnce && (msgType === 'image' || msgType === 'video'),
            isSilent,
          });
        }
        if (!isSilent) playSentMessageSound();
        toast.success('Sent successfully!', { id: toastId });
        setFiles([]);
        setIsViewOnce(false);
        setText('');
      } catch (error) {
        const errMsg = error.response?.data?.error || error.message || 'Failed to upload file';
        toast.error(errMsg, { id: toastId });
      } finally {
        setIsUploading(false);
      }
    }

    // Send text message
    if (text.trim() && files.length === 0) {
      try {
        await sendMessage(conversationId, {
          type: 'text',
          content: text.trim(),
          replyTo: replyTo?._id,
          isSilent,
        });
        if (!isSilent) playSentMessageSound();
      } catch (error) {
        toast.error('Failed to send message');
      }
    }

    setText('');
    setReplyTo(null);
    saveDraft(conversationId, '');
    inputRef.current?.focus();
  };

  // Send Circular Video Note
  const handleSendVideoNote = async (videoBlob, duration) => {
    if (!conversationId) return;
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
    } catch (err) {
      toast.error('Failed to send video note', { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  // Send Location
  const handleSendLocation = async (locationData) => {
    if (!conversationId) return;
    try {
      await sendMessage(conversationId, {
        type: 'location',
        content: locationData.name || 'Shared Location',
        location: {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          name: locationData.name || 'Shared Location',
          address: locationData.address || `${locationData.latitude}, ${locationData.longitude}`,
        },
        isSilent,
      });
      if (!isSilent) playSentMessageSound();
      toast.success('Location shared successfully!');
    } catch (err) {
      console.error('Send location error:', err);
      toast.error('Failed to share location');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files);
    if (selected.length > 10) {
      toast.error('Maximum 10 files at once');
      return;
    }
    setFiles((prev) => [...prev, ...selected].slice(0, 10));
    e.target.value = '';
    setShowAttachMenu(false);
  };

  const removeFile = (index) => {
    setFiles((prev) => {
      const removed = prev[index];
      if (removed && removed.type.startsWith('image/')) {
        const url = filePreviews[index];
        if (url) URL.revokeObjectURL(url);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const filePreviews = useMemo(() => {
    return files.map((file) => {
      if (file.type.startsWith('image/')) {
        return URL.createObjectURL(file);
      }
      return null;
    });
  }, [files]);

  useEffect(() => {
    return () => {
      filePreviews.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [filePreviews]);

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((t) => t.stop());

        setIsUploading(true);
        try {
          const formData = new FormData();
          formData.append('file', audioBlob, 'voice_message.webm');
          const { data } = await api.post('/upload/single', formData);

          await sendMessage(conversationId, {
            type: 'voice',
            attachments: [data.file],
            isSilent,
          });
          if (!isSilent) playSentMessageSound();
        } catch (error) {
          toast.error('Failed to send voice message');
        } finally {
          setIsUploading(false);
          setIsRecording(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);

      const socket = getSocket();
      if (socket) socket.emit('recording:start', { conversationId });
    } catch (error) {
      toast.error('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    const socket = getSocket();
    if (socket) socket.emit('recording:stop', { conversationId });
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      audioChunksRef.current = [];
    }
    setIsRecording(false);
    const socket = getSocket();
    if (socket) socket.emit('recording:stop', { conversationId });
  };

  return (
    <div className="border-t border-dark-border bg-dark-card/90 backdrop-blur-md safe-bottom w-full flex-shrink-0 z-20 relative">
      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-dark-border animate-slide-up">
          <Reply className="w-4 h-4 text-primary-400 flex-shrink-0" />
          <div className="flex-1 min-w-0 border-l-2 border-primary-500 pl-2">
            <p className="text-xs text-primary-400 font-medium">{replyTo.sender?.displayName}</p>
            <p className="text-xs text-surface-400 truncate">{replyTo.content || replyTo.type}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-surface-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* File previews */}
      {files.length > 0 && (
        <div className="flex gap-2 px-4 py-3 overflow-x-auto hide-scrollbar border-b border-dark-border">
          {files.map((file, i) => (
            <div key={i} className="relative flex-shrink-0 group">
              {file.type.startsWith('image/') ? (
                <img
                  src={filePreviews[i] || ''}
                  alt={file.name}
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg object-cover border border-dark-border"
                />
              ) : (
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg bg-dark-input border border-dark-border flex flex-col items-center justify-center gap-1">
                  <FileText className="w-5 h-5 text-surface-400" />
                  <span className="text-[8px] text-surface-500 truncate w-14 text-center">{file.name}</span>
                </div>
              )}
              <button
                onClick={() => removeFile(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Silent Delivery Banner */}
      {isSilent && (
        <div className="px-3 py-1 bg-primary-500/10 border-b border-primary-500/20 flex items-center justify-between text-[11px] text-primary-300">
          <span className="flex items-center gap-1.5">
            <BellOff className="w-3 h-3 text-primary-400" /> Silent Message mode (no sound notification)
          </span>
          <button onClick={() => setIsSilent(false)} className="text-surface-400 hover:text-white underline text-[10px]">
            Turn Off
          </button>
        </div>
      )}

      {/* Attachment Popover Action Menu */}
      {showAttachMenu && (
        <div
          ref={attachMenuRef}
          className="absolute bottom-14 left-3 w-64 bg-dark-card/95 backdrop-blur-2xl border border-dark-border rounded-3xl p-2.5 shadow-2xl z-50 animate-scale-in space-y-1"
        >
          {/* Photos & Videos */}
          <button
            onClick={() => mediaInputRef.current?.click()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-dark-hover text-surface-200 hover:text-white transition-all text-xs font-semibold group"
          >
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30 group-hover:scale-110 transition-transform">
              <Image className="w-4 h-4" />
            </div>
            <span>Photos & Videos</span>
          </button>

          {/* Documents & Files */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-dark-hover text-surface-200 hover:text-white transition-all text-xs font-semibold group"
          >
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30 group-hover:scale-110 transition-transform">
              <File className="w-4 h-4" />
            </div>
            <span>Document / Files</span>
          </button>

          {/* Location */}
          <button
            onClick={() => {
              setShowAttachMenu(false);
              setShowLocationPicker(true);
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-dark-hover text-surface-200 hover:text-white transition-all text-xs font-semibold group"
          >
            <div className="w-8 h-8 rounded-xl bg-accent-red/20 text-accent-red flex items-center justify-center border border-accent-red/30 group-hover:scale-110 transition-transform">
              <MapPin className="w-4 h-4" />
            </div>
            <span>Share Location</span>
          </button>

          {/* Circular Video Note */}
          <button
            onClick={() => {
              setShowAttachMenu(false);
              setShowVideoNoteRecorder(true);
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-dark-hover text-surface-200 hover:text-white transition-all text-xs font-semibold group"
          >
            <div className="w-8 h-8 rounded-xl bg-accent-green/20 text-accent-green flex items-center justify-center border border-accent-green/30 group-hover:scale-110 transition-transform">
              <Video className="w-4 h-4" />
            </div>
            <span>Circular Video Note</span>
          </button>

          {/* Silent Delivery Toggle */}
          <button
            onClick={() => {
              const next = !isSilent;
              setIsSilent(next);
              setShowAttachMenu(false);
              toast(next ? '🔕 Silent delivery enabled' : '🔔 Normal delivery enabled');
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-dark-hover text-surface-200 hover:text-white transition-all text-xs font-semibold group"
          >
            <div className="w-8 h-8 rounded-xl bg-yellow-500/20 text-yellow-400 flex items-center justify-center border border-yellow-500/30 group-hover:scale-110 transition-transform">
              {isSilent ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            </div>
            <span>{isSilent ? 'Enable Chime Sound' : 'Send Silently'}</span>
          </button>
        </div>
      )}

      {/* Hidden File Inputs */}
      <input
        ref={mediaInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
        accept="image/*,video/*"
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
        accept="*/*"
      />

      {/* Main Composer Bar */}
      <div className="flex items-end gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 sm:py-2.5 w-full">
        {/* The + Action Button */}
        <button
          onClick={() => setShowAttachMenu(!showAttachMenu)}
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center transition-all flex-shrink-0 border ${
            showAttachMenu
              ? 'bg-primary-500 text-white border-primary-400 rotate-45 shadow-lg shadow-primary-500/30'
              : 'bg-dark-input text-surface-400 hover:text-white hover:bg-dark-hover border-dark-border'
          }`}
          title="Attachments & Actions"
        >
          <Plus className="w-5 h-5 transition-transform" />
        </button>

        {/* Text input */}
        {isRecording ? (
          <div className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 bg-dark-input border border-red-500/30 rounded-xl">
            <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
            <span className="text-xs sm:text-sm text-red-400 font-medium">Recording voice message...</span>
            <div className="flex-1" />
            <button onClick={cancelRecording} className="text-surface-400 hover:text-white text-xs sm:text-sm flex-shrink-0">
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex-1 min-w-0 relative">
            <textarea
              ref={inputRef}
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder={isSilent ? 'Type a silent message...' : 'Type a message...'}
              rows={1}
              className="w-full px-3.5 sm:px-4 py-2 sm:py-2.5 bg-dark-input border border-dark-border rounded-2xl text-xs sm:text-sm text-white placeholder-surface-500 input-focus resize-none transition-all max-h-32"
              style={{ minHeight: '38px' }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
              }}
            />
          </div>
        )}

        {/* View Once Toggle Button (shown when photos/videos are attached) */}
        {files.some((f) => f.type.startsWith('image/') || f.type.startsWith('video/')) && (
          <button
            type="button"
            onClick={() => setIsViewOnce(!isViewOnce)}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-bold text-xs sm:text-sm transition-all flex-shrink-0 border ${
              isViewOnce
                ? 'bg-primary-500 text-white border-primary-400 shadow-lg shadow-primary-500/40 ring-2 ring-primary-500/30'
                : 'bg-dark-input text-surface-400 border-dark-border hover:text-white hover:border-surface-400'
            }`}
            title={isViewOnce ? 'View Once is ON (photo/video self-destructs after 1 view)' : 'Set as View Once (photo/video)'}
          >
            ①
          </button>
        )}

        {/* Send / Mic button */}
        {isUploading ? (
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl gradient-primary flex items-center justify-center flex-shrink-0 shadow-md shadow-primary-500/25">
            <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 text-white animate-spin" />
          </div>
        ) : text.trim() || files.length > 0 ? (
          <button
            onClick={handleSend}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl gradient-primary text-white flex items-center justify-center flex-shrink-0 hover:opacity-90 transition-all shadow-lg shadow-primary-500/25 active:scale-95 cursor-pointer"
          >
            <Send className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        ) : isRecording ? (
          <button
            onClick={stopRecording}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-red-500 text-white flex items-center justify-center flex-shrink-0 hover:bg-red-600 transition-all active:scale-95 cursor-pointer"
          >
            <Send className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        ) : (
          <button
            onMouseDown={startRecording}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl text-surface-400 hover:text-white hover:bg-dark-hover flex items-center justify-center flex-shrink-0 transition-all active:scale-95 cursor-pointer"
            title="Hold to record voice message"
          >
            <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        )}
      </div>

      {/* Video Note Recorder Modal */}
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
    </div>
  );
}
