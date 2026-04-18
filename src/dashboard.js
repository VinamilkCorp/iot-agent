// Chuyển đổi tab hiển thị (overview / monitor / log)
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
    [["overview", "monitor", "log"].indexOf(name)].classList.add("active");
  if (name === "monitor") drawChart();
}

// Kết nối WebSocket tới server dashboard
const wsProto = location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${wsProto}://${location.host}`);

ws.onopen = () => {
  setWsStatus("green", "connected");
  log("WebSocket connected");
};
ws.onclose = () => {
  setWsStatus("red", "disconnected");
  log("WebSocket disconnected", "error");
};

// Xử lý sự kiện nhận từ WebSocket
ws.onmessage = (e) => {
  const data = JSON.parse(e.data);
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
    pushReading(data.weight, data.unit);
  }
};

// Cập nhật trạng thái kết nối WebSocket trên UI
function setWsStatus(dot, text) {
  document.getElementById("ws-status").innerHTML =
    `<span class="dot ${dot}"></span>${text}`;
}
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
function log(msg, cls = "info") {
  if (logPaused) return;
  const line = document.createElement("div");
  line.className = `log-line ${cls}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
  // Giới hạn tối đa 500 dòng log
  while (logEl.children.length > 500) logEl.removeChild(logEl.firstChild);
}
function clearLog() {
  logEl.innerHTML = "";
}

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
    fetch("/ports").then((r) => r.json()),
    fetch("/ports/scale").then((r) => r.json()),
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
    await fetch("/ports/scale").then((r) => r.json()),
  );
}
loadPorts();
loadScalePorts();

// Lịch sử cân nặng (tối đa 10 phút gần nhất)
const history = [];
let currentUnit = "";

// Thêm số liệu mới vào lịch sử và cập nhật thống kê
function pushReading(weight, unit) {
  currentUnit = unit;
  history.push({ t: new Date(), w: weight, unit });
  const cutoff = Date.now() - 600_000;
  while (history.length && history[0].t.getTime() < cutoff) history.shift();
  updateStats();
  if (document.getElementById("tab-monitor").classList.contains("active"))
    drawChart();
}

function clearHistory() {
  history.length = 0;
  updateStats();
  drawChart();
}
// Lấy khoảng thời gian hiển thị (giây) từ dropdown
function windowSec() {
  return parseInt(document.getElementById("window-select").value, 10);
}
// Lấy giá trị ngưỡng cảnh báo từ input
function threshold() {
  return parseFloat(document.getElementById("threshold-input").value) || null;
}

// Lọc các điểm dữ liệu trong khoảng thời gian hiển thị
function visiblePoints() {
  const cutoff = Date.now() - windowSec() * 1000;
  return history.filter((p) => p.t.getTime() >= cutoff);
}

// Cập nhật các thống kê: min, max, trung bình, giá trị cuối
function updateStats() {
  const pts = visiblePoints();
  document.getElementById("stat-count").textContent = pts.length;
  if (!pts.length) {
    ["stat-min", "stat-max", "stat-avg", "stat-last"].forEach(
      (id) => (document.getElementById(id).textContent = "—"),
    );
    return;
  }
  const vals = pts.map((p) => p.w);
  const fmt = (v) => `${v.toFixed(3)} ${currentUnit}`;
  document.getElementById("stat-min").textContent = fmt(Math.min(...vals));
  document.getElementById("stat-max").textContent = fmt(Math.max(...vals));
  document.getElementById("stat-avg").textContent = fmt(
    vals.reduce((a, b) => a + b, 0) / vals.length,
  );
  document.getElementById("stat-last").textContent = fmt(vals[vals.length - 1]);
}

// Vẽ biểu đồ cân nặng theo thời gian trên canvas
function drawChart() {
  const canvas = document.getElementById("chart");
  const wrap = document.getElementById("chart-wrap");
  const noMsg = document.getElementById("no-scale-msg");
  canvas.width = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const pts = visiblePoints();
  if (!pts.length) {
    noMsg.style.display = "block";
    return;
  }
  noMsg.style.display = "none";

  const W = canvas.width,
    H = canvas.height;
  const PAD = { top: 20, right: 20, bottom: 36, left: 60 };
  const cw = W - PAD.left - PAD.right;
  const ch = H - PAD.top - PAD.bottom;

  const vals = pts.map((p) => p.w);
  const times = pts.map((p) => p.t.getTime());
  let minV = Math.min(...vals),
    maxV = Math.max(...vals);
  // Đảm bảo có khoảng hiển thị khi tất cả giá trị bằng nhau
  if (minV === maxV) {
    minV -= 0.5;
    maxV += 0.5;
  }
  const rangeV = maxV - minV;
  const minT = times[0],
    maxT = times[times.length - 1];
  const rangeT = maxT - minT || 1;

  // Hàm chuyển đổi giá trị sang toạ độ canvas
  const xOf = (t) => PAD.left + ((t - minT) / rangeT) * cw;
  const yOf = (v) => PAD.top + (1 - (v - minV) / rangeV) * ch;

  // Vẽ lưới và nhãn trục Y
  ctx.strokeStyle = "#1e1e1e";
  ctx.lineWidth = 1;
  const yTicks = 5;
  ctx.fillStyle = "#555";
  ctx.font = "10px monospace";
  ctx.textAlign = "right";
  for (let i = 0; i <= yTicks; i++) {
    const v = minV + (rangeV * i) / yTicks,
      y = yOf(v);
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(W - PAD.right, y);
    ctx.stroke();
    ctx.fillText(v.toFixed(3), PAD.left - 6, y + 3);
  }

  // Vẽ nhãn trục X (thời gian)
  ctx.textAlign = "center";
  ctx.fillStyle = "#555";
  const xTicks = Math.min(6, pts.length);
  for (let i = 0; i <= xTicks; i++) {
    const t = minT + (rangeT * i) / xTicks;
    ctx.fillText(new Date(t).toLocaleTimeString(), xOf(t), H - PAD.bottom + 16);
  }

  // Vẽ đường ngưỡng cảnh báo nếu có
  const thr = threshold();
  if (thr !== null && thr >= minV && thr <= maxV) {
    ctx.strokeStyle = "#e53935";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const y = yOf(thr);
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(W - PAD.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#e53935";
    ctx.textAlign = "left";
    ctx.fillText(`threshold: ${thr}`, PAD.left + 4, y - 4);
  }
  ctx.setLineDash([]);

  // Vẽ đường biểu đồ chính
  ctx.strokeStyle = "#4caf50";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = xOf(p.t.getTime()),
      y = yOf(p.w);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Tô màu vùng dưới đường biểu đồ
  ctx.lineTo(xOf(times[times.length - 1]), PAD.top + ch);
  ctx.lineTo(xOf(times[0]), PAD.top + ch);
  ctx.closePath();
  ctx.fillStyle = "rgba(76,175,80,0.08)";
  ctx.fill();

  // Vẽ các điểm dữ liệu
  ctx.fillStyle = "#4caf50";
  pts.forEach((p) => {
    ctx.beginPath();
    ctx.arc(xOf(p.t.getTime()), yOf(p.w), 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Hiển thị đơn vị đo
  ctx.fillStyle = "#555";
  ctx.textAlign = "left";
  ctx.font = "10px monospace";
  ctx.fillText(currentUnit, 4, PAD.top);
}

// Vẽ lại biểu đồ khi thay đổi kích thước cửa sổ
window.addEventListener("resize", () => {
  if (document.getElementById("tab-monitor").classList.contains("active"))
    drawChart();
});
document.getElementById("window-select").addEventListener("change", () => {
  updateStats();
  drawChart();
});
document.getElementById("threshold-input").addEventListener("input", drawChart);

// Xuất lịch sử cân nặng ra file CSV
function exportCsv() {
  const rows = [
    "time,weight,unit",
    ...history.map((p) => `${p.t.toISOString()},${p.w},${p.unit}`),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: "weight-log.csv",
  });
  a.click();
}
