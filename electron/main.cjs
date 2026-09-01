const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let isQuitting = false;

// Persistent desktop settings file
const getSettingsFile = () => path.join(app.getPath('userData'), 'desktop-settings.json');

function loadSettings() {
  try {
    const file = getSettingsFile();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to read desktop settings:', e);
  }
  return {
    backgroundConsent: null, // null = not asked yet, 'yes' = consented, 'no' = declined
    closeToTray: false,
    startWithWindows: false,
  };
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(getSettingsFile(), JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error('Failed to write desktop settings:', e);
  }
}

let desktopSettings = null;

// Create main desktop window
function createWindow() {
  desktopSettings = loadSettings();

  const chromeUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 850,
    minHeight: 550,
    backgroundColor: '#0b0e14',
    title: 'NexChat',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Mask Electron user-agent for Google OAuth compatibility
  mainWindow.webContents.setUserAgent(chromeUserAgent);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('accounts.google.com') || url.includes('google.com/o/oauth2')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          userAgent: chromeUserAgent,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
        },
      };
    }
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });

  const distHtml = path.join(__dirname, '../client/dist/index.html');

  if (process.env.ELECTRON_START_URL) {
    mainWindow.loadURL(process.env.ELECTRON_START_URL).catch(() => {
      if (fs.existsSync(distHtml)) {
        mainWindow.loadFile(distHtml);
      } else {
        mainWindow.loadURL('https://nexxchat-zeta.vercel.app');
      }
    });
  } else if (fs.existsSync(distHtml)) {
    mainWindow.loadFile(distHtml);
  } else {
    mainWindow.loadURL('https://nexxchat-zeta.vercel.app');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Intercept window close — do NOT let it quit the app
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Update Tray context menu dynamically
function updateTrayMenu() {
  if (!tray) return;
  if (!desktopSettings) desktopSettings = loadSettings();

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open NexChat',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: desktopSettings.startWithWindows,
      click: (item) => {
        desktopSettings.startWithWindows = item.checked;
        app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true });
        saveSettings(desktopSettings);
      },
    },
    {
      label: 'Close to System Tray',
      type: 'checkbox',
      checked: desktopSettings.closeToTray,
      click: (item) => {
        desktopSettings.closeToTray = item.checked;
        saveSettings(desktopSettings);
      },
    },
    { type: 'separator' },
    {
      label: 'Quit NexChat',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// Create Windows System Tray
function createTray() {
  const iconPath = path.join(__dirname, '../client/public/favicon.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch (e) {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('NexChat Messenger');
  updateTrayMenu();

  // Clicking tray icon re-opens the window
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// IPC Handlers
ipcMain.on('set-badge-count', (event, count) => {
  if (app.setBadgeCount) {
    app.setBadgeCount(count || 0);
  }
  if (tray) {
    tray.setToolTip(count > 0 ? `NexChat (${count} unread)` : 'NexChat Messenger');
  }
});

ipcMain.handle('get-desktop-settings', () => {
  if (!desktopSettings) desktopSettings = loadSettings();
  return desktopSettings;
});

ipcMain.handle('set-desktop-settings', (event, newSettings) => {
  desktopSettings = { ...(desktopSettings || loadSettings()), ...newSettings };
  if (typeof newSettings.startWithWindows === 'boolean') {
    app.setLoginItemSettings({ openAtLogin: newSettings.startWithWindows, openAsHidden: true });
  }
  saveSettings(desktopSettings);
  updateTrayMenu();
  return desktopSettings;
});

ipcMain.handle('get-auto-launch', () => {
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('set-auto-launch', (event, enabled) => {
  if (!desktopSettings) desktopSettings = loadSettings();
  desktopSettings.startWithWindows = Boolean(enabled);
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), openAsHidden: true });
  saveSettings(desktopSettings);
  updateTrayMenu();
  return desktopSettings.startWithWindows;
});

ipcMain.on('show-notification', (event, { title, body, icon, conversationId }) => {
  if (Notification.isSupported()) {
    const notif = new Notification({
      title: title || 'NexChat',
      body: body || 'New message received',
      icon: icon ? path.join(__dirname, '../client/public/favicon.png') : undefined,
      silent: false,
    });

    notif.on('click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
        if (conversationId) {
          mainWindow.webContents.send('navigate-conversation', conversationId);
        }
      }
    });

    notif.show();
  }
});

// App Lifecycle
app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

// This ensures app does NOT quit when all windows are hidden (macOS + Windows)
app.on('window-all-closed', (event) => {
  event.preventDefault();
});
