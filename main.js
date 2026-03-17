const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  dialog,
  nativeImage,
  safeStorage,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const http = require("http");
const fs = require("fs");
require("dotenv").config({ path: path.join(app.isPackaged ? process.resourcesPath : __dirname, ".env") });
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
let sseClients = new Set();
let isQuitting = process.platform === "darwin";

function sseEmit(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) res.write(msg);
}

function startSseServer() {
  const port = parseInt(process.env.SSE_PORT || "3000", 10);
  http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname !== "/events") {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write("retry: 3000\n\n");
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
  }).listen(port, () => console.log(`[sse] listening on http://localhost:${port}/events`));
}

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

const REQUIRED_ENV = ["LOGIN_URL", "LOGIN_REALM", "LOGIN_CLIENT_ID", "REDIRECT_URI"];
const AUTH_REQUIRED = process.env.AUTH_REQUIRED !== "false";

function getMissingEnv() {
  return REQUIRED_ENV.filter((k) => !process.env[k]);
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
  const missing = AUTH_REQUIRED ? getMissingEnv() : [];
  if (missing.length) {
    win.loadFile("renderer/error.html", { query: { missing: missing.join(",") } });
  } else {
    win.loadFile("renderer/index.html");
  }
  win.once("ready-to-show", () => win.show());
  win.on("close", (e) => {
    if (isQuitting) return;
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
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", () => win.show());
}

function askAutoStart() {
  const flagPath = path.join(app.getPath("userData"), ".autostart-asked");
  if (fs.existsSync(flagPath)) return;
  fs.writeFileSync(flagPath, "");
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
  startSseServer();
  createWindow();
  createTray();
  autoUpdater.checkForUpdatesAndNotify();

  const { wasOpenedAtLogin } = app.getLoginItemSettings();
  if (!wasOpenedAtLogin) askAutoStart();

  logger.on("log", (entry) => win?.webContents.send("log", entry));

  autoConnect()
    .then((reader) => {
      reader.on("connected", (info) => {
        win?.webContents.send("scale", { event: "connected", ...info });
        sseEmit("connected", info);
      });
      reader.on("weight", (data) => {
        win?.webContents.send("scale", { event: "weight", ...data });
        sseEmit("weight", data);
      });
      reader.on("disconnected", () => {
        win?.webContents.send("scale", { event: "disconnected" });
        sseEmit("disconnected", {});
      });
      reader.on("error", (err) => {
        win?.webContents.send("scale", { event: "error", message: err.message });
        sseEmit("error", { message: err.message });
      });
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
  AUTH_REQUIRED,
}));

function tokensPath() {
  return path.join(app.getPath("userData"), "tokens.enc");
}
ipcMain.handle("save-tokens", (_e, tokens) => {
  try {
    const enc = safeStorage.encryptString(JSON.stringify(tokens));
    fs.writeFileSync(tokensPath(), enc);
  } catch (err) {
    sendError(`[save-tokens] ${err?.stack || err}`);
  }
});
ipcMain.handle("load-tokens", () => {
  try {
    if (!fs.existsSync(tokensPath())) return null;
    const enc = fs.readFileSync(tokensPath());
    return JSON.parse(safeStorage.decryptString(enc));
  } catch (err) {
    sendError(`[load-tokens] ${err?.stack || err}`);
    return null;
  }
});
ipcMain.handle("clear-tokens", () => {
  try {
    if (fs.existsSync(tokensPath())) fs.unlinkSync(tokensPath());
  } catch (err) {
    sendError(`[clear-tokens] ${err?.stack || err}`);
  }
});
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
