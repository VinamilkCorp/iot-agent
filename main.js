const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { autoConnect, listPorts, findScalePorts, logger } = require('./src/scale');

let win;
let tray;

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 700,
    title: 'IoT Scale',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });
  win.loadFile('renderer/index.html');
  win.on('close', (e) => { e.preventDefault(); win.hide(); });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('IoT Scale');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Debug', click: () => { win.show(); win.webContents.openDevTools(); } },
    { type: 'separator' },
    { label: 'Exit', click: () => { app.exit(0); } },
  ]));
  tray.on('click', () => win.show());
}

function askAutoStart() {
  const choice = dialog.showMessageBoxSync({
    type: 'question',
    buttons: ['Yes', 'No'],
    defaultId: 0,
    title: 'Auto-start',
    message: 'Run IoT Scale automatically when Windows starts?',
  });
  app.setLoginItemSettings({ openAtLogin: choice === 0, openAsHidden: true });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  autoUpdater.checkForUpdatesAndNotify();

  const { wasOpenedAtLogin } = app.getLoginItemSettings();
  if (!wasOpenedAtLogin && app.getLoginItemSettings().openAtLogin === false) askAutoStart();

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

app.on('window-all-closed', () => { /* keep alive in tray */ });
app.on('activate', () => win?.show());
