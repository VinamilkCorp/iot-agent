const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scale', {
  onEvent:        (cb) => ipcRenderer.on('scale', (_e, data) => cb(data)),
  listPorts:      ()   => ipcRenderer.invoke('list-ports'),
  listScalePorts: ()   => ipcRenderer.invoke('list-scale-ports'),
});
