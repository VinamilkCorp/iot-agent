const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const { EventEmitter } = require("events");
const { MODEL_PROFILES, genericParse } = require("./models");

const logger = new EventEmitter();
function log(level, msg) {
  logger.emit("log", { level, msg, ts: new Date().toISOString() });
}

const KNOWN_VIDS = [
  "0403", // FTDI (most RS232-USB adapters)
  "067b", // Prolific PL2303
  "10c4", // Silicon Labs CP210x
  "1a86", // CH340/CH341 (cheap adapters)
  "0557", // ATEN
];

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
  log(
    "info",
    `findScalePorts: ${candidates.length} candidate(s) — ${candidates.map((p) => `${p.path} [VID:${p.vendorId || "?"}]`).join(", ") || "none"}`,
  );
  return candidates;
}

const SERIAL_DEFAULTS = {
  dataBits: 8,
  stopBits: 1,
  parity: "none",
  hupcl: false,
};

function openWithRetry(port, retries = 5, delayMs = 1500) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      port.open((err) => {
        if (!err) return resolve();
        const isRetryable = /SetCommState|code 31|access denied|EACCES/i.test(err.message);
        if (n <= 1 || !isRetryable) return reject(err);
        log(
          "warn",
          `openWithRetry: ${err.message} — retrying in ${delayMs}ms… (${n - 1} left)`,
        );
        setTimeout(() => attempt(n - 1), delayMs);
      });
    };
    attempt(retries);
  });
}

function probePort(path, baudRate, timeout = 3000) {
  log(
    "info",
    `probePort: trying ${path} @ ${baudRate} baud (dataBits:${SERIAL_DEFAULTS.dataBits} stopBits:${SERIAL_DEFAULTS.stopBits} parity:${SERIAL_DEFAULTS.parity})`,
  );
  return new Promise((resolve, reject) => {
    const port = new SerialPort({
      path,
      baudRate,
      ...SERIAL_DEFAULTS,
      autoOpen: false,
    });
    const parser = port.pipe(new ReadlineParser({ delimiter: "\r\n" }));
    const timer = setTimeout(() => {
      port.close();
      const err = new Error(
        `probePort timeout: no valid data from ${path} @ ${baudRate} baud after ${timeout}ms`,
      );
      log("warn", err.message);
      reject(err);
    }, timeout);

    parser.on("data", (line) => {
      const result =
        genericParse(line) ||
        MODEL_PROFILES.reduce((acc, p) => acc || p.parse(line), null);
      if (result) {
        clearTimeout(timer);
        port.close();
        log(
          "info",
          `probePort: matched ${path} @ ${baudRate} — sample: "${line.trim()}"`,
        );
        resolve({ path, baudRate, sample: line.trim() });
      }
    });

    openWithRetry(port)
      .then(() => {
        log(
          "info",
          `probePort: opened ${path} @ ${baudRate}, waiting for data…`,
        );
      })
      .catch((err) => {
        clearTimeout(timer);
        const isCommStateErr = /SetCommState|code 31/i.test(err.message);
        log(
          isCommStateErr ? "warn" : "error",
          `probePort: failed to open ${path} @ ${baudRate} — ${err.message}`,
        );
        reject(err);
      });
  });
}

async function detectScale(timeout = 3000) {
  const candidates = await findScalePorts();
  if (!candidates.length) {
    const err = new Error(
      "detectScale: no USB-serial ports found — check device connection and drivers",
    );
    log("error", err.message);
    throw err;
  }

  const baudRates = [
    ...new Set(MODEL_PROFILES.map((p) => p.baudRate)),
    4800,
    19200,
  ];
  log(
    "info",
    `detectScale: probing ${candidates.length} port(s) × ${baudRates.length} baud rates: [${baudRates.join(", ")}]`,
  );

  const probes = candidates.flatMap((c) =>
    baudRates.map((b) => probePort(c.path, b, timeout).catch(() => null)),
  );

  const results = await Promise.all(probes);
  const found = results.find(Boolean);
  if (!found) {
    const err = new Error(
      `detectScale: scale not responding on any candidate port [${candidates.map((c) => c.path).join(", ")}]`,
    );
    log("error", err.message);
    throw err;
  }
  log(
    "info",
    `detectScale: scale detected — ${found.path} @ ${found.baudRate} baud`,
  );
  return found;
}

class ScaleReader extends EventEmitter {
  constructor({ path, baudRate = 9600, weightDelta = 0.1 } = {}) {
    super();
    this.path = path;
    this.baudRate = baudRate;
    this._weightDelta = weightDelta;
    this._lastWeight = null;
    this._port = null;
    this._reconnectTimer = null;
  }

  _detectModel(line) {
    for (const profile of MODEL_PROFILES) {
      const result = profile.parse(line);
      if (result) return { model: profile.name, ...result };
    }
    const result = genericParse(line);
    return result ? { model: "Generic", ...result } : null;
  }

