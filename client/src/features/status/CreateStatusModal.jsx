import { useState, useRef } from 'react';
import { X, Image as ImageIcon, Type, Palette, Send, Loader2 } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const BG_COLORS = [
  '#0f172a', '#3b0764', '#1e1b4b', '#14532d',
  '#701a75', '#7c2d12', '#18181b', '#0369a1'
];

export default function CreateStatusModal({ onClose, onCreated }) {
  const [statusType, setStatusType] = useState('text'); // 'text', 'image', 'video'
  const [textContent, setTextContent] = useState('');
  const [bgColor, setBgColor] = useState(BG_COLORS[0]);
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState('');
  const [caption, setCaption] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    if (selected.type.startsWith('image/')) {
      setStatusType('image');
    } else if (selected.type.startsWith('video/')) {
      setStatusType('video');
    } else {
      toast.error('Only images and videos are supported for status');
      return;
    }

    setFile(selected);
    setFilePreview(URL.createObjectURL(selected));
  };

  const handleSubmit = async () => {
    if (statusType === 'text' && !textContent.trim()) {
      toast.error('Please enter status text');
      return;
    }

    setIsSubmitting(true);
    try {
      let mediaData = null;

      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        const { data } = await api.post('/upload/single', formData);
        mediaData = data.file;
      }

      await api.post('/status', {
        type: statusType,
        content: statusType === 'text' ? textContent.trim() : caption.trim(),
        media: mediaData,
        backgroundColor: bgColor,
      });

      toast.success('Status uploaded!');
      onCreated();
    } catch (err) {
      console.error('Upload status error:', err);
      toast.error('Failed to post status');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg glass-card overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setStatusType('text'); setFile(null); setFilePreview(''); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                statusType === 'text' ? 'bg-primary-500 text-white' : 'bg-dark-input text-surface-400 hover:text-white'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              Text Status
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                statusType !== 'text' ? 'bg-primary-500 text-white' : 'bg-dark-input text-surface-400 hover:text-white'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              Photo / Video
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          <button onClick={onClose} className="text-surface-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Canvas */}
        <div className="p-6 flex-1 flex flex-col items-center justify-center min-h-[300px] overflow-hidden relative">
          {statusType === 'text' ? (
            <div
              className="w-full h-72 rounded-2xl flex flex-col items-center justify-center p-6 text-center shadow-2xl transition-all"
              style={{ backgroundColor: bgColor }}
            >
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Type your story..."
                maxLength={400}
                className="w-full bg-transparent text-white text-center font-bold text-xl placeholder-white/50 focus:outline-none resize-none"
                rows={4}
                autoFocus
              />
              <span className="text-[10px] text-white/50 self-end mt-2">
                {textContent.length}/400
              </span>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center gap-3">
              {statusType === 'image' && filePreview && (
                <img src={filePreview} alt="Preview" className="max-h-72 rounded-2xl object-cover shadow-2xl border border-dark-border" />
              )}
              {statusType === 'video' && filePreview && (
                <video src={filePreview} controls className="max-h-72 rounded-2xl shadow-2xl border border-dark-border" />
              )}

              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add a caption..."
                className="w-full px-4 py-2.5 bg-dark-input border border-dark-border rounded-xl text-sm text-white placeholder-surface-500 input-focus"
              />
            </div>
          )}
        </div>

        {/* Footer Settings */}
        <div className="p-4 border-t border-dark-border flex items-center justify-between">
          {statusType === 'text' ? (
            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              {BG_COLORS.map((col) => (
                <button
                  key={col}
                  onClick={() => setBgColor(col)}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${
                    bgColor === col ? 'border-white scale-110' : 'border-transparent opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: col }}
                />
              ))}
            </div>
          ) : (
            <span className="text-xs text-surface-500">24-hour expiration</span>
          )}

          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-xl gradient-primary text-white text-sm font-semibold flex items-center gap-2 shadow-lg shadow-primary-500/25 hover:opacity-95 disabled:opacity-50 transition-all"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Send className="w-4 h-4" />
                Post Story
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
