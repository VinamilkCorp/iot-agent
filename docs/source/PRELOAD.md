# `preload.js`

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
