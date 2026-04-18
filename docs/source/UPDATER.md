# `src/updater.js`

Bọc `electron-updater`. Auto-download và auto-install bị tắt theo mặc định — người dùng phải xác nhận thủ công. `setupUpdater(getWin)` kết nối tất cả sự kiện vòng đời của updater (`checking`, `available`, `not-available`, `downloading`, `downloaded`, `error`) thành các IPC message `update-status` gửi đến renderer.
