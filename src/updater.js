const { autoUpdater } = require("electron-updater");

// Tắt tự động tải và cài đặt, để người dùng quyết định
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.forceDevUpdateConfig = false;

// Đăng ký các sự kiện cập nhật và chuyển tiếp trạng thái tới renderer
function setupUpdater(getWin) {
  // Đang kiểm tra bản cập nhật
  autoUpdater.on("checking-for-update", () =>
    getWin()?.webContents.send("update-status", { status: "checking" }),
  );
  // Có bản cập nhật mới
  autoUpdater.on("update-available", (info) =>
    getWin()?.webContents.send("update-status", { status: "available", version: info.version }),
  );
  // Đang dùng phiên bản mới nhất
  autoUpdater.on("update-not-available", () =>
    getWin()?.webContents.send("update-status", { status: "not-available" }),
  );
  // Tiến trình tải bản cập nhật
  autoUpdater.on("download-progress", ({ percent }) =>
    getWin()?.webContents.send("update-status", { status: "downloading", percent: Math.floor(percent) }),
  );
  // Tải xong, sẵn sàng cài đặt
  autoUpdater.on("update-downloaded", (info) =>
    getWin()?.webContents.send("update-status", { status: "downloaded", version: info.version }),
  );
  // Lỗi trong quá trình cập nhật
  autoUpdater.on("error", (err) =>
    getWin()?.webContents.send("update-status", { status: "error", message: err.message }),
  );

}

module.exports = { setupUpdater, autoUpdater };
