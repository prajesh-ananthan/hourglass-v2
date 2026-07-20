'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hourglass', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  setAlwaysOnTop: (value) => ipcRenderer.send('window:set-always-on-top', value),
  saveWindowSize: (size) => ipcRenderer.send('window:save-size', size),
  notifyExpired: () => ipcRenderer.send('timer:expired'),
  setWindowTitle: (title) => ipcRenderer.send('window:set-title', title),

  onMenu: (channel, handler) => {
    const allowed = ['menu:toggle-pause', 'menu:stop', 'menu:add-minute'];
    if (!allowed.includes(channel)) return;
    ipcRenderer.on(channel, () => handler());
  },

  platform: process.platform,
});
