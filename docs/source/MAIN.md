# `main.js`

Điểm khởi đầu của Electron. Các nhiệm vụ chính:

- Tải `.env` từ `resources/` (khi đã đóng gói) hoặc thư mục gốc dự án (khi dev)
- Đảm bảo chỉ chạy một instance — nếu mở lần thứ hai, deep-link `iotscale://` sẽ được chuyển tiếp đến instance đang chạy rồi thoát
- Đăng ký `iotscale://` làm giao thức URL tùy chỉnh để nhận OAuth callback
- Khi `app.whenReady`: khởi động SSE/WebSocket server, auth redirect server, tạo cửa sổ chính và system tray, thiết lập auto-updater, và gọi `autoConnect()` để tìm và mở kết nối cân
- Chuyển tiếp các sự kiện cân (`connected`, `weight`, `disconnected`, `error`) đến renderer qua `win.webContents.send("scale", payload)` và đến các client bên ngoài qua SSE/WS
- `reloadScale()` — ngắt kết nối reader hiện tại và khởi động lại `autoConnect()` mà không cần khởi động lại app
- Chuyển tiếp các lỗi chưa được xử lý (`uncaughtException`, `unhandledRejection`) đến renderer dưới dạng sự kiện `app-error`
