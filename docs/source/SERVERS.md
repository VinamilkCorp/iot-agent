# `src/servers.js`

Chạy hai HTTP server trong main process để các ứng dụng bên ngoài có thể nhận dữ liệu cân mà không cần Electron IPC.

**SSE / WebSocket server** (cổng mặc định `3000`, cấu hình qua `SSE_PORT`):

- `GET /events` — SSE stream; gửi snapshot `scaleState` đầy đủ khi client kết nối, sau đó đẩy từng sự kiện theo thời gian thực. Cũng chấp nhận kết nối WebSocket trên cùng đường dẫn.
- `GET /scale/status` — trả về `scaleState` hiện tại dưới dạng JSON (hữu ích cho polling)
- `sseEmit(event, data)` — được gọi bởi `main.js` mỗi khi có sự kiện cân; broadcast đến tất cả SSE và WS client rồi trả về payload

**Auth redirect server** (cổng lấy từ `REDIRECT_URI` trong `.env`):

- Lắng nghe OAuth redirect từ Keycloak, trích xuất query string, chuyển tiếp đến renderer qua `auth-callback`, và phản hồi bằng trang HTML thông báo thành công
