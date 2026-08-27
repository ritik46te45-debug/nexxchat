import {
  Home, MessageSquare, Users, Phone, Sparkles, Bell,
  Settings, LogOut, PanelLeftClose, PanelLeftOpen, User,
  Command, Search
} from 'lucide-react';
import useUIStore from '../../stores/uiStore';
import useAuthStore from '../../stores/authStore';
import useChatStore from '../../stores/chatStore';
import toast from 'react-hot-toast';

export default function Sidebar({ onOpenProfile }) {
  const {
    sidebarView, setSidebarView, isMobile, showChatOnMobile,
    isSidebarExpanded, toggleSidebarExpanded,
    setShowGlobalSearch, setShowCommandPalette
  } = useUIStore();
  const { user, logout } = useAuthStore();
  const unreadTotal = useChatStore((s) => s.unreadTotal);

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
  };

  const navItems = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'chats', icon: MessageSquare, label: 'Chats', badge: unreadTotal },
    { id: 'contacts', icon: Users, label: 'Friends' },
    { id: 'calls', icon: Phone, label: 'Calls' },
    { id: 'status', icon: Sparkles, label: 'Status' },
    { id: 'notifications', icon: Bell, label: 'Alerts' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  // ─── Mobile: Fixed bottom tab bar (hidden when viewing an active chat) ───
  if (isMobile) {
    if (showChatOnMobile) return null;

    const mobileNavItems = [
      { id: 'home', icon: Home, label: 'Home' },
      { id: 'chats', icon: MessageSquare, label: 'Chats', badge: unreadTotal },
      { id: 'contacts', icon: Users, label: 'Friends' },
      { id: 'calls', icon: Phone, label: 'Calls' },
    ];

    return (
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-dark-card/95 backdrop-blur-xl border-t border-dark-border safe-bottom shadow-2xl">
        <nav className="flex items-center justify-around px-1 py-1.5 max-w-md mx-auto">
          {mobileNavItems.map(({ id, icon: Icon, label, badge }) => (
            <button
              key={id}
              onClick={() => setSidebarView(id)}
              className={`
                relative flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl transition-all duration-200
                ${sidebarView === id
                  ? 'text-primary-400 font-semibold'
                  : 'text-surface-500 hover:text-surface-300 active:text-surface-200'
                }
              `}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-tight">{label}</span>
              {badge > 0 && (
                <span className="absolute -top-0.5 right-1 min-w-[16px] h-4 rounded-full bg-accent-red text-white text-[9px] font-bold flex items-center justify-center px-1">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          ))}

          {/* Direct Profile Tab Button for Mobile */}
          <button
            onClick={onOpenProfile}
            className="relative flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl transition-all duration-200 text-surface-500 hover:text-surface-300 active:text-surface-200 cursor-pointer"
            title="Edit Profile & DP"
          >
            {user?.avatar?.url ? (
              <img src={user.avatar.url} alt="" className="w-5 h-5 rounded-full object-cover ring-1 ring-primary-500" />
            ) : (
              <div className="w-5 h-5 rounded-full gradient-primary text-[10px] font-bold text-white flex items-center justify-center">
                {(user?.displayName || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-[10px] font-medium leading-tight">You</span>
          </button>
        </nav>
      </div>
    );
  }

  // ─── Desktop / Laptop: Vertical sidebar (Expandable / Collapsible) ───
  return (
    <div
      className={`h-full bg-dark-card border-r border-dark-border flex flex-col justify-between py-4 flex-shrink-0 z-20 transition-all duration-200 select-none ${
        isSidebarExpanded ? 'w-56 px-3' : 'w-[68px] lg:w-[72px] items-center px-2'
      }`}
    >
      {/* Top Header & User Avatar */}
      <div className="flex flex-col gap-4">
        {/* User DP Avatar */}
        <div className={`flex items-center ${isSidebarExpanded ? 'justify-between px-1' : 'justify-center'}`}>
          <button
            onClick={onOpenProfile}
            className="group relative flex items-center gap-3 cursor-pointer"
            title="Edit Your Profile & DP"
          >
            <div className="relative">
              {user?.avatar?.url ? (
                <img
                  src={user.avatar.url}
                  alt={user.displayName}
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-dark-border group-hover:ring-primary-500/60 transition-all shadow-md"
                />
              ) : (
                <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-sm ring-2 ring-dark-border group-hover:ring-primary-500/60 transition-all shadow-md">
                  {user?.displayName?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-accent-green border-2 border-dark-card" />
            </div>

            {isSidebarExpanded && (
              <div className="text-left min-w-0">
                <p className="text-xs font-bold text-white truncate max-w-[120px]">{user?.displayName || 'User'}</p>
                <p className="text-[10px] text-surface-400 font-mono">#{user?.userCode || '0000'}</p>
              </div>
            )}
          </button>

          {/* Toggle Expand/Collapse Button (Desktop) */}
          {isSidebarExpanded && (
            <button
              onClick={toggleSidebarExpanded}
              className="p-1.5 rounded-xl hover:bg-dark-hover text-surface-400 hover:text-white transition-colors"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Global Search / Command Bar Trigger */}
        <button
          onClick={() => setShowCommandPalette(true)}
          className={`rounded-2xl bg-dark-input hover:bg-dark-hover border border-dark-border text-surface-400 hover:text-white flex items-center gap-2.5 transition-all cursor-pointer ${
            isSidebarExpanded ? 'px-3 py-2 w-full justify-between' : 'w-10 h-10 justify-center'
          }`}
          title="Command Palette (Ctrl+K)"
        >
          <div className="flex items-center gap-2">
            <Command className="w-4 h-4 text-primary-400" />
            {isSidebarExpanded && <span className="text-xs font-medium">Quick Actions</span>}
          </div>
          {isSidebarExpanded && (
            <kbd className="px-1.5 py-0.5 rounded bg-dark-card border border-dark-border text-[9px] font-mono text-surface-400">
              Ctrl+K
            </kbd>
          )}
        </button>

        {/* Navigation Items */}
        <nav className="flex flex-col gap-1.5 w-full">
          {navItems.map(({ id, icon: Icon, label, badge }) => {
            const isActive = sidebarView === id;
            return (
              <button
                key={id}
                onClick={() => setSidebarView(id)}
                title={label}
                className={`
                  relative rounded-2xl flex items-center transition-all duration-200 cursor-pointer ${
                    isSidebarExpanded ? 'px-3.5 py-2.5 gap-3 w-full' : 'w-10 h-10 lg:w-11 lg:h-11 justify-center'
                  } ${
                    isActive
                      ? 'gradient-primary text-white shadow-lg shadow-primary-500/25 font-bold'
                      : 'text-surface-400 hover:text-white hover:bg-dark-hover'
                  }
                `}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {isSidebarExpanded && <span className="text-xs font-semibold">{label}</span>}
                {badge > 0 && (
                  <span
                    className={`rounded-full bg-accent-red text-white text-[10px] font-bold flex items-center justify-center px-1.5 ${
                      isSidebarExpanded
                        ? 'ml-auto min-w-[20px] h-5'
                        : 'absolute -top-1 -right-1 min-w-[18px] h-[18px]'
                    }`}
                  >
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Footer Actions */}
      <div className="flex flex-col gap-2 w-full">
        {!isSidebarExpanded && (
          <button
            onClick={toggleSidebarExpanded}
            className="w-10 h-10 rounded-2xl text-surface-400 hover:text-white hover:bg-dark-hover flex items-center justify-center transition-colors cursor-pointer"
            title="Expand sidebar"
          >
            <PanelLeftOpen className="w-5 h-5" />
          </button>
        )}

        <button
          onClick={handleLogout}
          className={`rounded-2xl text-surface-400 hover:text-accent-red hover:bg-accent-red/10 flex items-center transition-all cursor-pointer ${
            isSidebarExpanded ? 'px-3.5 py-2.5 gap-3 w-full' : 'w-10 h-10 justify-center'
          }`}
          title="Log out"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {isSidebarExpanded && <span className="text-xs font-semibold">Log Out</span>}
        </button>
      </div>
    </div>
  );
}
