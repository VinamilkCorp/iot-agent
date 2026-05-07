const { SerialPort } = require("serialport");
const EqualOrLineParser = require("./EqualOrLineParser");
const { EventEmitter } = require("events");
const { MODEL_PROFILES, genericParse } = require("./models");

// ── Logger ──────────────────────────────────────────────────────────────────
const logger = new EventEmitter();
function log(level, msg) {
  logger.emit("log", { level, msg, ts: new Date().toISOString() });
}

// ── Constants ───────────────────────────────────────────────────────────────
const KNOWN_VIDS = ["0403", "067b", "10c4", "1a86", "0557"];
const SERIAL_DEFAULTS = { dataBits: 8, stopBits: 1, parity: "none", hupcl: false };
const RETRYABLE_ERR = /SetCommState|code 31|access denied|EACCES|port is not open|ERR_INVALID_STATE|ENXIO|cannot open|cannot find the file|device is not connected|not functioning|file not found/i;
const RETRYABLE_ERRNO = [2, 31, 1167];
const HEALTH_CHECK_INTERVAL_MS = 60_000; // Cảnh báo nếu không nhận weight trong 60s

// ── Weight parsing (shared) ─────────────────────────────────────────────────
function parseRawBytes(data) {
  const str = data?.toString("utf8")?.replace(/[\x00-\x1F\x7F-\x9F]/g, "")?.trim();
  if (!str) return null;
  const weight = parseFloat(str);
  return isNaN(weight) ? null : { weight, unit: "kg" };
}

function parseWeight(line) {
  if (typeof line === "string") {
    for (const profile of MODEL_PROFILES) {
      const result = profile.parse(line);
      if (result) return { model: profile.name, ...result };
    }
    const generic = genericParse(line);
    if (generic) return { model: "Generic", ...generic };
    return parseRawBytes(line);
  }
  if (typeof line === "object") return parseRawBytes(line);
  const generic = genericParse(line);
  return generic ? { model: "Generic", ...generic } : null;
}

// ── Port utilities ──────────────────────────────────────────────────────────
async function listPorts() {
  const ports = await SerialPort.list();
  log("info", `listPorts: found ${ports.length} port(s)`);
  return ports;
}

async function findScalePorts() {
  const ports = await SerialPort.list();
  const candidates = ports.filter((p) => {
    const vid = (p.vendorId || "").toLowerCase();
    return (
      KNOWN_VIDS.includes(vid) ||
      /usb|serial|uart|ch34|cp21|pl23|ftdi/i.test(p.manufacturer || "")
    );
  });
  log("info", `findScalePorts: ${candidates.length} candidate(s)`);
  return candidates;
}

function openWithRetry(path, baudRate, retries = 3, delayMs = 3000) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      const port = new SerialPort({ path, baudRate, ...SERIAL_DEFAULTS, autoOpen: false });
      port.open((err) => {
        if (!err) return resolve(port);
        port.removeAllListeners();
        const isRetryable =
          RETRYABLE_ERR.test(err.message) ||
          RETRYABLE_ERRNO.includes(err.cause?.errno ?? err.errno);
        if (n <= 1 || !isRetryable) return reject(err);
        log("warn", `openWithRetry: ${err.message} — retrying (${n - 1} left)`);
        setTimeout(() => attempt(n - 1), delayMs);
      });
    };
    attempt(retries);
  });
}

// ── Probe & Detect ──────────────────────────────────────────────────────────
function probePort(path, baudRate, timeout = 3000) {
  log("info", `probePort: trying ${path} @ ${baudRate}`);
  return new Promise((resolve, reject) => {
    let settled = false;
    let port = null;

    const done = (err, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (port) {
        port.removeAllListeners();
        if (port.isOpen) port.close(() => {});
      }
      err ? reject(err) : resolve(result);
    };

    const timer = setTimeout(
      () => done(new Error(`probePort timeout: ${path} @ ${baudRate}`)),
      timeout,
    );

    openWithRetry(path, baudRate)
      .then((openedPort) => {
        if (settled) { openedPort.close(() => {}); return; }
        port = openedPort;
        const parser = port.pipe(new EqualOrLineParser());
        parser.on("data", (line) => {
          const raw = typeof line === "object" ? line.data : line;
          if (parseWeight(raw)) {
            log("info", `probePort: matched ${path} @ ${baudRate}`);
            done(null, { path, baudRate, sample: raw });
          }
        });
        port.on("error", (err) => done(err));
      })
      .catch((err) => done(err));
  });
}

