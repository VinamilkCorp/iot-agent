const { app } = require("electron");
const path = require("path");
// Tải biến môi trường từ file .env (hỗ trợ cả môi trường đóng gói và dev)
require("dotenv").config({
  path: path.join(app.isPackaged ? process.resourcesPath : __dirname, ".env"),
});


const { autoConnect, logger, registerExitHooks } = require("./src/scale");
const { createWindow, askAutoStart } = require("./src/window");
const { createTray } = require("./src/tray");
const {
  startSseServer,
  startAuthServer,
  sseEmit,
  setScaleConnected,
  updateScaleState,
} = require("./src/servers");
const { registerIpcHandlers, tokensPath } = require("./src/ipc");
const { setupUpdater, autoUpdater } = require("./src/updater");

// Biến toàn cục quản lý cửa sổ và trạng thái ứng dụng
let win = null;
let authWin = null;
let pendingAuthUrl = null;
let _reader = null;
let _isQuitting = process.platform === "darwin";

const getWin = () => win;
const getAuthWin = () => authWin;
const setAuthWin = (v) => {
  authWin = v;
};
const getPendingAuthUrl = () => pendingAuthUrl;
const setPendingAuthUrl = (v) => {
  pendingAuthUrl = v;
};
const isQuitting = () => _isQuitting;

// Gửi thông báo lỗi tới renderer
function sendError(msg) {
  win?.webContents.send("app-error", msg);
}

// Bắt lỗi không xử lý được ở cấp process
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  sendError(`[uncaughtException] ${err?.stack || err}`);
});
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
  sendError(`[unhandledRejection] ${reason?.stack || reason}`);
});

// Đảm bảo chỉ chạy một instance duy nhất
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// Xử lý khi instance thứ hai được mở (deep link hoặc gọi lại từ OAuth)
app.on("second-instance", (_e, argv) => {
  pendingAuthUrl = argv.find((a) => a.startsWith("iotscale://")) ?? null;
  console.log("[main] second-instance argv:", argv);
  console.log("[main] pendingAuthUrl:", pendingAuthUrl);
  if (authWin) {
    authWin.close();
    authWin = null;
  }
  if (pendingAuthUrl) win?.webContents.send("auth-callback", pendingAuthUrl);
  if (win) {
    win.show();
    win.focus();
  }
});

// Đăng ký giao thức deep link iotscale://
app.setAsDefaultProtocolClient("iotscale");

app.whenReady().then(() => {
  // Xử lý deep link trên macOS (open-url event)
  app.on("open-url", (_e, url) => {
    pendingAuthUrl = url;
    if (authWin) {
      authWin.close();
      authWin = null;
    }
    win?.webContents.send("auth-callback", url);
    if (win) {
      win.show();
      win.focus();
    }
  });

  // Khởi động server xác thực và SSE
  startAuthServer({ getAuthWin, setAuthWin, getWin, sendError });
  startSseServer();

  // Tạo cửa sổ chính và xử lý sự kiện đóng
  win = createWindow(isQuitting);
  win.on("close", async () => {
    await _reader?.disconnect();
    registerExitHooks(_reader);
    _reader = null;
  });

  // Tạo icon khay hệ thống
  tray = createTray({
    getWin,
    getIsQuitting: isQuitting,
    setIsQuitting: (v) => {
      _isQuitting = v;
    },
    tokensPath,
    sendError,
    app,
  });

  // Thiết lập module cập nhật tự động
  setupUpdater(getWin);

  // Hỏi người dùng có muốn khởi động cùng hệ thống không (lần đầu)
  const { wasOpenedAtLogin } = app.getLoginItemSettings();
  if (!wasOpenedAtLogin) askAutoStart();

  // Chuyển tiếp log từ scale tới renderer
  logger.on("log", (entry) => win?.webContents.send("log", entry));

  // Kết nối cân và đăng ký các sự kiện
  function startScale() {
    autoConnect()
      .then((reader) => {
        _reader = reader;
        registerExitHooks(_reader);

        // Phát sự kiện tới SSE và renderer
        function emit(event, patch = {}) {
          updateScaleState({ event, ...patch });
          const payload = sseEmit(event, patch);
          win?.webContents.send("scale", payload);
        }

        reader.on("connected", (info) => {
          setScaleConnected(true);
          updateScaleState({
            path: info.path ?? null,
            baudRate: info.baudRate ?? null,
            model: info.model ?? null,
            error: null,
            message: null,
          });
          emit("connected", info);
        });
        reader.on("weight", (data) => {
          emit("weight", data);
        });
        reader.on("disconnected", () => {
          setScaleConnected(false);
          updateScaleState({
            path: null,
            baudRate: null,
            weight: null,
            unit: null,
            error: null,
            message: null,
          });
          emit("disconnected");
        });
        reader.on("error", (err) => {
          updateScaleState({ error: err.message });
          emit("error", { message: err.message });
        });
      })
      .catch((err) => sendError(`[autoConnect] ${err?.stack || err}`));
  }

  // Ngắt kết nối cân hiện tại và kết nối lại
  async function reloadScale() {
    await _reader?.disconnect();
    _reader = null;
    setScaleConnected(false);
    updateScaleState({
      weight: null,
      unit: null,
      error: null,
      message: null,
      event: "disconnected",
    });
    win?.webContents.send("scale", { event: "disconnected" });
    startScale();
  }

  // Đăng ký các IPC handler cho renderer
  registerIpcHandlers({
    getWin,
    setAuthWin,
    getPendingAuthUrl,
    setPendingAuthUrl,
    autoUpdater,
    reloadScale,
  });

  startScale();
});

// Giữ ứng dụng chạy trong khay khi đóng tất cả cửa sổ
app.on("window-all-closed", () => {
  /* keep alive in tray */
});
app.on("activate", () => win?.show());
