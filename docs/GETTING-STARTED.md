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
