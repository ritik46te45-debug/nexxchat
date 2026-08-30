import { create } from 'zustand';

const useUIStore = create((set) => ({
  // Sidebar & Navigation
  isSidebarOpen: true,
  isSidebarExpanded: typeof localStorage !== 'undefined' ? localStorage.getItem('nexchat_sidebar_expanded') === 'true' : false,
  sidebarView: 'chats', // 'home', 'chats', 'calls', 'status', 'contacts', 'notifications', 'settings'

  // Mobile
  isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  showChatOnMobile: false,

  // Panels
  isRightPanelOpen: false,
  rightPanelView: null,

  // Global Modals & Overlays
  showGlobalSearch: false,
  showCommandPalette: false,
  activeModal: null,
  modalData: null,

  // Context menu
  contextMenu: null,

  // Notification
  notification: null,
  unreadNotifCount: 0,

  // Network
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isReconnecting: false,

  // Theme & Appearance (Default Permanent Dark Mode)
  theme: 'dark',
  chatFontSize: typeof localStorage !== 'undefined' ? (localStorage.getItem('nexchat_font_size') || 'normal') : 'normal',
  bubbleStyle: typeof localStorage !== 'undefined' ? (localStorage.getItem('nexchat_bubble_style') || 'rounded') : 'rounded',

  // Home Dashboard Section Configuration
  homeSections: typeof localStorage !== 'undefined'
    ? JSON.parse(localStorage.getItem('nexchat_home_sections') || '{"quickActions":true,"onlineFriends":true,"recentChats":true,"pinnedChats":true,"statusStories":true,"recentCalls":true,"recentFiles":true}')
    : { quickActions: true, onlineFriends: true, recentChats: true, pinnedChats: true, statusStories: true, recentCalls: true, recentFiles: true },

  // Actions
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  toggleSidebarExpanded: () => set((s) => {
    const next = !s.isSidebarExpanded;
    localStorage.setItem('nexchat_sidebar_expanded', String(next));
    return { isSidebarExpanded: next };
  }),
  setSidebarView: (view) => set({ sidebarView: view }),
  setMobile: (isMobile) => set({ isMobile }),
  setShowChatOnMobile: (show) => set({ showChatOnMobile: show }),
  setUnreadNotifCount: (count) => set({ unreadNotifCount: Math.max(0, count) }),
  incrementUnreadNotifCount: () => set((s) => ({ unreadNotifCount: s.unreadNotifCount + 1 })),

  setShowGlobalSearch: (show) => set({ showGlobalSearch: show }),
  setShowCommandPalette: (show) => set({ showCommandPalette: show }),

  toggleRightPanel: (view) => set((s) => ({
    isRightPanelOpen: view ? true : !s.isRightPanelOpen,
    rightPanelView: view || s.rightPanelView,
  })),
  closeRightPanel: () => set({ isRightPanelOpen: false, rightPanelView: null }),

  openModal: (modal, data = null) => set({ activeModal: modal, modalData: data }),
  closeModal: () => set({ activeModal: null, modalData: null }),

  setContextMenu: (menu) => set({ contextMenu: menu }),
  clearContextMenu: () => set({ contextMenu: null }),

  setOnline: (isOnline) => set({ isOnline }),
  setReconnecting: (isReconnecting) => set({ isReconnecting }),

  setChatFontSize: (fontSize) => {
    localStorage.setItem('nexchat_font_size', fontSize);
    set({ chatFontSize: fontSize });
  },

  setBubbleStyle: (style) => {
    localStorage.setItem('nexchat_bubble_style', style);
    set({ bubbleStyle: style });
  },

  toggleHomeSection: (sectionKey) => set((s) => {
    const next = { ...s.homeSections, [sectionKey]: !s.homeSections[sectionKey] };
    localStorage.setItem('nexchat_home_sections', JSON.stringify(next));
    return { homeSections: next };
  }),
}));

// Debounced resize listener
if (typeof window !== 'undefined') {
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      useUIStore.getState().setMobile(window.innerWidth < 768);
    }, 150);
  });

  window.addEventListener('online', () => useUIStore.getState().setOnline(true));
  window.addEventListener('offline', () => useUIStore.getState().setOnline(false));
}

// Ensure permanent dark mode on load
if (typeof document !== 'undefined') {
  document.documentElement.classList.add('dark');
  document.documentElement.setAttribute('data-theme', 'dark');
  try {
    localStorage.removeItem('nexchat_theme');
    localStorage.removeItem('nexchat_global_wp');
  } catch (e) {}
}

export default useUIStore;
