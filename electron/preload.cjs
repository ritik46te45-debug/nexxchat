const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  setBadgeCount: (count) => ipcRenderer.send('set-badge-count', count),
  showNotification: (options) => ipcRenderer.send('show-notification', options),
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),
  getDesktopSettings: () => ipcRenderer.invoke('get-desktop-settings'),
  setDesktopSettings: (settings) => ipcRenderer.invoke('set-desktop-settings', settings),
  loginWithGoogle: () => ipcRenderer.invoke('electron-google-oauth'),
  onNavigateConversation: (callback) => {
    ipcRenderer.on('navigate-conversation', (event, conversationId) => {
      if (typeof callback === 'function') {
        callback(conversationId);
      }
    });
  },
});
