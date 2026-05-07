// ── Renderer main (uses shared ui-utils.js) ────────────────────────────────

const { log, toggle: toggleLogPause, clear: clearLogContent } = createLogger("log-body");

// Chuyển đổi tab hiển thị (overview / log)
function showTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll("nav button").forEach((b) => b.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
  document.querySelectorAll("nav button")[["overview", "log"].indexOf(name)].classList.add("active");
}

// Log controls
function toggleLog() {
  const paused = toggleLogPause();
  document.getElementById("btn-pause-log").textContent = paused ? "▶ Resume" : "⏸ Pause";
}
function clearLog() { clearLogContent(); }

// Hiển thị log từ scale module
window.scale.onLog(({ level, msg, ts }) => {
  const time = new Date(ts).toLocaleTimeString();
  const cls = level === "error" ? "error" : level === "warn" ? "warn" : "info";
  log(`[scale] ${msg}`, cls, time);
});

// Xử lý các sự kiện từ cân
window.scale.onEvent((data) => {
  if (data.event === "connected") {
    setScaleStatus("green", "Scale connected", `${data.path} @ ${data.baudRate} baud`);
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

// Bắt lỗi từ main process và renderer
window.scale.onAppError((msg) => log(`[main] ${msg}`, "error"));
window.onerror = (_msg, _src, _line, _col, err) => {
  log(`[renderer] ${err?.stack || err || _msg}`, "error");
  return true;
};
window.onunhandledrejection = (e) => {
  log(`[renderer:promise] ${e.reason?.stack || e.reason}`, "error");
};

// Tải và hiển thị cổng serial
async function loadPorts() {
  document.getElementById("ports-body").innerHTML = '<span class="empty">Loading…</span>';
  const [all, scale] = await Promise.all([
    window.scale.listPorts(),
    window.scale.listScalePorts(),
  ]);
  document.getElementById("ports-body").innerHTML = renderPortsTable(all, new Set(scale.map((p) => p.path)));
}

async function loadScalePorts() {
  document.getElementById("scale-ports-body").innerHTML = '<span class="empty">Loading…</span>';
  document.getElementById("scale-ports-body").innerHTML = renderPortsTable(await window.scale.listScalePorts());
}

loadPorts();
loadScalePorts();

// Đồng bộ trạng thái cân khi renderer load (sau reload/login)
window.scale.getScaleState().then((state) => {
  if (state?.connected) {
    setScaleStatus("green", "Scale connected", `${state.path} @ ${state.baudRate} baud`);
    if (state.weight != null) {
      document.getElementById("weight-val").textContent = state.weight;
      document.getElementById("weight-unit").textContent = state.unit || "";
    }
  }
});