async function detectScale(timeout = 10000) {
  const candidates = await findScalePorts();
  if (!candidates.length) {
    throw Object.assign(
      new Error("detectScale: no USB-serial ports found"),
      { logged: (log("error", "detectScale: no USB-serial ports found"), true) },
    );
  }

  const baudRates = [...new Set(MODEL_PROFILES.map((p) => p.baudRate))];
  log("info", `detectScale: probing ${candidates.length} port(s) × ${baudRates.length} baud`);

  const probes = candidates.flatMap((c) =>
    baudRates.map((b) => probePort(c.path, b, timeout).catch(() => null)),
  );
  const found = (await Promise.all(probes)).find(Boolean);

  if (!found) {
    const msg = `detectScale: no response on [${candidates.map((c) => c.path).join(", ")}]`;
    log("error", msg);
    throw new Error(msg);
  }
  log("info", `detectScale: found ${found.path} @ ${found.baudRate}`);
  return found;
}

// ── ScaleReader ─────────────────────────────────────────────────────────────
class ScaleReader extends EventEmitter {
  constructor({ path, baudRate = 9600, weightDelta = 0.01 } = {}) {
    super();
    this.path = path;
    this.baudRate = baudRate;
    this._weightDelta = weightDelta;
    this._lastWeight = null;
    this._lastWeightTime = null;
    this._port = null;
    this._reconnectTimer = null;
    this._healthTimer = null;
    this._watcherActive = false;
    this._disconnecting = false;
  }

  connect() {
    this._disconnecting = false;
    this._closePort();
    log("info", `ScaleReader: opening ${this.path} @ ${this.baudRate}`);

    openWithRetry(this.path, this.baudRate)
      .then((port) => {
        if (this._disconnecting) { port.close(() => {}); return; }
        this._port = port;
        this._attachListeners(port.pipe(new EqualOrLineParser()));
        this._startHealthCheck();
        this.emit("connected", { path: this.path, baudRate: this.baudRate });
      })
      .catch((err) => {
        log("error", `ScaleReader: open failed — ${err.message}`);
        this.emit("error", err);
        this._scheduleReconnect();
      });
  }

