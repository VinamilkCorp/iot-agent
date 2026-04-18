# Các File Nguồn

| File | Mô tả |
| ---- | ----- |
| [main.js](source/MAIN.md) | Điểm khởi đầu Electron — khởi động app, kết nối cân, quản lý vòng đời |
| [preload.js](source/PRELOAD.md) | Bridge an toàn giữa main process và renderer qua `window.scale` API |
| [src/ipc.js](source/IPC.md) | Đăng ký tất cả `ipcMain` handler cho tokens, auth, scale, updater |
| [src/servers.js](source/SERVERS.md) | SSE / WebSocket server và auth redirect server |
| [src/window.js](source/WINDOW.md) | Tạo cửa sổ chính và hỏi auto-start khi cài lần đầu |
| [src/tray.js](source/TRAY.md) | System tray icon và context menu |
| [src/updater.js](source/UPDATER.md) | Quản lý vòng đời cập nhật qua `electron-updater` |
| [src/models.js](source/MODELS.md) | Danh sách model cân và parser dữ liệu serial |
| [src/dashboard.js](source/DASHBOARD.md) | Giao diện dashboard hiển thị cân và log theo thời gian thực |
