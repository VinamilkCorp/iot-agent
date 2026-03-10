const { app, BrowserWindow, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { autoConnect, listPorts, findScalePorts, logger } = require('./src/scale');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 700,
    title: 'IoT Scale',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });
  win.loadFile('renderer/index.html');
}

app.whenReady().then(() => {
  createWindow();
  autoUpdater.checkForUpdatesAndNotify();

  logger.on('log', (entry) => win?.webContents.send('log', entry));

  autoConnect().then((reader) => {
    reader.on('connected', (info) => win?.webContents.send('scale', { event: 'connected', ...info }));
    reader.on('weight',    (data) => win?.webContents.send('scale', { event: 'weight', ...data }));
    reader.on('disconnected', ()  => win?.webContents.send('scale', { event: 'disconnected' }));
    reader.on('error', (err)      => win?.webContents.send('scale', { event: 'error', message: err.message }));
  });
});

ipcMain.handle('list-ports',       () => listPorts());
ipcMain.handle('list-scale-ports', () => findScalePorts());

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
