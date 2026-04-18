# `src/ipc.js`

Đăng ký tất cả các handler `ipcMain` hỗ trợ API `window.scale` được expose bởi `preload.js`.

- **Tokens** — `save-tokens`, `load-tokens`, `clear-tokens`: mã hóa/giải mã bằng `safeStorage` của Electron và ghi vào `<userData>/tokens.enc`
- **Auth** — `open-login-url`: mở `BrowserWindow` con cho Keycloak; `reload-with-callback`: lưu OAuth fragment và tải lại; `get-pending-auth-url`: trả về và xóa URL deep-link đang chờ; `sign-out`: xóa token và tải lại trang
- **Scale** — `reload-scale`: gọi `reloadScale()` trong main; `list-ports` / `list-scale-ports`: ủy quyền cho `scale.js`
- **Updater** — `check-for-updates`, `install-update`, `cancel-update`
- **App** — `reload-app`, `get-env`
