const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const { EventEmitter } = require("events");
const { MODEL_PROFILES, genericParse } = require("./models");

const KNOWN_VIDS = [
  "0403", // FTDI (most RS232-USB adapters)
  "067b", // Prolific PL2303
  "10c4", // Silicon Labs CP210x
  "1a86", // CH340/CH341 (cheap adapters)
  "0557", // ATEN
];

async function listPorts() {
  return SerialPort.list();
}

async function findScalePorts() {
  const ports = await SerialPort.list();
  return ports.filter((p) => {
    const vid = (p.vendorId || "").toLowerCase();
    return (
      KNOWN_VIDS.includes(vid) ||
      /usb|serial|uart|ch34|cp21|pl23|ftdi/i.test(p.manufacturer || "")
    );
  });
}

const SERIAL_DEFAULTS = { dataBits: 8, stopBits: 1, parity: "none" };

function probePort(path, baudRate, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const port = new SerialPort({ path, baudRate, ...SERIAL_DEFAULTS, autoOpen: false });
    const parser = port.pipe(new ReadlineParser({ delimiter: "\r\n" }));
    const timer = setTimeout(() => {
      port.close();
      reject(new Error(`timeout on ${path}@${baudRate}`));
    }, timeout);

    parser.on("data", (line) => {
      const result =
        genericParse(line) ||
        MODEL_PROFILES.reduce((acc, p) => acc || p.parse(line), null);
      if (result) {
        clearTimeout(timer);
        port.close();
        resolve({ path, baudRate, sample: line.trim() });
      }
    });

    port.open((err) => {
      if (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

async function detectScale(timeout = 3000) {
  const candidates = await findScalePorts();
  if (!candidates.length) throw new Error("No USB-serial ports found");

  const baudRates = [
    ...new Set(MODEL_PROFILES.map((p) => p.baudRate)),
    4800,
    19200,
  ];
  const probes = candidates.flatMap((c) =>
    baudRates.map((b) => probePort(c.path, b, timeout).catch(() => null)),
  );

  const results = await Promise.all(probes);
  const found = results.find(Boolean);
  if (!found) throw new Error("Scale not responding on any candidate port");
  return found;
}

class ScaleReader extends EventEmitter {
  constructor({ path, baudRate = 9600 } = {}) {
    super();
    this.path = path;
    this.baudRate = baudRate;
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
    this._port = new SerialPort({
      path: this.path,
      baudRate: this.baudRate,
      ...SERIAL_DEFAULTS,
      autoOpen: false,
    });
    const parser = this._port.pipe(new ReadlineParser({ delimiter: "\r\n" }));

    this._port.open((err) => {
      if (err) {
        this.emit("error", err);
        return this._scheduleReconnect();
      }
      this.emit("connected", { path: this.path, baudRate: this.baudRate });
    });

    parser.on("data", (line) => {
      const data = this._detectModel(line.trim());
      if (data) this.emit("weight", data);
      else this.emit("raw", line.trim());
    });

    this._port.on("close", () => {
      this.emit("disconnected");
      this._scheduleReconnect();
    });

    this._port.on("error", (err) => {
      this.emit("error", err);
      this._scheduleReconnect();
    });
  }

  _scheduleReconnect(delay = 3000) {
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  disconnect() {
    clearTimeout(this._reconnectTimer);
    if (this._port?.isOpen) this._port.close();
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
  return new Promise((resolve) => {
    const tryConnect = (detected) => {
      const reader = new ScaleReader({
        path: detected.path,
        baudRate: detected.baudRate,
      });
      reader.connect();
      resolve(reader);
    };

    detectScale(options.probeTimeout)
      .then(tryConnect)
      .catch(() => {
        console.log("No scale found, watching for device...");
        const watcher = new ScaleWatcher(options);
        watcher.once("scaleFound", (detected) => {
          watcher.stop();
          tryConnect(detected);
        });
        watcher.start();
      });
  });
}

module.exports = {
  listPorts,
  findScalePorts,
  detectScale,
  probePort,
  ScaleReader,
  ScaleWatcher,
  autoConnect,
};
