# Các File Nguồn

### `main.js`

Điểm khởi đầu của Electron. Các nhiệm vụ chính:

- Tải `.env` từ `resources/` (khi đã đóng gói) hoặc thư mục gốc dự án (khi dev)
- Đảm bảo chỉ chạy một instance — nếu mở lần thứ hai, deep-link `iotscale://` sẽ được chuyển tiếp đến instance đang chạy rồi thoát
- Đăng ký `iotscale://` làm giao thức URL tùy chỉnh để nhận OAuth callback
- Khi `app.whenReady`: khởi động SSE/WebSocket server, auth redirect server, tạo cửa sổ chính và system tray, thiết lập auto-updater, và gọi `autoConnect()` để tìm và mở kết nối cân
- Chuyển tiếp các sự kiện cân (`connected`, `weight`, `disconnected`, `error`) đến renderer qua `win.webContents.send("scale", payload)` và đến các client bên ngoài qua SSE/WS
- `reloadScale()` — ngắt kết nối reader hiện tại và khởi động lại `autoConnect()` mà không cần khởi động lại app
- Chuyển tiếp các lỗi chưa được xử lý (`uncaughtException`, `unhandledRejection`) đến renderer dưới dạng sự kiện `app-error`

### `preload.js`

Chạy trong ngữ cảnh renderer với quyền truy cập Node. Sử dụng `contextBridge` để expose API `window.scale` an toàn cho renderer:

| API                            | Mô tả                                                                     |
| ------------------------------ | ------------------------------------------------------------------------- |
| `onEvent(cb)`                  | Đăng ký nhận sự kiện cân (`connected`, `weight`, `disconnected`, `error`) |
| `onLog(cb)`                    | Đăng ký nhận các log nội bộ                                               |
| `listPorts()`                  | Liệt kê tất cả cổng serial                                                |
| `listScalePorts()`             | Liệt kê các cổng USB-serial là ứng viên kết nối cân                       |
| `getEnv()`                     | Lấy cấu hình Keycloak từ `.env`                                           |
| `onAuthCallback(cb)`           | Đăng ký nhận OAuth redirect callback                                      |
| `openLoginUrl(url)`            | Mở trang đăng nhập Keycloak trong cửa sổ con                              |
| `reloadApp()`                  | Tải lại renderer                                                          |
| `reloadWithCallback(fragment)` | Lưu OAuth fragment vào `sessionStorage` rồi tải lại                       |
| `getPendingAuthUrl()`          | Lấy và xóa URL deep-link `iotscale://` đang chờ xử lý                     |
| `saveTokens(tokens)`           | Mã hóa và lưu token xuống đĩa                                             |
| `loadTokens()`                 | Đọc và giải mã token từ đĩa                                               |
| `signOut()`                    | Xóa token và tải lại trang đăng nhập                                      |
| `checkForUpdates()`            | Kích hoạt kiểm tra cập nhật                                               |
| `onUpdateStatus(cb)`           | Đăng ký nhận sự kiện vòng đời cập nhật                                    |
| `installUpdate()`              | Thoát app và cài đặt bản cập nhật đã tải                                  |
| `cancelUpdate()`               | Hủy auto-download đang chờ                                                |

### `src/ipc.js`

Đăng ký tất cả các handler `ipcMain` hỗ trợ API `window.scale` được expose bởi `preload.js`.

- **Tokens** — `save-tokens`, `load-tokens`, `clear-tokens`: mã hóa/giải mã bằng `safeStorage` của Electron và ghi vào `<userData>/tokens.enc`
- **Auth** — `open-login-url`: mở `BrowserWindow` con cho Keycloak; `reload-with-callback`: lưu OAuth fragment và tải lại; `get-pending-auth-url`: trả về và xóa URL deep-link đang chờ; `sign-out`: xóa token và tải lại trang
- **Scale** — `reload-scale`: gọi `reloadScale()` trong main; `list-ports` / `list-scale-ports`: ủy quyền cho `scale.js`
- **Updater** — `check-for-updates`, `install-update`, `cancel-update`
- **App** — `reload-app`, `get-env`

### `src/servers.js`

Chạy hai HTTP server trong main process để các ứng dụng bên ngoài có thể nhận dữ liệu cân mà không cần Electron IPC.

**SSE / WebSocket server** (cổng mặc định `3000`, cấu hình qua `SSE_PORT`):

- `GET /events` — SSE stream; gửi snapshot `scaleState` đầy đủ khi client kết nối, sau đó đẩy từng sự kiện theo thời gian thực. Cũng chấp nhận kết nối WebSocket trên cùng đường dẫn.
- `GET /scale/status` — trả về `scaleState` hiện tại dưới dạng JSON (hữu ích cho polling)
- `sseEmit(event, data)` — được gọi bởi `main.js` mỗi khi có sự kiện cân; broadcast đến tất cả SSE và WS client rồi trả về payload

**Auth redirect server** (cổng lấy từ `REDIRECT_URI` trong `.env`):

- Lắng nghe OAuth redirect từ Keycloak, trích xuất query string, chuyển tiếp đến renderer qua `auth-callback`, và phản hồi bằng trang HTML thông báo thành công

### `src/window.js`

- `createWindow(isQuitting)` — tạo `BrowserWindow` chính (1100×700, context-isolated). Tải `renderer/error.html` nếu thiếu biến môi trường bắt buộc, ngược lại tải `renderer/index.html`. Ẩn cửa sổ thay vì đóng trừ khi `isQuitting()` trả về true. Chuyển tiếp console log của renderer ra stdout.
- `askAutoStart()` — hiển thị một lần sau khi cài đặt lần đầu; hỏi người dùng có muốn chạy app khi Windows khởi động không. Ghi file flag vào `userData` để chỉ hỏi một lần duy nhất.

### `src/tray.js`

Tạo icon system tray với context menu: **Open** (mở cửa sổ), **Debug** (mở DevTools), **Sign out** (đăng xuất), **Exit** (thoát). Nhấp vào icon sẽ hiển thị cửa sổ chính.

### `src/updater.js`

Bọc `electron-updater`. Auto-download và auto-install bị tắt theo mặc định — người dùng phải xác nhận thủ công. `setupUpdater(getWin)` kết nối tất cả sự kiện vòng đời của updater (`checking`, `available`, `not-available`, `downloading`, `downloaded`, `error`) thành các IPC message `update-status` gửi đến renderer.

### `src/models.js`

Định nghĩa `MODEL_PROFILES` — mảng các model cân đã biết, mỗi model có `name`, `baudRate` mặc định, và hàm `parse(line)` trích xuất `{ weight, unit }` từ dòng dữ liệu serial thô bằng regex.

Các model được hỗ trợ: XK3190-T7E, XK3190-A9, XK3118T1 (Yaohua), Defender 3000 (OHAUS), IND231, IND236 (Mettler Toledo).

`genericParse(line)` là fallback khớp với bất kỳ pattern `<số> <kg|g|lb>` nào bất kể model.

### `src/dashboard.js` / `src/dashboard.html`

Giao diện dashboard Electron được tải trong cửa sổ chính sau khi xác thực. Hiển thị số liệu cân theo thời gian thực, trạng thái kết nối, log, và thông báo cập nhật bằng cách đăng ký các sự kiện `window.scale`.
