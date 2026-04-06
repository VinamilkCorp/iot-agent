const { BrowserWindow, app, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const REQUIRED_ENV = ["LOGIN_URL", "LOGIN_REALM", "LOGIN_CLIENT_ID", "REDIRECT_URI"];
const AUTH_REQUIRED = process.env.AUTH_REQUIRED !== "false";

function getMissingEnv() {
  return REQUIRED_ENV.filter((k) => !process.env[k]);
}

function createWindow(isQuitting) {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    title: "IoT Scale",
    icon: path.join(__dirname, "..", "assets", "favicon.png"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
    },
  });

  const missing = AUTH_REQUIRED ? getMissingEnv() : [];
  if (missing.length) {
    win.loadFile("renderer/error.html", { query: { missing: missing.join(",") } });
  } else {
    win.loadFile("renderer/index.html");
  }

  win.on("close", (e) => {
    if (isQuitting()) return;
    e.preventDefault();
    win.hide();
  });
  win.webContents.on("console-message", (_e, level, message) => {
    const prefix = ["log", "warn", "error", "debug"][level] ?? "log";
    process.stdout.write(`[renderer:${prefix}] ${message}\n`);
  });

  return win;
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

module.exports = { createWindow, askAutoStart, AUTH_REQUIRED };