  connect() {
    this._disconnecting = false;
    log(
      "info",
      `ScaleReader.connect: opening ${this.path} @ ${this.baudRate} baud`,
    );
    this._port = new SerialPort({
      path: this.path,
      baudRate: this.baudRate,
      ...SERIAL_DEFAULTS,
      autoOpen: false,
    });
    const parser = this._port.pipe(new ReadlineParser({ delimiter: "\r\n" }));

    openWithRetry(this._port)
      .then(() => {
        log(
          "info",
          `ScaleReader.connect: port open — ${this.path} @ ${this.baudRate} baud`,
        );
        this.emit("connected", { path: this.path, baudRate: this.baudRate });
      })
      .catch((err) => {
        const isCommStateErr = /SetCommState|code 31/i.test(err.message);
        const detail = isCommStateErr
          ? `${err.message} — Windows driver rejected settings for ${this.path}, will retry`
          : `${err.message} (code:${err.cause?.errno ?? err.errno ?? "?"})`;

        log(
          isCommStateErr ? "warn" : "error",
          `ScaleReader.connect: failed to open ${this.path} — ${detail}`,
        );
        this.emit("error", Object.assign(err, { detail }));
        this._scheduleReconnect();
      });

    parser.on("data", (line) => {
      const trimmed = line.trim();
      const data = this._detectModel(trimmed);
      if (data) {
        if (
          this._lastWeight !== null &&
          Math.abs(data.weight - this._lastWeight) < this._weightDelta
        )
          return;
        this._lastWeight = data.weight;
        log(
          "info",
          `ScaleReader: weight=${data.weight} ${data.unit} model=${data.model} raw="${trimmed}"`,
        );
        this.emit("weight", data);
      } else {
        log("warn", `ScaleReader: unrecognised line — "${trimmed}"`);
        this.emit("raw", trimmed);
      }
    });

    this._port.on("close", () => {
      log("warn", `ScaleReader: port closed — ${this.path}`);
      this.emit("disconnected");
      if (!this._disconnecting) this._scheduleReconnect();
    });

    this._port.on("error", (err) => {
      log(
        "error",
        `ScaleReader: port error on ${this.path} — ${err.message} (code:${err.cause?.errno ?? err.errno ?? "?"}${err.cause?.code ? " " + err.cause.code : err.code ? " " + err.code : ""})`,
      );
      this.emit("error", err);
      this._scheduleReconnect();
    });
  }

  _scheduleReconnect(delay = 3000) {
    log("info", `ScaleReader: reconnecting in ${delay}ms…`);
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  disconnect() {
    log("info", `ScaleReader.disconnect: closing ${this.path}`);
    this._disconnecting = true;
    clearTimeout(this._reconnectTimer);
    return new Promise((resolve) => {
      if (this._port?.isOpen) this._port.close(() => resolve());
      else resolve();
    }).catch((reason) => {
      log("error", `Disconnecting reader from ${reason}`);
    });
  }
}

class ScaleWatcher extends EventEmitter {
  constructor({ pollInterval = 3000, probeTimeout = 3000 } = {}) {
    super();
    this._pollInterval = pollInterval;
    this._probeTimeout = probeTimeout;
    this._knownPaths = new Set();
    this._timer = null;
  }

  start() {
    this._poll();
    return this;
  }

  stop() {
    clearTimeout(this._timer);
  }

  async _poll() {
    try {
      const candidates = await findScalePorts();
      const newPorts = candidates.filter((c) => !this._knownPaths.has(c.path));

      for (const candidate of newPorts) {
        this._knownPaths.add(candidate.path);
        detectScale(this._probeTimeout)
          .then((detected) => this.emit("scaleFound", detected))
          .catch(() => this._knownPaths.delete(candidate.path));
      }

      const currentPaths = new Set(candidates.map((c) => c.path));
      for (const p of this._knownPaths) {
        if (!currentPaths.has(p)) this._knownPaths.delete(p);
      }
    } catch {
      /* ignore poll errors */
    }

    this._timer = setTimeout(() => this._poll(), this._pollInterval);
  }
}

async function autoConnect(options = {}) {
  log("info", "autoConnect: starting…");
  return new Promise((resolve) => {
    const tryConnect = (detected) => {
      log(
        "info",
        `autoConnect: connecting to ${detected.path} @ ${detected.baudRate} baud`,
      );
      const reader = new ScaleReader({
        path: detected.path,
        baudRate: detected.baudRate,
        ...(options.weightDelta !== undefined && {
          weightDelta: options.weightDelta,
        }),
      });
      reader.connect();
      resolve(reader);
    };

    detectScale(options.probeTimeout)
      .then(tryConnect)
      .catch((err) => {
        log(
          "warn",
          `autoConnect: initial detect failed (${err.message}) — watching for device…`,
        );
        const watcher = new ScaleWatcher(options);
        watcher.once("scaleFound", (detected) => {
          watcher.stop();
          tryConnect(detected);
        });
        watcher.start();
      });
  });
}

function registerExitHooks(reader) {
  const cleanup = () => reader.disconnect();
  process.once("exit", cleanup);
  process.once("SIGINT", () => reader.disconnect().then(() => process.exit(0)));
  process.once("SIGTERM", () => reader.disconnect().then(() => process.exit(0)));
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
