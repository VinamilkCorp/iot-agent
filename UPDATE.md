# Auto-Update

The app uses [electron-updater](https://www.electron.build/auto-update) to deliver updates automatically.

## Configuration

Set in `src/updater.js`:

| Option | Value | Meaning |
|---|---|---|
| `autoDownload` | `true` | Download update automatically once detected |
| `autoInstallOnAppQuit` | `true` | Install silently when the app quits |

## Flow

### On startup
`setupUpdater()` is called in `main.js` and immediately runs `autoUpdater.checkForUpdatesAndNotify()`.

### Manual check
The user can click **Check update** in the header, which calls `window.scale.checkForUpdates()` → IPC `check-for-updates` → `autoUpdater.checkForUpdates()`.

### State machine

```
app starts / user clicks "Check update"
        │
        ▼
   checking-for-update  →  update-status: { status: "checking" }
        │
        ├─ no update ──→  update-status: { status: "not-available" }  →  overlay hidden
        │
        └─ update found ─→  update-status: { status: "available", version }
                │
                ▼
         download-progress  →  update-status: { status: "downloading", percent }
                │
                ▼
         update-downloaded  →  update-status: { status: "downloaded", version }
                │
                ▼
         user clicks "Restart & Install"
                │
                ▼
         autoUpdater.quitAndInstall()
```

If an error occurs at any point → `update-status: { status: "error" }` → overlay hidden.

## IPC channels

| Channel | Direction | Description |
|---|---|---|
| `check-for-updates` | renderer → main | Trigger a manual update check |
| `update-status` | main → renderer | Push status updates to the UI |
| `install-update` | renderer → main | Quit and install the downloaded update |

## UI (renderer)

`renderer/index.html` listens via `window.scale.onUpdateStatus(cb)` and drives a full-screen overlay:

- **checking** — shows overlay with "Checking for updates…"
- **available** — shows version found, reveals progress bar
- **downloading** — updates progress bar and percentage text
- **downloaded** — shows "Restart & Install" button
- **not-available / error** — hides the overlay

## Publishing a New Update

Updates are published to GitHub Releases. The CI pipeline handles building and uploading automatically.

### Steps

1. Bump the version in `package.json`:
   ```bash
   npm version patch   # or minor / major
   ```
   This updates `package.json` and creates a local git tag (e.g. `v1.1.6`).

2. Push the commit and the tag:
   ```bash
   git push && git push --tags
   ```

3. GitHub Actions picks up the `v*` tag and runs the `Release` workflow (`.github/workflows/release.yml`):
   - Builds on both `windows-latest` and `macos-latest`
   - Runs `npm run publish` → `electron-builder --publish always`
   - Uploads the installers and `latest.yml` / `latest-mac.yml` manifests to the GitHub Release

4. Running app instances will detect the new release on their next check and download it automatically.

### Publish scripts

| Script | What it builds & publishes |
|---|---|
| `npm run publish` | Windows + macOS (used by CI) |
| `npm run publish:win` | Windows NSIS installer only |
| `npm run publish:winx64` | Windows x64 NSIS installer only |
| `npm run publish:mac` | macOS DMG only |
| `npm run publish:all` | Windows + macOS in one command |

> `GH_TOKEN` / `GITHUB_TOKEN` must have write access to the repo for the release upload to succeed.

## Files

| File | Role |
|---|---|
| `src/updater.js` | Configures `electron-updater`, wires events, runs initial check |
| `src/ipc.js` | Registers `check-for-updates` and `install-update` IPC handlers |
| `preload.js` | Exposes `checkForUpdates`, `installUpdate`, `onUpdateStatus` to renderer |
| `renderer/index.html` | Update overlay UI and status handler |
