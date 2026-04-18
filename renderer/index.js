// Chuyển đổi tab hiển thị (overview / log)
function showTab(name) {
  document
    .querySelectorAll(".tab")
    .forEach((t) => t.classList.remove("active"));
  document
    .querySelectorAll("nav button")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
  document
    .querySelectorAll("nav button")
    [["overview", "log"].indexOf(name)].classList.add("active");
}

// Hiển thị log từ scale module lên giao diện
window.scale.onLog(({ level, msg, ts }) => {
  const time = new Date(ts).toLocaleTimeString();
  const cls = level === "error" ? "error" : level === "warn" ? "warn" : "info";
  log(`[scale] ${msg}`, cls, time);
});

// Xử lý các sự kiện từ cân (connected, disconnected, weight, error)
window.scale.onEvent((data) => {
  if (data.event === "connected") {
    setScaleStatus(
      "green",
      "Scale connected",
      `${data.path} @ ${data.baudRate} baud`,
    );
    log(`[port] Connected — ${data.path} @ ${data.baudRate} baud`);
    loadScalePorts();
  }
  if (data.event === "disconnected") {
    setScaleStatus("yellow", "Waiting for scale…", "");
    document.getElementById("weight-val").textContent = "—";
    document.getElementById("weight-unit").textContent = "";
    log("[port] Disconnected — waiting for device…", "warn");
  }
  if (data.event === "weight") {
    document.getElementById("weight-val").textContent = data.weight;
    document.getElementById("weight-unit").textContent = data.unit;
    log(`[weight] ${data.weight} ${data.unit}  model=${data.model}`, "weight");
  }
  if (data.event === "error") {
    log(`[port] Error — ${data.message}`, "error");
  }
});

// Cập nhật trạng thái kết nối cân trên UI
function setScaleStatus(dot, text, meta = "") {
  document.getElementById("scale-dot").className = `dot ${dot}`;
  document.getElementById("scale-status-text").textContent = text;
  document.getElementById("scale-meta").textContent = meta;
}

// Quản lý log hiển thị trên giao diện
const logEl = document.getElementById("log-body");
let logPaused = false;
function toggleLog() {
  logPaused = !logPaused;
  document.getElementById("btn-pause-log").textContent = logPaused
    ? "▶ Resume"
    : "⏸ Pause";
}
function log(msg, cls = "info", time = new Date().toLocaleTimeString()) {
  if (logPaused) return;
  const line = document.createElement("div");
  line.className = `log-line ${cls}`;
  line.textContent = `[${time}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
  // Giới hạn tối đa 500 dòng log
  while (logEl.children.length > 500) logEl.removeChild(logEl.firstChild);
}
function clearLog() {
  logEl.innerHTML = "";
}

// Bắt và hiển thị lỗi từ main process và renderer
window.scale.onAppError((msg) => log(`[main] ${msg}`, "error"));
window.onerror = (_msg, _src, _line, _col, err) => {
  log(`[renderer] ${err?.stack || err || _msg}`, "error");
  return true;
};
window.onunhandledrejection = (e) => {
  log(`[renderer:promise] ${e.reason?.stack || e.reason}`, "error");
};

// Tạo bảng HTML hiển thị danh sách cổng serial
function renderPortsTable(ports, scalePaths = new Set()) {
  if (!ports.length) return '<span class="empty">No ports found</span>';
  return `<table><tr><th>Path</th><th>Manufacturer</th><th>VID</th><th>PID</th></tr>
    ${ports
      .map(
        (p) => `<tr>
      <td class="${scalePaths.has(p.path) ? "scale-port" : ""}">${p.path}</td>
      <td>${p.manufacturer || "—"}</td><td>${p.vendorId || "—"}</td><td>${p.productId || "—"}</td>
    </tr>`,
      )
      .join("")}</table>`;
}
// Tải và hiển thị tất cả cổng serial
async function loadPorts() {
  document.getElementById("ports-body").innerHTML =
    '<span class="empty">Loading…</span>';
  const [all, scale] = await Promise.all([
    window.scale.listPorts(),
    window.scale.listScalePorts(),
  ]);
  document.getElementById("ports-body").innerHTML = renderPortsTable(
    all,
    new Set(scale.map((p) => p.path)),
  );
}
// Tải và hiển thị chỉ các cổng cân
async function loadScalePorts() {
  document.getElementById("scale-ports-body").innerHTML =
    '<span class="empty">Loading…</span>';
  document.getElementById("scale-ports-body").innerHTML = renderPortsTable(
    await window.scale.listScalePorts(),
  );
}
loadPorts();
loadScalePorts();
