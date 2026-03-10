const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scale', {
  onEvent:        (cb) => ipcRenderer.on('scale', (_e, data) => cb(data)),
  onLog:          (cb) => ipcRenderer.on('log',   (_e, entry) => cb(entry)),
  listPorts:      ()   => ipcRenderer.invoke('list-ports'),
  listScalePorts: ()   => ipcRenderer.invoke('list-scale-ports'),
});
