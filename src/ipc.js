const { ipcMain, BrowserWindow, safeStorage, app } = require("electron");
const fs = require("fs");
const path = require("path");
const { listPorts, findScalePorts } = require("./scale");
const { AUTH_REQUIRED } = require("./window");

// Trả về đường dẫn file lưu token đã mã hoá
function tokensPath() {
  return path.join(app.getPath("userData"), "tokens.enc");
}

// Đăng ký tất cả IPC handler cho renderer
function registerIpcHandlers({
  getWin,
  setAuthWin,
  getPendingAuthUrl,
  setPendingAuthUrl,
  autoUpdater,
  reloadScale,
}) {
  // Cài đặt bản cập nhật và khởi động lại ứng dụng
  ipcMain.on("install-update", () => {
    autoUpdater.quitAndInstall(false, true);
  });
  // Huỷ tải bản cập nhật
  ipcMain.on("cancel-update", () => (autoUpdater.autoDownload = false));
  // Kiểm tra bản cập nhật mới
  ipcMain.handle("check-for-updates", () => {
    autoUpdater.autoDownload = true;
    return autoUpdater.checkForUpdates();
  });
  // Kết nối lại cân
  ipcMain.handle("reload-scale", () => reloadScale());
  // Tải lại trang renderer
  ipcMain.handle("reload-app", () => getWin()?.webContents.reload());
  // Lấy danh sách tất cả cổng serial
  ipcMain.handle("list-ports", () => listPorts());
  // Lấy danh sách cổng có khả năng là cân
  ipcMain.handle("list-scale-ports", () => findScalePorts());
  // Trả về biến môi trường cần thiết cho renderer
  ipcMain.handle("get-env", () => ({
    LOGIN_URL: process.env.LOGIN_URL,
    LOGIN_REALM: process.env.LOGIN_REALM,
    LOGIN_CLIENT_ID: process.env.LOGIN_CLIENT_ID,
    REDIRECT_URI: process.env.REDIRECT_URI,
    AUTH_REQUIRED,
  }));

  // Mã hoá và lưu token xác thực vào file
  ipcMain.handle("save-tokens", (_e, tokens) => {
    try {
      const enc = safeStorage.encryptString(JSON.stringify(tokens));
      fs.writeFileSync(tokensPath(), enc);
    } catch (err) {
      console.error(`[save-tokens] ${err?.stack || err}`);
    }
  });

  // Đọc và giải mã token xác thực từ file
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

  // Xoá file token
  ipcMain.handle("clear-tokens", () => {
    try {
      if (fs.existsSync(tokensPath())) fs.unlinkSync(tokensPath());
    } catch (err) {
      console.error(`[clear-tokens] ${err?.stack || err}`);
    }
  });

  // Đăng xuất: xoá token và quay về trang chủ
  ipcMain.handle("sign-out", () => {
    try {
      if (fs.existsSync(tokensPath())) fs.unlinkSync(tokensPath());
    } catch (err) {
      console.error(`[sign-out] ${err?.stack || err}`);
    }
    getWin()?.loadFile("renderer/index.html");
  });

  // Mở cửa sổ trình duyệt để đăng nhập OAuth
  ipcMain.handle("open-login-url", (_e, url) => {
    const authWin = new BrowserWindow({
      width: 800,
      height: 700,
      title: "Login",
    });
    authWin.loadURL(url);
    authWin.on("closed", () => setAuthWin(null));
    setAuthWin(authWin);
  });

  // Lưu fragment callback vào sessionStorage rồi tải lại trang
  ipcMain.handle("reload-with-callback", async (_e, fragment) => {
    await getWin()?.webContents.executeJavaScript(
      `sessionStorage.setItem('kcCallback', ${JSON.stringify(fragment)})`,
    );
    getWin()?.loadFile("renderer/index.html");
  });

  // Lấy URL callback OAuth đang chờ và xoá sau khi trả về
  ipcMain.handle("get-pending-auth-url", () => {
    const url = getPendingAuthUrl();
    setPendingAuthUrl(null);
    return url;
  });
}

module.exports = { registerIpcHandlers, tokensPath };
