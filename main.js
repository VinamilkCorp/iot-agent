const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, nativeImage, protocol, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
require('dotenv').config();
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
  win.webContents.on('console-message', (_e, level, message) => {
    const prefix = ['log', 'warn', 'error', 'debug'][level] ?? 'log';
    process.stdout.write(`[renderer:${prefix}] ${message}\n`);
  });
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

// Single instance lock — on Windows the second instance carries the redirect URL
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let pendingAuthUrl = null;

// Windows: Keycloak opens a second instance with iotscale:// in argv
app.on('second-instance', (_e, argv) => {
  pendingAuthUrl = argv.find(a => a.startsWith('iotscale://')) ?? null;
  console.log('[main] second-instance argv:', argv);
  console.log('[main] pendingAuthUrl:', pendingAuthUrl);
  if (pendingAuthUrl) win?.webContents.send('auth-callback', pendingAuthUrl);
  if (win) { win.show(); win.focus(); }
});

app.setAsDefaultProtocolClient('iotscale');

app.whenReady().then(() => {
  // macOS: Keycloak opens iotscale:// via open-url event
  app.on('open-url', (_e, url) => {
    pendingAuthUrl = url;
    win?.webContents.send('auth-callback', url);
    if (win) { win.show(); win.focus(); }
  });

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
ipcMain.handle('get-env', () => ({
  LOGIN_URL:       process.env.LOGIN_URL,
  LOGIN_REALM:     process.env.LOGIN_REALM,
  LOGIN_CLIENT_ID: process.env.LOGIN_CLIENT_ID,
}));
ipcMain.handle('open-login-url', (_e, url) => shell.openExternal(url));
ipcMain.handle('reload-with-callback', async (_e, fragment) => {
  await win?.webContents.executeJavaScript(`sessionStorage.setItem('kcCallback', ${JSON.stringify(fragment)})`);
  win?.loadFile('renderer/index.html');
});
ipcMain.handle('get-pending-auth-url', () => {
  const url = pendingAuthUrl;
  pendingAuthUrl = null;
  return url;
});

app.on('window-all-closed', () => { /* keep alive in tray */ });
app.on('activate', () => win?.show());
