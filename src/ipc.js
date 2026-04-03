const { ipcMain, BrowserWindow, safeStorage, app } = require("electron");
const fs = require("fs");
const path = require("path");
const { listPorts, findScalePorts } = require("./scale");
const { AUTH_REQUIRED } = require("./window");

function tokensPath() {
  return path.join(app.getPath("userData"), "tokens.enc");
}

function registerIpcHandlers({ getWin, setAuthWin, getPendingAuthUrl, setPendingAuthUrl, autoUpdater, reloadScale }) {
  ipcMain.on("install-update", () => autoUpdater.quitAndInstall());
  ipcMain.on("cancel-update", () => autoUpdater.autoDownload = false);
  ipcMain.handle("check-for-updates", () => {
    autoUpdater.autoDownload = true;
    return autoUpdater.checkForUpdates();
  });
  ipcMain.handle("reload-scale", () => reloadScale());
  ipcMain.handle("reload-app", () => getWin()?.webContents.reload());
  ipcMain.handle("list-ports", () => listPorts());
  ipcMain.handle("list-scale-ports", () => findScalePorts());
  ipcMain.handle("get-env", () => ({
    LOGIN_URL: process.env.LOGIN_URL,
    LOGIN_REALM: process.env.LOGIN_REALM,
    LOGIN_CLIENT_ID: process.env.LOGIN_CLIENT_ID,
    REDIRECT_URI: process.env.REDIRECT_URI,
    AUTH_REQUIRED,
  }));

  ipcMain.handle("save-tokens", (_e, tokens) => {
    try {
      const enc = safeStorage.encryptString(JSON.stringify(tokens));
      fs.writeFileSync(tokensPath(), enc);
    } catch (err) {
      console.error(`[save-tokens] ${err?.stack || err}`);
    }
  });

  ipcMain.handle("load-tokens", () => {
    try {
      if (!fs.existsSync(tokensPath())) return null;
      const enc = fs.readFileSync(tokensPath());
      return JSON.parse(safeStorage.decryptString(enc));
    } catch (err) {
      console.error(`[load-tokens] ${err?.stack || err}`);
      return null;
    }
  });

  ipcMain.handle("clear-tokens", () => {
    try {
      if (fs.existsSync(tokensPath())) fs.unlinkSync(tokensPath());
    } catch (err) {
      console.error(`[clear-tokens] ${err?.stack || err}`);
    }
  });

  ipcMain.handle("sign-out", () => {
    try {
      if (fs.existsSync(tokensPath())) fs.unlinkSync(tokensPath());
    } catch (err) {
      console.error(`[sign-out] ${err?.stack || err}`);
    }
    getWin()?.loadFile("renderer/index.html");
  });

  ipcMain.handle("open-login-url", (_e, url) => {
    const authWin = new BrowserWindow({ width: 800, height: 700, title: "Login" });
    authWin.loadURL(url);
    authWin.on("closed", () => setAuthWin(null));
    setAuthWin(authWin);
  });

  ipcMain.handle("reload-with-callback", async (_e, fragment) => {
    await getWin()?.webContents.executeJavaScript(
      `sessionStorage.setItem('kcCallback', ${JSON.stringify(fragment)})`,
    );
    getWin()?.loadFile("renderer/index.html");
  });

  ipcMain.handle("get-pending-auth-url", () => {
    const url = getPendingAuthUrl();
    setPendingAuthUrl(null);
    return url;
  });
}

module.exports = { registerIpcHandlers, tokensPath };
