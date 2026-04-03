const { Tray, Menu, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");

function createTray({ getWin, setIsQuitting, tokensPath, sendError, app }) {
  const icon = nativeImage
    .createFromPath(path.join(__dirname, "..", "assets", "favicon.png"))
    .resize({ width: 16, height: 16 });

  const tray = new Tray(icon);
  tray.setToolTip("IoT Scale");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open", click: () => getWin()?.show() },
      { type: "separator" },
      {
        label: "Debug",
        click: () => {
          getWin()?.show();
          getWin()?.webContents.openDevTools();
        },
      },
      { type: "separator" },
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
      {
        label: "Exit",
        click: () => {
          setIsQuitting(true);
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", () => getWin()?.show());
  return tray;
}

module.exports = { createTray };
