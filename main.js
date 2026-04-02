const { app } = require("electron");
const path = require("path");
require("dotenv").config({
  path: path.join(app.isPackaged ? process.resourcesPath : __dirname, ".env"),
});

const { autoConnect, logger } = require("./src/scale");
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

let win = null;
let tray = null;
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

function sendError(msg) {
  win?.webContents.send("app-error", msg);
}

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  sendError(`[uncaughtException] ${err?.stack || err}`);
});
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
  sendError(`[unhandledRejection] ${reason?.stack || reason}`);
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

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

app.setAsDefaultProtocolClient("iotscale");

app.whenReady().then(() => {
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

  startAuthServer({ getAuthWin, setAuthWin, getWin, sendError });
  startSseServer();

  win = createWindow(isQuitting);
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

  setupUpdater(getWin);

  const { wasOpenedAtLogin } = app.getLoginItemSettings();
  if (!wasOpenedAtLogin) askAutoStart();

  logger.on("log", (entry) => win?.webContents.send("log", entry));

  function startScale() {
    autoConnect()
      .then((reader) => {
        _reader = reader;
        function emit(event, patch = {}) {
          updateScaleState({ event, ...patch });
          sseEmit(event, patch);
          win?.webContents.send("scale", { event, ...patch });
        }

        reader.on("connected", (info) => {
          setScaleConnected(true);
          updateScaleState({
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

  function reloadScale() {
    _reader?.disconnect();
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

app.on("before-quit", () => {
  _reader?.disconnect();
  _reader = null;
});
app.on("window-all-closed", () => {
  /* keep alive in tray */
});
app.on("activate", () => win?.show());
