'use strict';

const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  shell,
  nativeTheme,
} = require('electron');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Persistent settings (stored as JSON in the OS user-data directory)
// ---------------------------------------------------------------------------
const DEFAULT_SETTINGS = {
  theme: 'system', // 'system' | 'light' | 'dark'
  soundEnabled: true,
  loopSound: false,
  popUpWhenExpired: true,
  alwaysOnTop: false,
  showProgressInTitle: true,
  recentInputs: [],
  window: { width: 520, height: 380 },
};

let settingsPath = null;
let settings = { ...DEFAULT_SETTINGS };

function loadSettings() {
  settingsPath = path.join(app.getPath('userData'), 'settings.json');
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (err) {
    settings = { ...DEFAULT_SETTINGS };
  }
}

let saveTimer = null;
function saveSettings() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    } catch (err) {
      // best-effort; ignore write failures
    }
  }, 150);
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------
const windows = new Set();

function createWindow(options = {}) {
  const win = new BrowserWindow({
    width: settings.window.width || 520,
    height: settings.window.height || 380,
    minWidth: 360,
    minHeight: 260,
    backgroundColor: '#0f172a',
    title: 'Hourglass',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    alwaysOnTop: settings.alwaysOnTop,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.once('ready-to-show', () => win.show());

  win.on('closed', () => windows.delete(win));

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  windows.add(win);
  return win;
}

function applyAlwaysOnTop(value) {
  settings.alwaysOnTop = value;
  for (const win of windows) {
    win.setAlwaysOnTop(value);
  }
  saveSettings();
}

// ---------------------------------------------------------------------------
// Application menu
// ---------------------------------------------------------------------------
function buildMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Timer Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => createWindow(),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Timer',
      submenu: [
        {
          label: 'Start / Pause',
          accelerator: 'Space',
          click: (item, win) => win && win.webContents.send('menu:toggle-pause'),
        },
        {
          label: 'Stop',
          accelerator: 'CmdOrCtrl+.',
          click: (item, win) => win && win.webContents.send('menu:stop'),
        },
        {
          label: 'Add 1 Minute',
          accelerator: 'CmdOrCtrl+=',
          click: (item, win) => win && win.webContents.send('menu:add-minute'),
        },
        { type: 'separator' },
        {
          label: 'Always on Top',
          type: 'checkbox',
          checked: settings.alwaysOnTop,
          click: (item) => applyAlwaysOnTop(item.checked),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Hourglass on GitHub',
          click: () => shell.openExternal('https://github.com/prajesh-ananthan/hourglass-v2'),
        },
        {
          label: 'Reference: dziemborowicz/hourglass',
          click: () => shell.openExternal('https://github.com/dziemborowicz/hourglass'),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.handle('settings:get', () => settings);

ipcMain.handle('settings:set', (event, partial) => {
  settings = { ...settings, ...partial };
  if (typeof partial.alwaysOnTop === 'boolean') {
    for (const win of windows) win.setAlwaysOnTop(partial.alwaysOnTop);
  }
  if (partial.theme) {
    nativeTheme.themeSource = partial.theme;
  }
  saveSettings();
  return settings;
});

ipcMain.on('window:set-always-on-top', (event, value) => applyAlwaysOnTop(value));

ipcMain.on('window:save-size', (event, size) => {
  if (size && size.width && size.height) {
    settings.window = { width: size.width, height: size.height };
    saveSettings();
  }
});

ipcMain.on('timer:expired', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (settings.popUpWhenExpired) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    // Briefly float above other windows to grab attention.
    if (!settings.alwaysOnTop) {
      win.setAlwaysOnTop(true);
      setTimeout(() => {
        if (!win.isDestroyed() && !settings.alwaysOnTop) win.setAlwaysOnTop(false);
      }, 4000);
    }
  }
  if (typeof win.flashFrame === 'function') {
    win.flashFrame(true);
    setTimeout(() => !win.isDestroyed() && win.flashFrame(false), 4000);
  }
});

ipcMain.on('window:set-title', (event, title) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) win.setTitle(title || 'Hourglass');
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  loadSettings();
  if (settings.theme && settings.theme !== 'system') {
    nativeTheme.themeSource = settings.theme;
  }
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
