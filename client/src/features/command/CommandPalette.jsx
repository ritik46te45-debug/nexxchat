import { useState, useEffect, useMemo } from 'react';
import {
  Search, MessageSquare, Users, Phone, Video, Settings,
  Palette, User, Bell, Sparkles, Moon, Sun, ArrowRight,
  Shield, Check, Command
} from 'lucide-react';
import useUIStore from '../../stores/uiStore';
import useAuthStore from '../../stores/authStore';
import toast from 'react-hot-toast';

export default function CommandPalette({
  onClose,
  onOpenNewChat,
  onOpenNewGroup,
  onOpenProfile,
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const {
    setSidebarView, setShowGlobalSearch, setShowWallpaperModal,
    theme, setTheme
  } = useUIStore();

  const commands = useMemo(() => [
    {
      id: 'new_chat',
      title: 'New Direct Message',
      subtitle: 'Start a conversation with a friend',
      icon: MessageSquare,
      category: 'Chat',
      action: () => {
        onOpenNewChat && onOpenNewChat();
        onClose();
      },
    },
    {
      id: 'new_group',
      title: 'Create New Group',
      subtitle: 'Create a multi-user group chat',
      icon: Users,
      category: 'Chat',
      action: () => {
        onOpenNewGroup && onOpenNewGroup();
        onClose();
      },
    },
    {
      id: 'global_search',
      title: 'Universal Global Search',
      subtitle: 'Search people, messages, files & media',
      icon: Search,
      category: 'Navigation',
      action: () => {
        setShowGlobalSearch(true);
        onClose();
      },
    },
    {
      id: 'wallpaper',
      title: 'Change Chat Wallpaper & Theme',
      subtitle: 'Customize chat background and bubble styles',
      icon: Palette,
      category: 'Appearance',
      action: () => {
        setShowWallpaperModal(true);
        onClose();
      },
    },
    {
      id: 'toggle_theme',
      title: `Switch Theme (Current: ${theme})`,
      subtitle: 'Cycle Dark, Midnight, AMOLED, Cyber',
      icon: Moon,
      category: 'Appearance',
      action: () => {
        const themes = ['dark', 'midnight', 'amoled', 'cyber'];
        const nextTheme = themes[(themes.indexOf(theme) + 1) % themes.length];
        setTheme(nextTheme);
        toast.success(`Theme switched to ${nextTheme}`);
        onClose();
      },
    },
    {
      id: 'profile',
      title: 'Open Profile & DP Customizer',
      subtitle: 'View and update your display name, bio & photo',
      icon: User,
      category: 'Account',
      action: () => {
        onOpenProfile && onOpenProfile();
        onClose();
      },
    },
    {
      id: 'notifications',
      title: 'Open Notifications Center',
      subtitle: 'View friend requests, call alerts, and mentions',
      icon: Bell,
      category: 'Navigation',
      action: () => {
        setSidebarView('notifications');
        onClose();
      },
    },
    {
      id: 'settings',
      title: 'Open Settings',
      subtitle: 'Manage privacy, 2FA, sounds, and storage',
      icon: Settings,
      category: 'Navigation',
      action: () => {
        setSidebarView('settings');
        onClose();
      },
    },
  ], [onOpenNewChat, onOpenNewGroup, onOpenProfile, onClose, setShowGlobalSearch, setShowWallpaperModal, setSidebarView, setTheme, theme]);

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.subtitle.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
    );
  }, [commands, query]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((idx) => (idx + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((idx) => (idx - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredCommands, selectedIndex, onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[140] bg-black/80 backdrop-blur-md flex items-start justify-center pt-16 sm:pt-24 p-4 animate-fade-in select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-dark-card border border-dark-border rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-scale-in"
      >
        {/* Command Input Header */}
        <div className="p-4 border-b border-dark-border flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl gradient-primary text-white flex items-center justify-center font-bold flex-shrink-0">
            <Command className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command or search..."
            className="w-full bg-transparent text-white text-sm focus:outline-none placeholder:text-surface-500"
            autoFocus
          />
          <kbd className="px-2 py-0.5 rounded-lg bg-dark-input border border-dark-border text-[10px] font-mono text-surface-400">
            ESC
          </kbd>
        </div>

        {/* Command List */}
        <div className="p-2 max-h-80 overflow-y-auto hide-scrollbar space-y-1 text-xs">
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-surface-500">No matching commands found</div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = selectedIndex === idx;
              const Icon = cmd.icon;

              return (
                <button
                  key={cmd.id}
                  onClick={cmd.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full p-2.5 rounded-2xl flex items-center justify-between gap-3 text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-primary-500/15 border border-primary-500/40 text-white'
                      : 'hover:bg-dark-hover text-surface-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      isSelected ? 'gradient-primary text-white shadow-sm' : 'bg-dark-input text-surface-400 border border-dark-border'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-white truncate">{cmd.title}</p>
                      <p className="text-[10px] text-surface-400 truncate">{cmd.subtitle}</p>
                    </div>
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-surface-500 px-2 py-0.5 rounded-md bg-dark-input border border-dark-border">
                    {cmd.category}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
