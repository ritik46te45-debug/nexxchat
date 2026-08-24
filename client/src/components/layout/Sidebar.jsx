import { MessageCircle, Users, Settings, LogOut, Sparkles, Phone } from 'lucide-react';
import useUIStore from '../../stores/uiStore';
import useAuthStore from '../../stores/authStore';
import useChatStore from '../../stores/chatStore';
import toast from 'react-hot-toast';

export default function Sidebar({ onOpenProfile }) {
  const { sidebarView, setSidebarView } = useUIStore();
  const { user, logout } = useAuthStore();
  const unreadTotal = useChatStore((s) => s.unreadTotal);

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
  };

  const navItems = [
    { id: 'chats', icon: MessageCircle, label: 'Chats', badge: unreadTotal },
    { id: 'calls', icon: Phone, label: 'Calls' },
    { id: 'status', icon: Sparkles, label: 'Status' },
    { id: 'contacts', icon: Users, label: 'Contacts' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="w-[72px] h-full bg-dark-card border-r border-dark-border flex flex-col items-center py-4 flex-shrink-0 z-20">
      {/* User avatar */}
      <button
        onClick={onOpenProfile}
        className="mb-6 group relative"
        title="Edit Profile"
      >
        {user?.avatar?.url ? (
          <img
            src={user.avatar.url}
            alt={user.displayName}
            className="w-11 h-11 rounded-full object-cover ring-2 ring-dark-border group-hover:ring-primary-500/50 transition-all"
          />
        ) : (
          <div className="w-11 h-11 rounded-full gradient-primary flex items-center justify-center text-white font-semibold text-sm ring-2 ring-dark-border group-hover:ring-primary-500/50 transition-all">
            {user?.displayName?.charAt(0)?.toUpperCase() || '?'}
          </div>
        )}
        <div className="absolute -bottom-0.5 -right-0.5 online-dot" />
      </button>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col items-center gap-2">
        {navItems.map(({ id, icon: Icon, label, badge }) => (
          <button
            key={id}
            onClick={() => setSidebarView(id)}
            title={label}
            className={`
              relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200
              ${sidebarView === id
                ? 'bg-primary-500/20 text-primary-400 shadow-lg shadow-primary-500/10'
                : 'text-surface-400 hover:text-surface-200 hover:bg-dark-hover'
              }
            `}
          >
            <Icon className="w-5 h-5" />
            {badge > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-accent-red text-white text-[10px] font-bold flex items-center justify-center px-1">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Logout */}
      <button
        onClick={handleLogout}
        title="Logout"
        className="w-11 h-11 rounded-xl flex items-center justify-center text-surface-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
      >
        <LogOut className="w-5 h-5" />
      </button>
    </div>
  );
}
