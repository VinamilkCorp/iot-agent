// ── Shared UI utilities (dùng chung cho renderer/index.js và src/dashboard.js) ──

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function setScaleStatus(dot, text, meta = "") {
  document.getElementById("scale-dot").className = `dot ${dot}`;
  document.getElementById("scale-status-text").textContent = text;
  document.getElementById("scale-meta").textContent = meta;
}

function renderPortsTable(ports, scalePaths = new Set()) {
  if (!ports.length) return '<span class="empty">No ports found</span>';
  return `<table><tr><th>Path</th><th>Manufacturer</th><th>VID</th><th>PID</th></tr>
    ${ports
      .map(
        (p) => `<tr>
      <td class="${scalePaths.has(p.path) ? "scale-port" : ""}">${escapeHtml(p.path)}</td>
      <td>${escapeHtml(p.manufacturer || "—")}</td><td>${escapeHtml(p.vendorId || "—")}</td><td>${escapeHtml(p.productId || "—")}</td>
    </tr>`,
      )
      .join("")}</table>`;
}

function createLogger(elementId, { maxLines = 500 } = {}) {
  const logEl = document.getElementById(elementId);
  let paused = false;

  function log(msg, cls = "info", time = new Date().toLocaleTimeString()) {
    if (paused) return;
    const line = document.createElement("div");
    line.className = `log-line ${cls}`;
    line.textContent = `[${time}] ${msg}`;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
    while (logEl.children.length > maxLines) logEl.removeChild(logEl.firstChild);
  }

  function toggle() {
    paused = !paused;
    return paused;
  }

  function clear() {
    logEl.innerHTML = "";
  }

  return { log, toggle, clear, isPaused: () => paused };
}
