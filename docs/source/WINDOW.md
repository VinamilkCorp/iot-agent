# `src/window.js`

- `createWindow(isQuitting)` — tạo `BrowserWindow` chính (1100×700, context-isolated). Tải `renderer/error.html` nếu thiếu biến môi trường bắt buộc, ngược lại tải `renderer/index.html`. Ẩn cửa sổ thay vì đóng trừ khi `isQuitting()` trả về true. Chuyển tiếp console log của renderer ra stdout.
- `askAutoStart()` — hiển thị một lần sau khi cài đặt lần đầu; hỏi người dùng có muốn chạy app khi Windows khởi động không. Ghi file flag vào `userData` để chỉ hỏi một lần duy nhất.
