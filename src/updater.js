const { autoUpdater } = require("electron-updater");

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function checkAndUpdate(mainWindow) {
  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on("update-downloaded", () => {
    mainWindow.webContents.send("update-ready");
  });
}

module.exports = { checkAndUpdate };
