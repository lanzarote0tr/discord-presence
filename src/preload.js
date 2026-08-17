const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('presenceApi', {
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  start: (config) => ipcRenderer.invoke('presence:start', config),
  update: (config) => ipcRenderer.invoke('presence:update', config),
  stop: () => ipcRenderer.invoke('presence:stop'),
  getStatus: () => ipcRenderer.invoke('presence:get-status'),
  openExternal: (url) => ipcRenderer.invoke('url:open-external', url),
  onStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('presence:status', listener);
    return () => ipcRenderer.removeListener('presence:status', listener);
  }
});
