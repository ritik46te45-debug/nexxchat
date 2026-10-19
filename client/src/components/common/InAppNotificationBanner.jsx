import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, X, MessageSquare, Phone, Bell } from 'lucide-react';
import useUIStore from '../../stores/uiStore';
import useChatStore from '../../stores/chatStore';
import Avatar from './Avatar';

export default function InAppNotificationBanner() {
  const inAppBanner = useUIStore((s) => s.inAppBanner);
  const dismissInAppBanner = useUIStore((s) => s.dismissInAppBanner);
  const toggleExpandInAppBanner = useUIStore((s) => s.toggleExpandInAppBanner);
  const { conversations, setActiveConversation } = useChatStore();
  const { setSidebarView, setShowChatOnMobile, isMobile } = useUIStore();

  const timerRef = useRef(null);

  // Auto-dismiss banner after 5.5 seconds of inactivity, reset on new messages
  useEffect(() => {
    if (!inAppBanner) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      dismissInAppBanner();
    }, 5500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [inAppBanner?.createdAt, dismissInAppBanner]);

  if (!inAppBanner) return null;

  const count = inAppBanner.messages?.length || 1;
  const isMultiple = count > 1;
  const latestMessage = inAppBanner.messages?.[inAppBanner.messages.length - 1] || inAppBanner.preview || '';

  const handleClickBanner = () => {
    dismissInAppBanner();
    if (inAppBanner.conversationId) {
      const targetConv = conversations.find(
        (c) => (c._id || c.id)?.toString() === inAppBanner.conversationId?.toString()
      );
      if (targetConv) {
        setActiveConversation(targetConv);
        setSidebarView('chats');
        if (isMobile) setShowChatOnMobile(true);
      }
    } else if (inAppBanner.type === 'friend_request' || inAppBanner.type === 'friend_accepted') {
      setSidebarView('contacts');
    } else {
      setSidebarView('notifications');
    }
  };

  return (
    <div className="fixed top-2 sm:top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm sm:max-w-md px-3 pointer-events-none animate-slide-in-top">
      <div className="pointer-events-auto bg-dark-card/95 backdrop-blur-xl border border-primary-500/40 shadow-2xl rounded-2xl p-3 sm:p-3.5 transition-all duration-300 ring-1 ring-white/10 hover:border-primary-500/70">
        {/* Main Banner Row */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={handleClickBanner}>
          {/* Sender Avatar */}
          <div className="relative flex-shrink-0">
            <Avatar
              src={inAppBanner.senderAvatar}
              name={inAppBanner.senderName}
              size="md"
              className="ring-2 ring-primary-500/60 shadow-md"
            />
            {inAppBanner.type === 'call' && (
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-accent-green text-black flex items-center justify-center shadow">
                <Phone className="w-2.5 h-2.5" />
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-xs sm:text-sm font-bold text-white truncate">
                  {inAppBanner.senderName || 'Notification'}
                </p>
                {isMultiple && (
                  <span className="text-[10px] bg-primary-500 text-white font-extrabold px-1.5 py-0.2 rounded-full flex-shrink-0 shadow-sm">
                    {count}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-primary-400 font-semibold flex-shrink-0">
                Just now
              </span>
            </div>

            {/* Snippet */}
            <p className="text-xs text-surface-300 truncate mt-0.5 leading-relaxed">
              {latestMessage}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 flex-shrink-0 ml-1">
            {isMultiple && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpandInAppBanner();
                }}
                className="p-1.5 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-300 hover:text-white transition-colors border border-dark-border"
                title={inAppBanner.isExpanded ? 'Collapse' : 'Expand all messages'}
              >
                {inAppBanner.isExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dismissInAppBanner();
              }}
              className="p-1.5 rounded-xl hover:bg-dark-hover text-surface-400 hover:text-white transition-colors"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Grouped Messages Expansion Drawer */}
        {inAppBanner.isExpanded && isMultiple && (
          <div className="mt-2.5 pt-2 border-t border-dark-border/80 space-y-1.5 max-h-40 overflow-y-auto hide-scrollbar">
            <p className="text-[10px] font-bold text-surface-400 uppercase tracking-wider px-1">
              Recent messages ({count})
            </p>
            {inAppBanner.messages.map((msg, index) => (
              <div
                key={index}
                onClick={handleClickBanner}
                className="px-2.5 py-1.5 rounded-xl bg-dark-input/60 hover:bg-dark-hover/80 text-xs text-surface-200 cursor-pointer transition-colors flex items-center justify-between gap-2"
              >
                <span className="truncate">{msg}</span>
                <span className="text-[10px] text-surface-500 flex-shrink-0">#{index + 1}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
