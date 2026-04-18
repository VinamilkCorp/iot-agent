# Bắt Đầu

### Chạy môi trường phát triển

```bash
npm install
npm start
```

### Build & Publish

| Lệnh                  | Mô tả                              |
| --------------------- | ---------------------------------- |
| `npm run build`       | Build cho nền tảng hiện tại        |
| `npm run build:win`   | Build bộ cài đặt Windows           |
| `npm run build:mac`   | Build file DMG cho macOS           |
| `npm run publish:win` | Publish Windows (cả hai kiến trúc) |
| **`npm run publish:winN`** | **⭐ Lệnh publish chính — chạy cả ia32 và x64 song song trên Windows** |
| `npm run publish:mac` | Publish macOS |
| `npm run publish:all` | Publish Windows + macOS |

Publish sẽ đẩy bản phát hành lên GitHub (`VinamilkCorp/iot-agent`) thông qua `electron-builder`. Yêu cầu biến môi trường `GH_TOKEN` hợp lệ có quyền ghi vào repo.

### Sau khi Publish — Phát Hành Bản Cập Nhật

Sau khi lệnh publish chạy xong, bản build sẽ được đẩy lên GitHub dưới dạng **draft release** (bản nháp). Cần thực hiện thêm các bước sau để người dùng nhận được cập nhật:

1. Đăng nhập vào tài khoản GitHub có quyền quản lý repo `VinamilkCorp/iot-agent`
2. Vào trang **Releases**: `https://github.com/VinamilkCorp/iot-agent/releases`
3. Tìm bản draft vừa được tạo (có nhãn **Draft**)
4. Nhấn **Edit** trên bản draft đó, sau đó nhấn **Publish release** để chuyển thành bản phát hành chính thức
5. Yêu cầu người dùng mở app, vào menu và nhấn nút **Cập nhật** — app sẽ tự động phát hiện bản mới và tải về
