const { autoUpdater } = require("electron-updater");

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.forceDevUpdateConfig = false;

function setupUpdater(getWin) {
  autoUpdater.on("checking-for-update", () =>
    getWin()?.webContents.send("update-status", { status: "checking" }),
  );
  autoUpdater.on("update-available", (info) =>
    getWin()?.webContents.send("update-status", { status: "available", version: info.version }),
  );
  autoUpdater.on("update-not-available", () =>
    getWin()?.webContents.send("update-status", { status: "not-available" }),
  );
  autoUpdater.on("download-progress", ({ percent }) =>
    getWin()?.webContents.send("update-status", { status: "downloading", percent: Math.floor(percent) }),
  );
  autoUpdater.on("update-downloaded", (info) =>
    getWin()?.webContents.send("update-status", { status: "downloaded", version: info.version }),
  );
  autoUpdater.on("error", (err) =>
    getWin()?.webContents.send("update-status", { status: "error", message: err.message }),
  );

}

module.exports = { setupUpdater, autoUpdater };
