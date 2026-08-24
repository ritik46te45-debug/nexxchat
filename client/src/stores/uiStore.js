import { create } from 'zustand';

const useUIStore = create((set) => ({
  // Sidebar
  isSidebarOpen: true,
  sidebarView: 'chats', // 'chats', 'contacts', 'settings', 'profile'

  // Mobile
  isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  showChatOnMobile: false,

  // Panels
  isRightPanelOpen: false,
  rightPanelView: null, // 'profile', 'media', 'search', 'members'

  // Modals
  activeModal: null, // 'forward', 'newChat', 'newGroup', 'imageViewer', 'videoPlayer', etc.
  modalData: null,

  // Context menu
  contextMenu: null, // { x, y, message, type }

  // Notification
  notification: null,

  // Network
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isReconnecting: false,

  // Theme
  theme: typeof localStorage !== 'undefined' ? (localStorage.getItem('nexchat_theme') || 'dark') : 'dark',

  // Actions
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  setSidebarView: (view) => set({ sidebarView: view }),
  setMobile: (isMobile) => set({ isMobile }),
  setShowChatOnMobile: (show) => set({ showChatOnMobile: show }),

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

  setTheme: (theme) => {
    localStorage.setItem('nexchat_theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    set({ theme });
  },
}));

// Debounced resize listener to prevent excessive re-renders
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

export default useUIStore;
