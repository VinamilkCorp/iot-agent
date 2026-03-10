const https = require("https");
const fs = require("fs");
const path = require("path");
const { execFile, spawn } = require("child_process");

const GITHUB_REPO = "VinamilkCorp/iot-agent"; // e.g. 'acme/iot-scale'
const CURRENT_VERSION = require("../package.json").version;

const ASSET_NAME = {
  win32: "iot-scale-win.exe",
  darwin: "iot-scale-macos",
  linux: "iot-scale-linux",
}[process.platform];

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "iot-scale-updater" } }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301)
          return get(res.headers.location).then(resolve).catch(reject);
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks) }),
        );
      })
      .on("error", reject);
  });
}

async function checkAndUpdate() {
  if (!ASSET_NAME || !process.pkg) return; // only run inside pkg binary

  try {
    const { body } = await get(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
    );
    const release = JSON.parse(body.toString());
    const latest = release.tag_name?.replace(/^v/, "");

    if (!latest || latest === CURRENT_VERSION) return;

    const asset = release.assets?.find((a) => a.name === ASSET_NAME);
    if (!asset) return;

    console.log(
      `Update available: v${CURRENT_VERSION} → v${latest}. Downloading...`,
    );

    const { body: binary } = await get(asset.browser_download_url);
    const self = process.execPath;
    const tmp = self + ".update";

    fs.writeFileSync(tmp, binary, { mode: 0o755 });

    // Replace self and restart
    if (process.platform === "win32") {
      // On Windows, can't replace a running exe — use a helper bat
      const bat = path.join(path.dirname(self), "_update.bat");
      fs.writeFileSync(
        bat,
        `@echo off\ntimeout /t 1 >nul\nmove /y "${tmp}" "${self}"\nstart "" "${self}"\ndel "%~f0"`,
      );
      spawn("cmd", ["/c", bat], { detached: true, stdio: "ignore" }).unref();
    } else {
      fs.renameSync(tmp, self);
      spawn(self, process.argv.slice(1), {
        detached: true,
        stdio: "inherit",
      }).unref();
    }

    console.log("Update applied, restarting...");
    process.exit(0);
  } catch (e) {
    // Silently ignore — update is best-effort
  }
}

module.exports = { checkAndUpdate };
