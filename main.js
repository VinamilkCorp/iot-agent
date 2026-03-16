const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  dialog,
  nativeImage,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const http = require("http");
require("dotenv").config();
const {
  autoConnect,
  listPorts,
  findScalePorts,
  logger,
} = require("./src/scale");

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

let win;
let tray;
let authWin;
let authServer;

function startAuthServer() {
  if (authServer) return;
  try {
    const redirectUri = new URL(process.env.REDIRECT_URI);
    const port = redirectUri.port || 80;
    authServer = http
      .createServer((req, res) => {
        try {
          const url = new URL(req.url, redirectUri.origin);
          if (url.pathname === redirectUri.pathname) {
            const params = url.search.substring(1);
            if (authWin) { authWin.close(); authWin = null; }
            win?.webContents.send("auth-callback", params);
            if (win) { win.show(); win.focus(); }
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end("<html><body><p>Login successful.</p></body></html>");
          } else {
            res.writeHead(404);
            res.end();
          }
        } catch (err) {
          sendError(`[authServer:request] ${err?.stack || err}`);
          res.writeHead(500); res.end();
        }
      })
      .listen(port);
    authServer.on("error", (err) => sendError(`[authServer] ${err?.stack || err}`));
  } catch (err) {
    sendError(`[startAuthServer] ${err?.stack || err}`);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 700,
    title: "IoT Scale",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });
  win.loadFile("renderer/index.html");
  win.once("ready-to-show", () => win.show());
  win.on("close", (e) => {
    e.preventDefault();
    win.hide();
  });
  win.webContents.on("console-message", (_e, level, message) => {
    const prefix = ["log", "warn", "error", "debug"][level] ?? "log";
    process.stdout.write(`[renderer:${prefix}] ${message}\n`);
  });
}

function createTray() {
  const icon = nativeImage
    .createFromPath(path.join(__dirname, "assets", "tray-icon.png"))
    .resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("IoT Scale");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open",
        click: () => win.show(),
      },
      { type: "separator" },
      {
        label: "Debug",
        click: () => {
          win.show();
          win.webContents.openDevTools();
        },
      },
      { type: "separator" },
      {
        label: "Exit",
        click: () => {
          app.exit(0);
        },
      },
    ]),
  );
  tray.on("click", () => win.show());
}

function askAutoStart() {
  const choice = dialog.showMessageBoxSync({
    type: "question",
    buttons: ["Yes", "No"],
    defaultId: 0,
    title: "Auto-start",
    message: "Run IoT Scale automatically when Windows starts?",
  });
  app.setLoginItemSettings({ openAtLogin: choice === 0, openAsHidden: true });
}

// Single instance lock — on Windows the second instance carries the redirect URL
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let pendingAuthUrl = null;

// Windows: Keycloak opens a second instance with iotscale:// in argv
app.on("second-instance", (_e, argv) => {
  pendingAuthUrl = argv.find((a) => a.startsWith("iotscale://")) ?? null;
  console.log("[main] second-instance argv:", argv);
  console.log("[main] pendingAuthUrl:", pendingAuthUrl);
  if (pendingAuthUrl) win?.webContents.send("auth-callback", pendingAuthUrl);
  if (win) {
    win.show();
    win.focus();
  }
});

app.setAsDefaultProtocolClient("iotscale");

app.whenReady().then(() => {
  // macOS: Keycloak opens iotscale:// via open-url event
  app.on("open-url", (_e, url) => {
    pendingAuthUrl = url;
    win?.webContents.send("auth-callback", url);
    if (win) {
      win.show();
      win.focus();
    }
  });

  startAuthServer();
  createWindow();
  createTray();
  autoUpdater.checkForUpdatesAndNotify();

  const { wasOpenedAtLogin } = app.getLoginItemSettings();
  if (!wasOpenedAtLogin && app.getLoginItemSettings().openAtLogin === false)
    askAutoStart();

  logger.on("log", (entry) => win?.webContents.send("log", entry));

  autoConnect()
    .then((reader) => {
      reader.on("connected", (info) =>
        win?.webContents.send("scale", { event: "connected", ...info }),
      );
      reader.on("weight", (data) =>
        win?.webContents.send("scale", { event: "weight", ...data }),
      );
      reader.on("disconnected", () =>
        win?.webContents.send("scale", { event: "disconnected" }),
      );
      reader.on("error", (err) =>
        win?.webContents.send("scale", {
          event: "error",
          message: err.message,
        }),
      );
    })
    .catch((err) => sendError(`[autoConnect] ${err?.stack || err}`));
});

ipcMain.handle("list-ports", () => listPorts());
ipcMain.handle("list-scale-ports", () => findScalePorts());
ipcMain.handle("get-env", () => ({
  LOGIN_URL: process.env.LOGIN_URL,
  LOGIN_REALM: process.env.LOGIN_REALM,
  LOGIN_CLIENT_ID: process.env.LOGIN_CLIENT_ID,
  REDIRECT_URI: process.env.REDIRECT_URI,
}));
ipcMain.handle("open-login-url", (_e, url) => {
  authWin = new BrowserWindow({ width: 800, height: 700, title: "Login" });
  authWin.loadURL(url);
  authWin.on("closed", () => {
    authWin = null;
  });
});
ipcMain.handle("reload-with-callback", async (_e, fragment) => {
  await win?.webContents.executeJavaScript(
    `sessionStorage.setItem('kcCallback', ${JSON.stringify(fragment)})`,
  );
  win?.loadFile("renderer/index.html");
});
ipcMain.handle("get-pending-auth-url", () => {
  const url = pendingAuthUrl;
  pendingAuthUrl = null;
  return url;
});

app.on("window-all-closed", () => {
  /* keep alive in tray */
});
app.on("activate", () => win?.show());
