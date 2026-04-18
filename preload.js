const { contextBridge, ipcRenderer, app } = require("electron");

const version = app?.getVersion() ?? "1.0.0";

// Expose API an toàn từ main process sang renderer qua contextBridge
contextBridge.exposeInMainWorld("scale", {
  version,
  // Lắng nghe sự kiện từ cân (connected, weight, disconnected, error)
  onEvent: (cb) => ipcRenderer.on("scale", (_e, data) => cb(data)),
  // Lắng nghe log từ scale module
  onLog: (cb) => ipcRenderer.on("log", (_e, entry) => cb(entry)),
  // Lấy danh sách tất cả cổng serial
  listPorts: () => ipcRenderer.invoke("list-ports"),
  // Lấy danh sách cổng có khả năng là cân
  listScalePorts: () => ipcRenderer.invoke("list-scale-ports"),
  // Lấy biến môi trường cần thiết cho renderer
  getEnv: () => ipcRenderer.invoke("get-env"),
  // Lắng nghe callback xác thực OAuth
  onAuthCallback: (cb) => ipcRenderer.on("auth-callback", (_e, url) => cb(url)),
  // Tải lại ứng dụng
  reloadApp: () => ipcRenderer.invoke("reload-app"),
  // Tải lại và lưu fragment callback vào sessionStorage
  reloadWithCallback: (fragment) =>
    ipcRenderer.invoke("reload-with-callback", fragment),
  // Lấy URL callback OAuth đang chờ xử lý
  getPendingAuthUrl: () => ipcRenderer.invoke("get-pending-auth-url"),
  // Mở URL đăng nhập trong cửa sổ trình duyệt
  openLoginUrl: (url) => ipcRenderer.invoke("open-login-url", url),
  // Lắng nghe lỗi từ main process
  onAppError: (cb) => ipcRenderer.on("app-error", (_e, msg) => cb(msg)),
  // Lắng nghe trạng thái cập nhật ứng dụng
  onUpdateStatus: (cb) =>
    ipcRenderer.on("update-status", (_e, data) => cb(data)),
  // Huỷ tải bản cập nhật
  cancelUpdate: () => ipcRenderer.send("cancel-update"),
  // Cài đặt bản cập nhật đã tải
  installUpdate: () => ipcRenderer.send("install-update"),
  // Kiểm tra bản cập nhật mới
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  // Lưu token xác thực (mã hoá)
  saveTokens: (tokens) => ipcRenderer.invoke("save-tokens", tokens),
  // Tải token xác thực đã lưu
  loadTokens: () => ipcRenderer.invoke("load-tokens"),
  // Đăng xuất và xoá token
  signOut: () => ipcRenderer.invoke("sign-out"),
});
