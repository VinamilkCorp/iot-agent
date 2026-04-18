# `src/models.js`

Định nghĩa `MODEL_PROFILES` — mảng các model cân đã biết, mỗi model có `name`, `baudRate` mặc định, và hàm `parse(line)` trích xuất `{ weight, unit }` từ dòng dữ liệu serial thô bằng regex.

Các model được hỗ trợ: XK3190-T7E, XK3190-A9, XK3118T1 (Yaohua), Defender 3000 (OHAUS), IND231, IND236 (Mettler Toledo).

`genericParse(line)` là fallback khớp với bất kỳ pattern `<số> <kg|g|lb>` nào bất kể model.
