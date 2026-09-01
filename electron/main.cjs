const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;
let isQuitting = false;

// Create main desktop window
function createWindow() {
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

  const fs = require('fs');
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

  // Minimize to tray on close
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (tray) {
        tray.displayBalloon?.({
          title: 'NexChat is running in background',
          content: 'You will continue receiving instant message and call notifications.',
        });
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Update Tray context menu dynamically
function updateTrayMenu() {
  if (!tray) return;
  const isAutoLaunch = app.getLoginItemSettings().openAtLogin;

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
      checked: isAutoLaunch,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true });
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

ipcMain.handle('get-auto-launch', () => {
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('set-auto-launch', (event, enabled) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), openAsHidden: true });
  updateTrayMenu();
  return app.getLoginItemSettings().openAtLogin;
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