  _startHealthCheck() {
    clearInterval(this._healthTimer);
    this._healthTimer = setInterval(() => {
      if (!this._lastWeightTime) {
        log("warn", `ScaleReader: no weight received since connect — port ${this.path}`);
        return;
      }
      const silentMs = Date.now() - this._lastWeightTime;
      if (silentMs > HEALTH_CHECK_INTERVAL_MS) {
        log("warn", `ScaleReader: no weight for ${Math.round(silentMs / 1000)}s — port ${this.path} may be unresponsive`);
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  _stopHealthCheck() {
    clearInterval(this._healthTimer);
    this._healthTimer = null;
  }

  _attachListeners(parser) {
    parser.on("data", (line) => {
      const raw = typeof line === "object" ? line.data : line;
      const data = parseWeight(raw);
      if (!data) {
        log("debug", `ScaleReader: unparseable data — "${raw}"`);
        this.emit("raw", raw);
        return;
      }
      // Bỏ qua thay đổi nhỏ hơn ngưỡng (chống nhiễu)
      if (
        this._lastWeight !== null &&
        Math.abs(data.weight - this._lastWeight) < this._weightDelta
      ) return;
      this._lastWeight = data.weight;
      this._lastWeightTime = Date.now();
      log("info", `ScaleReader: ${data.weight} ${data.unit} [${data.model}]`);
      this.emit("weight", data);
    });

    this._port.on("close", () => {
      log("warn", `ScaleReader: port closed — ${this.path}`);
      this._stopHealthCheck();
      this.emit("disconnected");
      if (!this._disconnecting) this._scheduleReconnect();
    });

    this._port.on("error", (err) => {
      log("error", `ScaleReader: port error — ${err.message}`);
      this._stopHealthCheck();
      this.emit("error", err);
      this._scheduleReconnect();
    });
  }

  _scheduleReconnect(delay = 5000, attempts = 0) {
    if (this._watcherActive || this._disconnecting) return;
    log("info", `ScaleReader: reconnect in ${delay}ms (attempt ${attempts + 1})`);
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => {
      if (this._disconnecting) return;
      this._closePort();
      this._tryReopen(delay, attempts);
    }, delay);
  }

  _tryReopen(delay, attempts) {
    if (this._disconnecting) return;
    openWithRetry(this.path, this.baudRate)
      .then((port) => {
        if (this._disconnecting) { port.close(() => {}); return; }
        log("info", `ScaleReader: reopened ${this.path}`);
        this._port = port;
        this._attachListeners(port.pipe(new EqualOrLineParser()));
        this._startHealthCheck();
        this.emit("connected", { path: this.path, baudRate: this.baudRate });
      })
      .catch(() => {
        detectScale()
          .then(({ path, baudRate }) => {
            this.path = path;
            this.baudRate = baudRate;
            this.connect();
          })
          .catch(() => {
            if (attempts >= 3) {
              this._startWatcher();
            } else {
              this._scheduleReconnect(Math.min(delay * 1.5, 15000), attempts + 1);
            }
          });
      })
      .catch((err) => {
        // Safety net: đảm bảo không bao giờ die, luôn quay lại reconnect
        log("error", `ScaleReader: unexpected error in _tryReopen — ${err.message}`);
        this._scheduleReconnect(delay, attempts + 1);
      });
  }

  _startWatcher() {
    log("info", "ScaleReader: switching to watcher mode — will keep polling until scale found");
    this._watcherActive = true;
    const watcher = new ScaleWatcher();
    watcher.once("scaleFound", ({ path, baudRate }) => {
      watcher.stop();
      this._watcherActive = false;
      this.path = path;
      this.baudRate = baudRate;
      log("info", `ScaleReader: watcher found scale at ${path} @ ${baudRate}`);
      this.connect();
    });
    watcher.start();
  }

  _closePort() {
    if (!this._port) return;
    this._port.removeAllListeners();
    if (this._port.isOpen) this._port.close(() => {});
    this._port = null;
  }

  async disconnect() {
    log("info", `ScaleReader: disconnecting ${this.path}`);
    this._disconnecting = true;
    this._stopHealthCheck();
    clearTimeout(this._reconnectTimer);
    if (!this._port?.isOpen) return;
    return new Promise((resolve) => this._port.close(() => resolve()));
  }
}

// ── ScaleWatcher ────────────────────────────────────────────────────────────
class ScaleWatcher extends EventEmitter {
  constructor({ pollInterval = 3000, probeTimeout = 2000 } = {}) {
    super();
    this._pollInterval = pollInterval;
    this._probeTimeout = probeTimeout;
    this._knownPaths = new Set();
    this._timer = null;
  }

  start() { this._poll(); return this; }
  stop() { clearTimeout(this._timer); }

  async _poll() {
    try {
      const candidates = await findScalePorts();
      const newPorts = candidates.filter((c) => !this._knownPaths.has(c.path));
      for (const c of newPorts) {
        this._knownPaths.add(c.path);
        detectScale(this._probeTimeout)
          .then((detected) => this.emit("scaleFound", detected))
          .catch(() => this._knownPaths.delete(c.path));
      }
      // Xoá cổng đã rút
      const current = new Set(candidates.map((c) => c.path));
      for (const p of this._knownPaths) {
        if (!current.has(p)) this._knownPaths.delete(p);
      }
    } catch { /* ignore */ }
    this._timer = setTimeout(() => this._poll(), this._pollInterval);
  }
}

// ── Auto-connect ────────────────────────────────────────────────────────────
async function autoConnect(options = {}) {
  log("info", "autoConnect: starting");
  return new Promise((resolve) => {
    const tryConnect = (detected) => {
      const reader = new ScaleReader({
        path: detected.path,
        baudRate: detected.baudRate,
        ...(options.weightDelta !== undefined && { weightDelta: options.weightDelta }),
      });
      reader.connect();
      resolve(reader);
    };

    detectScale(options.probeTimeout)
      .then(tryConnect)
      .catch((err) => {
        log("warn", `autoConnect: detect failed (${err.message}) — watching`);
        const watcher = new ScaleWatcher(options);
        watcher.once("scaleFound", (detected) => { watcher.stop(); tryConnect(detected); });
        watcher.start();
      });
  });
}

// ── Exit hooks ──────────────────────────────────────────────────────────────
let _exitCleanup = null;
function registerExitHooks(reader) {
  // Xoá listener cũ trước khi gắn mới (tránh tích luỹ)
  if (_exitCleanup) {
    process.removeListener("exit", _exitCleanup.exit);
    process.removeListener("SIGINT", _exitCleanup.sigint);
    process.removeListener("SIGTERM", _exitCleanup.sigterm);
  }
  if (!reader) { _exitCleanup = null; return; }
  const exit = () => reader.disconnect();
  const sigint = () => reader.disconnect().then(() => process.exit(0));
  const sigterm = () => reader.disconnect().then(() => process.exit(0));
  _exitCleanup = { exit, sigint, sigterm };
  process.once("exit", exit);
  process.once("SIGINT", sigint);
  process.once("SIGTERM", sigterm);
}

module.exports = {
  listPorts,
  findScalePorts,
  detectScale,
  probePort,
  ScaleReader,
  ScaleWatcher,
  autoConnect,
  registerExitHooks,
  logger,
};
