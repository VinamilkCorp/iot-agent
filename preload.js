const { contextBridge, ipcRenderer, app } = require('electron');

const version = app?.getVersion() ?? '';

contextBridge.exposeInMainWorld('scale', {
  version,
  onEvent:        (cb) => ipcRenderer.on('scale', (_e, data) => cb(data)),
  onLog:          (cb) => ipcRenderer.on('log',   (_e, entry) => cb(entry)),
  listPorts:      ()   => ipcRenderer.invoke('list-ports'),
  listScalePorts: ()   => ipcRenderer.invoke('list-scale-ports'),
  getEnv:              ()   => ipcRenderer.invoke('get-env'),
  onAuthCallback: (cb) => ipcRenderer.on('auth-callback', (_e, url) => cb(url)),
  reloadScale:        ()   => ipcRenderer.invoke('reload-scale'),
  reloadWithCallback: (fragment) => ipcRenderer.invoke('reload-with-callback', fragment),
  getPendingAuthUrl:   ()   => ipcRenderer.invoke('get-pending-auth-url'),
  openLoginUrl:        (url) => ipcRenderer.invoke('open-login-url', url),
  onAppError:     (cb) => ipcRenderer.on('app-error', (_e, msg) => cb(msg)),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_e, data) => cb(data)),
  cancelUpdate:  ()   => ipcRenderer.send('cancel-update'),
  installUpdate:  ()   => ipcRenderer.send('install-update'),
  checkForUpdates: ()  => ipcRenderer.invoke('check-for-updates'),
  saveTokens:     (tokens) => ipcRenderer.invoke('save-tokens', tokens),
  loadTokens:     ()       => ipcRenderer.invoke('load-tokens'),
  signOut:        ()       => ipcRenderer.invoke('sign-out'),
});
