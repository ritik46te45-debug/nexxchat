import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Smile, Paperclip, Mic, X, Image, FileText, Camera, Reply, Loader2 } from 'lucide-react';
import useChatStore from '../../stores/chatStore';
import useAuthStore from '../../stores/authStore';
import { getSocket } from '../../lib/socket';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function MessageComposer() {
  const { activeConversation, sendMessage, saveDraft, getDraft } = useChatStore();
  const { user } = useAuthStore();
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isViewOnce, setIsViewOnce] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const conversationId = activeConversation?._id;

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
    // Obey user privacy settings for typing indicator
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

  // Send text message
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
          });
        }
        toast.success('Sent successfully!', { id: toastId });
        setFiles([]);
        setIsViewOnce(false);
        setText('');
      } catch (error) {
        const errMsg = error.response?.data?.error || error.message || 'Failed to upload file';
        toast.error(errMsg, { id: toastId });
        console.error('Upload error:', error);
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
        });
      } catch (error) {
        toast.error('Failed to send message');
      }
    }

    setText('');
    setReplyTo(null);
    saveDraft(conversationId, '');
    inputRef.current?.focus();
  };

  // Handle Enter key
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // File selection
  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files);
    if (selected.length > 10) {
      toast.error('Maximum 10 files at once');
      return;
    }
    setFiles(prev => [...prev, ...selected].slice(0, 10));
    e.target.value = '';
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Paste handler
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) setFiles(prev => [...prev, file]);
      }
    }
  };

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
        stream.getTracks().forEach(t => t.stop());

        // Upload voice message
        setIsUploading(true);
        try {
          const formData = new FormData();
          formData.append('file', audioBlob, 'voice_message.webm');
          const { data } = await api.post('/upload/single', formData);

          await sendMessage(conversationId, {
            type: 'voice',
            attachments: [data.file],
          });
        } catch (error) {
          toast.error('Failed to send voice message');
        } finally {
          setIsUploading(false);
          setIsRecording(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);

      // Emit recording indicator
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

  // Drag and drop
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles(prev => [...prev, ...droppedFiles].slice(0, 10));
  };

  return (
    <div
      className="border-t border-dark-border bg-dark-card/50 backdrop-blur-md safe-bottom"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-primary-500/10 border-2 border-dashed border-primary-500/50 rounded-2xl z-50 flex items-center justify-center animate-fade-in">
          <p className="text-primary-400 font-medium">Drop files here</p>
        </div>
      )}

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
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="w-16 h-16 rounded-lg object-cover border border-dark-border"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-dark-input border border-dark-border flex flex-col items-center justify-center gap-1">
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

      {/* Input area */}
      <div className="flex items-end gap-2 px-3 py-3">
        {/* Attachment */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-10 h-10 rounded-xl text-surface-400 hover:text-white hover:bg-dark-hover flex items-center justify-center transition-all flex-shrink-0"
          title="Attach file"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          accept="*/*"
        />

        {/* Text input */}
        {isRecording ? (
          <div className="flex-1 flex items-center gap-3 px-4 py-2.5 bg-dark-input border border-red-500/30 rounded-xl">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm text-red-400">Recording...</span>
            <div className="flex-1" />
            <button onClick={cancelRecording} className="text-surface-400 hover:text-white text-sm">
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Type a message..."
              rows={1}
              className="w-full px-4 py-2.5 bg-dark-input border border-dark-border rounded-xl text-sm text-white placeholder-surface-500 input-focus resize-none transition-all max-h-32"
              style={{ minHeight: '42px' }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
              }}
            />
          </div>
        )}

        {/* View Once Toggle Button for Photos & Videos */}
        {files.some(f => f.type.startsWith('image/') || f.type.startsWith('video/')) && (
          <button
            type="button"
            onClick={() => setIsViewOnce(!isViewOnce)}
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm transition-all flex-shrink-0 border ${
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
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0">
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          </div>
        ) : text.trim() || files.length > 0 ? (
          <button
            onClick={handleSend}
            className="w-10 h-10 rounded-xl gradient-primary text-white flex items-center justify-center flex-shrink-0 hover:opacity-90 transition-all shadow-lg shadow-primary-500/25 active:scale-95"
          >
            <Send className="w-5 h-5" />
          </button>
        ) : isRecording ? (
          <button
            onClick={stopRecording}
            className="w-10 h-10 rounded-xl bg-red-500 text-white flex items-center justify-center flex-shrink-0 hover:bg-red-600 transition-all active:scale-95"
          >
            <Send className="w-5 h-5" />
          </button>
        ) : (
          <button
            onMouseDown={startRecording}
            className="w-10 h-10 rounded-xl text-surface-400 hover:text-white hover:bg-dark-hover flex items-center justify-center flex-shrink-0 transition-all active:scale-95"
            title="Hold to record"
          >
            <Mic className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
