const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scale', {
  onEvent:        (cb) => ipcRenderer.on('scale', (_e, data) => cb(data)),
  onLog:          (cb) => ipcRenderer.on('log',   (_e, entry) => cb(entry)),
  listPorts:      ()   => ipcRenderer.invoke('list-ports'),
  listScalePorts: ()   => ipcRenderer.invoke('list-scale-ports'),
  getEnv:              ()   => ipcRenderer.invoke('get-env'),
  onAuthCallback: (cb) => ipcRenderer.on('auth-callback', (_e, url) => cb(url)),
  reloadWithCallback: (fragment) => ipcRenderer.invoke('reload-with-callback', fragment),
  getPendingAuthUrl:   ()   => ipcRenderer.invoke('get-pending-auth-url'),
  openLoginUrl:        (url) => ipcRenderer.invoke('open-login-url', url),
  onAppError:     (cb) => ipcRenderer.on('app-error', (_e, msg) => cb(msg)),
  saveTokens:     (tokens) => ipcRenderer.invoke('save-tokens', tokens),
  loadTokens:     ()       => ipcRenderer.invoke('load-tokens'),
  clearTokens:    ()       => ipcRenderer.invoke('clear-tokens'),
});
