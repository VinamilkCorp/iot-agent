const { Tray, Menu, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");

// Tạo icon khay hệ thống với menu ngữ cảnh
function createTray({ getWin, setIsQuitting, tokensPath, sendError, app }) {
  // Tải và thu nhỏ icon cho khay hệ thống
  const icon = nativeImage
    .createFromPath(path.join(__dirname, "..", "assets", "favicon.png"))
    .resize({ width: 16, height: 16 });

  const tray = new Tray(icon);
  tray.setToolTip("IoT Scale");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      // Hiện cửa sổ chính
      { label: "Open", click: () => getWin()?.show() },
      { type: "separator" },
      // Mở DevTools để debug
      {
        label: "Debug",
        click: () => {
          getWin()?.show();
          getWin()?.webContents.openDevTools();
        },
      },
      { type: "separator" },
      // Đăng xuất: xoá token và quay về trang chủ
      {
        label: "Sign out",
        click: () => {
          try {
            if (fs.existsSync(tokensPath())) fs.unlinkSync(tokensPath());
          } catch (err) {
            sendError(`[sign-out] ${err?.stack || err}`);
          }
          getWin()?.loadFile("renderer/index.html");
          getWin()?.show();
        },
      },
      { type: "separator" },
      // Thoát ứng dụng hoàn toàn
      {
        label: "Exit",
        click: () => {
          setIsQuitting(true);
          app.quit();
        },
      },
    ]),
  );
  // Click vào icon khay để hiện cửa sổ
  tray.on("click", () => getWin()?.show());
  return tray;
}

module.exports = { createTray };
