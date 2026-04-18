# Cách `scale.js` Hoạt Động

`scale.js` là lớp trừu tượng phần cứng. Xử lý toàn bộ từ việc phát hiện cổng đến stream cân trực tiếp và tự động kết nối lại.

### Phát Hiện Cổng

**`listPorts()`** — trả về tất cả cổng serial từ `SerialPort.list()`.

**`findScalePorts()`** — lọc danh sách để chỉ lấy các USB-serial adapter bằng cách khớp vendor ID đã biết (`FTDI`, `Prolific`, `Silicon Labs`, `CH340`, `ATEN`) hoặc chuỗi manufacturer. Giúp thu hẹp tập hợp cần probe trước khi thử giao tiếp.

### Dò Tìm (Probing)

**`openWithRetry(path, baudRate, retries, delayMs)`** — mở `SerialPort` với tối đa 8 lần thử lại (cách nhau 2 giây). Thử lại với các lỗi Windows tạm thời (`SetCommState`, `code 31`, `EACCES`, v.v.) và dừng ngay với các lỗi không thể thử lại.

**`probePort(path, baudRate, timeout)`** — mở cổng, gắn `ReadlineParser` (phân tách bằng `\r\n`), và chờ tối đa `timeout` ms để nhận dòng dữ liệu mà `genericParse` hoặc bất kỳ parser nào trong `MODEL_PROFILES` có thể nhận dạng. Resolve với `{ path, baudRate, sample }` khi nhận được dòng hợp lệ đầu tiên, reject khi timeout hoặc lỗi mở cổng.

**`detectScale(timeout)`** — gọi `findScalePorts()`, sau đó fan-out các lệnh gọi `probePort` song song trên mọi ứng viên × mọi baud rate đã biết (`Promise.all`). Trả về kết quả probe thành công đầu tiên. Throw nếu không tìm thấy ứng viên hoặc không có cổng nào phản hồi.

### ScaleReader

`ScaleReader extends EventEmitter` — quản lý kết nối bền vững, tự phục hồi đến một cổng duy nhất.

**`connect()`** — mở cổng qua `openWithRetry`, gắn `ReadlineParser`, và emit `connected`. Khi thất bại sẽ emit `error` và lên lịch kết nối lại.

**`_attachListeners(parser)`** — lắng nghe các dòng `data`, chạy `_detectModel` trên từng dòng, và chỉ emit `weight` khi giá trị thay đổi hơn `weightDelta` (mặc định `0.01`) để lọc nhiễu. Các dòng không nhận dạng được sẽ emit `raw`. Sự kiện `close` và `error` của cổng sẽ kích hoạt `_scheduleReconnect`.

**`_scheduleReconnect(delay, attempts)`** — chờ `delay` ms rồi gọi `_tryReopen`. Bỏ qua nếu đang ngắt kết nối hoặc watcher mode đang hoạt động.

**`_tryReopen(delay, attempts)`** — trước tiên thử mở lại cùng `path` (fast path). Nếu thất bại, gọi `detectScale()` để xử lý trường hợp Windows đổi số COM port. Sau 3 lần thất bại sẽ chuyển sang `ScaleWatcher` và chờ sự kiện cắm thiết bị.

**`disconnect()`** — đặt `_disconnecting = true`, hủy timer kết nối lại, và đóng cổng. Trả về Promise.

Các sự kiện emit: `connected`, `weight`, `disconnected`, `error`, `raw`.

### ScaleWatcher

`ScaleWatcher extends EventEmitter` — polling tìm thiết bị cân mới được cắm vào khi không có kết nối nào đang hoạt động.

Mỗi `pollInterval` ms (mặc định 3 giây) sẽ gọi `findScalePorts()`, so sánh với tập hợp path đã biết, và chạy `detectScale(probeTimeout)` trên bất kỳ cổng mới nào. Emit `scaleFound` với `{ path, baudRate }` khi thành công. Xóa các path biến mất giữa các lần poll.

### autoConnect

`autoConnect(options)` — điểm vào cấp cao nhất được gọi bởi `main.js`.

1. Gọi `detectScale()` ngay lập tức.
2. Nếu tìm thấy cân, tạo `ScaleReader` và gọi `connect()`, sau đó resolve với reader.
3. Nếu phát hiện thất bại (chưa cắm thiết bị), khởi động `ScaleWatcher` và chờ `scaleFound` trước khi kết nối. Promise không bao giờ reject — chờ vô thời hạn.

### registerExitHooks

Đăng ký các handler `process.once` cho `exit`, `SIGINT`, và `SIGTERM` để gọi `reader.disconnect()` và đảm bảo cổng serial được giải phóng sạch khi app tắt.

### logger

Một `EventEmitter` đơn giản emit các log entry `{ level, msg, ts }`. `main.js` chuyển tiếp chúng đến renderer qua `win.webContents.send("log", entry)` để hiển thị trong panel log của dashboard.
