import { useState, useMemo } from 'react';
import {
  X, Image, FileText, Link, Mic, Pin, Star, Timer,
  Palette, Download, Trash2, ShieldAlert, User, Users,
  ExternalLink, ArrowRight, Play, Check
} from 'lucide-react';
import { format } from 'date-fns';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const WALLPAPERS = [
  { id: 'default', name: 'Default Dark', bg: 'bg-dark-bg' },
  { id: 'midnight', name: 'Midnight Purple', bg: 'bg-gradient-to-b from-[#130d24] to-[#0a0614]' },
  { id: 'ocean', name: 'Deep Ocean', bg: 'bg-gradient-to-b from-[#0a192f] to-[#020c1b]' },
  { id: 'emerald', name: 'Emerald Night', bg: 'bg-gradient-to-b from-[#06201b] to-[#020e0c]' },
  { id: 'sunset', name: 'Neon Cyber', bg: 'bg-gradient-to-b from-[#1c0e29] to-[#0a0514]' },
];

export default function ChatDetailsPanel({
  conversation,
  messages = [],
  onClose,
  onJumpToMessage,
  onOpenImageViewer,
}) {
  const [activeTab, setActiveTab] = useState('media');
  const [activeWallpaper, setActiveWallpaper] = useState(
    localStorage.getItem(`nexchat_wp_${conversation?._id}`) || 'default'
  );

  const isGroup = conversation?.type === 'group' || conversation?.type === 'channel';

  // Extract shared media from message history
  const sharedMedia = useMemo(() => {
    const mediaList = [];
    messages.forEach((msg) => {
      if (msg.isDeletedForEveryone) return;
      if (msg.attachments && Array.isArray(msg.attachments)) {
        msg.attachments.forEach((att) => {
          if (att.type === 'image' || att.type === 'video') {
            mediaList.push({ ...att, messageId: msg._id, createdAt: msg.createdAt });
          }
        });
      }
    });
    return mediaList;
  }, [messages]);

  // Extract shared files
  const sharedFiles = useMemo(() => {
    const fileList = [];
    messages.forEach((msg) => {
      if (msg.isDeletedForEveryone) return;
      if (msg.attachments && Array.isArray(msg.attachments)) {
        msg.attachments.forEach((att) => {
          if (att.type === 'document' || att.type === 'file') {
            fileList.push({ ...att, messageId: msg._id, createdAt: msg.createdAt });
          }
        });
      }
    });
    return fileList;
  }, [messages]);

  // Extract shared links
  const sharedLinks = useMemo(() => {
    const linkList = [];
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    messages.forEach((msg) => {
      if (msg.isDeletedForEveryone) return;
      if (msg.linkPreview?.url) {
        linkList.push({
          url: msg.linkPreview.url,
          title: msg.linkPreview.title || msg.linkPreview.url,
          messageId: msg._id,
          createdAt: msg.createdAt,
        });
      } else if (msg.content) {
        const matches = msg.content.match(urlRegex);
        if (matches) {
          matches.forEach((u) => {
            linkList.push({ url: u, title: u, messageId: msg._id, createdAt: msg.createdAt });
          });
        }
      }
    });
    return linkList;
  }, [messages]);

  // Extract shared audio
  const sharedAudio = useMemo(() => {
    const audioList = [];
    messages.forEach((msg) => {
      if (msg.isDeletedForEveryone) return;
      if (msg.type === 'voice' || msg.type === 'audio') {
        const att = msg.attachments?.[0];
        if (att?.url) {
          audioList.push({ ...att, messageId: msg._id, createdAt: msg.createdAt });
        }
      }
    });
    return audioList;
  }, [messages]);

  const handleSelectWallpaper = (wpId) => {
    setActiveWallpaper(wpId);
    localStorage.setItem(`nexchat_wp_${conversation?._id}`, wpId);
    toast.success('Chat wallpaper updated');
  };

  const handleExportChat = (formatType = 'txt') => {
    if (!messages || messages.length === 0) {
      toast.error('No messages to export');
      return;
    }

    let fileContent = '';
    let mimeType = 'text/plain';
    let ext = 'txt';

    if (formatType === 'json') {
      fileContent = JSON.stringify(messages, null, 2);
      mimeType = 'application/json';
      ext = 'json';
    } else {
      fileContent = `NexChat Export - ${new Date().toLocaleString()}\n`;
      fileContent += `==========================================\n\n`;
      messages.forEach((m) => {
        const time = m.createdAt ? format(new Date(m.createdAt), 'yyyy-MM-dd HH:mm:ss') : '';
        const sender = m.sender?.displayName || m.sender?.username || 'User';
        const content = m.content || `[${m.type}]`;
        fileContent += `[${time}] ${sender}: ${content}\n`;
      });
    }

    const blob = new Blob([fileContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexchat_export_${conversation?._id}_${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Chat exported as .${ext}`);
  };

  return (
    <div className="w-full md:w-80 lg:w-96 bg-dark-card border-l border-dark-border flex flex-col h-full z-40 select-none animate-slide-left overflow-hidden">
      {/* Top Header */}
      <div className="h-16 px-4 border-b border-dark-border flex items-center justify-between flex-shrink-0">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Chat Details</h3>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white flex items-center justify-center transition-all border border-dark-border"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content Body */}
      <div className="flex-1 overflow-y-auto hide-scrollbar p-4 space-y-5 text-xs">
        {/* Media / Files / Links Tabs */}
        <div>
          <div className="flex border-b border-dark-border pb-2 gap-1 overflow-x-auto hide-scrollbar">
            {[
              { id: 'media', label: `Media (${sharedMedia.length})`, icon: Image },
              { id: 'files', label: `Files (${sharedFiles.length})`, icon: FileText },
              { id: 'links', label: `Links (${sharedLinks.length})`, icon: Link },
              { id: 'audio', label: `Audio (${sharedAudio.length})`, icon: Mic },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 flex-shrink-0 text-xs ${
                  activeTab === tab.id
                    ? 'gradient-primary text-white shadow-sm'
                    : 'text-surface-400 hover:text-white hover:bg-dark-hover'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="pt-3">
            {activeTab === 'media' && (
              sharedMedia.length === 0 ? (
                <p className="py-6 text-center text-surface-500">No shared media yet</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {sharedMedia.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => onOpenImageViewer && onOpenImageViewer(sharedMedia, idx)}
                      className="relative aspect-square rounded-xl overflow-hidden border border-dark-border hover:border-primary-500 transition-all group"
                    >
                      <img src={item.url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      {item.type === 'video' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                          <Play className="w-4 h-4 text-white fill-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )
            )}

            {activeTab === 'files' && (
              sharedFiles.length === 0 ? (
                <p className="py-6 text-center text-surface-500">No shared documents yet</p>
              ) : (
                <div className="space-y-1.5">
                  {sharedFiles.map((file, idx) => (
                    <a
                      key={idx}
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 rounded-xl bg-dark-input/60 hover:bg-dark-hover border border-dark-border flex items-center justify-between gap-2 transition-all group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-primary-400 flex-shrink-0" />
                        <span className="truncate text-white font-medium">{file.fileName || 'Document'}</span>
                      </div>
                      <Download className="w-3.5 h-3.5 text-surface-400 group-hover:text-white flex-shrink-0" />
                    </a>
                  ))}
                </div>
              )
            )}

            {activeTab === 'links' && (
              sharedLinks.length === 0 ? (
                <p className="py-6 text-center text-surface-500">No shared links yet</p>
              ) : (
                <div className="space-y-1.5">
                  {sharedLinks.map((link, idx) => (
                    <a
                      key={idx}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 rounded-xl bg-dark-input/60 hover:bg-dark-hover border border-dark-border flex items-center justify-between gap-2 transition-all group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Link className="w-4 h-4 text-accent-purple flex-shrink-0" />
                        <span className="truncate text-primary-400 underline">{link.title}</span>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-surface-400 group-hover:text-white flex-shrink-0" />
                    </a>
                  ))}
                </div>
              )
            )}

            {activeTab === 'audio' && (
              sharedAudio.length === 0 ? (
                <p className="py-6 text-center text-surface-500">No shared audio yet</p>
              ) : (
                <div className="space-y-1.5">
                  {sharedAudio.map((aud, idx) => (
                    <div
                      key={idx}
                      onClick={() => onJumpToMessage && onJumpToMessage(aud.messageId)}
                      className="p-2.5 rounded-xl bg-dark-input/60 hover:bg-dark-hover border border-dark-border flex items-center justify-between gap-2 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Mic className="w-4 h-4 text-primary-400 flex-shrink-0" />
                        <span className="text-white font-mono">Voice message ({aud.duration ? `${aud.duration}s` : 'audio'})</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-surface-400 group-hover:text-primary-400 flex-shrink-0" />
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>

        {/* Chat Wallpaper / Theme */}
        <div className="p-3.5 rounded-2xl bg-dark-input/40 border border-dark-border space-y-2.5">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-primary-400" />
            <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">Chat Wallpaper</h4>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {WALLPAPERS.map((wp) => (
              <button
                key={wp.id}
                onClick={() => handleSelectWallpaper(wp.id)}
                className={`h-10 rounded-xl border-2 transition-all ${wp.bg} flex items-center justify-center ${
                  activeWallpaper === wp.id ? 'border-primary-500 scale-105 shadow-md' : 'border-dark-border hover:border-surface-400'
                }`}
                title={wp.name}
              >
                {activeWallpaper === wp.id && <Check className="w-4 h-4 text-white" />}
              </button>
            ))}
          </div>
        </div>

        {/* Export Chat */}
        <div className="p-3.5 rounded-2xl bg-dark-input/40 border border-dark-border space-y-2.5">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-accent-green" />
            <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">Export Chat History</h4>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleExportChat('txt')}
              className="py-2 rounded-xl bg-dark-card hover:bg-dark-hover border border-dark-border text-surface-300 hover:text-white font-semibold transition-all"
            >
              Export as .TXT
            </button>
            <button
              onClick={() => handleExportChat('json')}
              className="py-2 rounded-xl bg-dark-card hover:bg-dark-hover border border-dark-border text-surface-300 hover:text-white font-semibold transition-all"
            >
              Export as .JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
