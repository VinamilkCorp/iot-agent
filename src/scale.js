const { SerialPort } = require("serialport");
// const { ReadlineParser } = require("@serialport/parser-readline");
const { ByteLengthParser } = require("@serialport/parser-byte-length");

const { EventEmitter } = require("events");
const { MODEL_PROFILES, genericParse, fixReversedNumber } = require("./models");

// Logger dùng EventEmitter để phát log ra ngoài (main process lắng nghe)
const logger = new EventEmitter();
function log(level, msg) {
  logger.emit("log", { level, msg, ts: new Date().toISOString() });
}

// Danh sách Vendor ID đã biết của các bộ chuyển đổi USB-Serial phổ biến
const KNOWN_VIDS = [
  "0403", // FTDI (most RS232-USB adapters)
  "067b", // Prolific PL2303
  "10c4", // Silicon Labs CP210x
  "1a86", // CH340/CH341 (cheap adapters)
  "0557", // ATEN
];

// Liệt kê tất cả cổng serial hiện có trên hệ thống
async function listPorts() {
  const ports = await SerialPort.list();
  log("info", `listPorts: found ${ports.length} port(s)`);
  return ports;
}

function parserWeightByteLength(data) {
  return {
    weight: fixReversedNumber(
      data
        ?.toString("utf8")
        ?.replace(/[\x00-\x1F\x7F-\x9F]/g, "")
        ?.trim()
    ),
    unit: "kg",
  };
  // return data?.toString("utf8")?.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
}

// Lọc các cổng có khả năng là cân (dựa trên VID hoặc tên nhà sản xuất)
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
    `findScalePorts: ${candidates.length} candidate(s) — ${
      candidates
        .map((p) => `${p.path} [VID:${p.vendorId || "?"}]`)
        .join(", ") || "none"
    }`
  );
  return candidates;
}

// Cấu hình mặc định cho cổng serial
const SERIAL_DEFAULTS = {
  dataBits: 8,
  stopBits: 1,
  parity: "none",
  hupcl: false,
  dtr: true,
};

// Mã lỗi có thể thử lại khi mở cổng
const UNKNOWN_ERROR = [2, 31, 1167];

// Mở cổng serial với cơ chế thử lại khi gặp lỗi tạm thời
function openWithRetry(path, baudRate, retries = 3, delayMs = 5000) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      const port = new SerialPort({
        path,
        baudRate,
        ...SERIAL_DEFAULTS,
        autoOpen: false,
      });
      port.open((err) => {
        log("warn", `aaaaa: ${err} left)`);
        if (!err) return resolve(port);
        port.removeAllListeners();
        const isRetryable =
          /SetCommState|code 31|access denied|EACCES|port is not open|ERR_INVALID_STATE|ENXIO|cannot open|cannot find the file|device is not connected|not functioning|file not found/i.test(
            err.message
          ) || [2, 31, 1167].includes(err.cause?.errno ?? err.errno);
        if (n <= 1 || !isRetryable) return reject(err);
        log(
          "warn",
          `openWithRetry: ${err.message} — retrying in ${delayMs}ms… (${
            n - 1
          } left)`
        );
        setTimeout(() => attempt(n - 1), delayMs);
      });
    };
    attempt(retries);
  });
}

// Thử kết nối và đọc dữ liệu từ một cổng/baud rate cụ thể trong thời gian timeout
function probePort(path, baudRate, timeout = 3000) {
  log("info", `probePort: trying ${path} @ ${baudRate} baud`);
  return new Promise((resolve, reject) => {
    let settled = false;
    let port = null;

    // Đảm bảo chỉ resolve/reject một lần và dọn dẹp tài nguyên
    const done = (err, result) => {
      log("done", `probePort Done: ${err} - ${result} `);
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (port) {
        log("warn", `portportport: ${port} left)`);
        port.removeAllListeners();
        if (port.isOpen) port.close(() => {});
      }
      err ? reject(err) : resolve(result);
    };

    // Timeout nếu không nhận được dữ liệu hợp lệ
    const timer = setTimeout(() => {
      done(
        new Error(
          `probePort timeout: no valid data from ${path} @ ${baudRate} baud after ${timeout}ms`
        )
      );
    }, timeout);

    openWithRetry(path, baudRate)
      .then((openedPort) => {
        if (settled) {
          openedPort.removeAllListeners();
          openedPort.close(() => {});
          return;
        }
        port = openedPort;
        log("info", `openWithRetry: ${JSON.stringify(port)} portportport`);
        log(
          "info",
          `probePort: opened ${path} @ ${baudRate}, waiting for data…`
        );
        // Phân tích dữ liệu nhận được, khớp với profile cân đã biết
        const parser = port.pipe(new ByteLengthParser({ length: 10 }));
        log(
          "info",
          `parserparserparserparser ${parser} ${JSON.stringify(parser)}`
        );
        parser.on("data", (line) => {
          // log("warn", `DataDataDataData: ${port.read()})`);
          log(
            "warn",
            `linelineline: ${line} left), typeof ${typeof line}, string ${String(
              line
            )}`
          );
          log("warn", `linetostring: ${line?.toString()}}`);
          const result = parserWeightByteLength(line);
          // genericParse(line) ||
          // MODEL_PROFILES.reduce((acc, p) => acc || p.parse(line), null);

          log("info", `resultresult: ${result}`);
          if (result) {
            log(
              "info",
              `probePort: matched ${path} @ ${baudRate} — sample: "${line}"`
            );
            done(null, { path, baudRate, sample: line });
          }
        });
        port.on("error", (err) => {
          log(
            "info",
            `errerrerrerrerr ${(err, message)} ${JSON.stringify(err)}`
          );
          return done(err);
        });
      })
      .catch((err) => {
        const isCommStateErr = /SetCommState|code 31/i.test(err.message);
        log(
          isCommStateErr ? "warn" : "error",
          `probePort: failed to open ${path} @ ${baudRate} — ${err.message}`
        );
        done(err);
      });
  });
}

// Tự động phát hiện cân bằng cách thử tất cả cổng và baud rate
async function detectScale(timeout = 10000) {
  const candidates = await findScalePorts();

  log(
    "warn",
    `candidatescandidatescandidates: ${JSON.stringify(candidates)} left)`
  );
  if (!candidates.length) {
    const err = new Error(
      "detectScale: no USB-serial ports found — check device connection and drivers"
    );
    log("error", err.message);
    throw err;
  }

  // Tổng hợp tất cả baud rate từ profile + các giá trị phổ biến
  const baudRates = [
    ...new Set(MODEL_PROFILES.map((p) => p.baudRate)),
    4800,
    19200,
  ];
  log(
    "info",
    `detectScale: probing ${candidates.length} port(s) × ${
      baudRates.length
    } baud rates: [${baudRates.join(", ")}]`
  );

  // Thử song song tất cả tổ hợp cổng × baud rate
  const probes = candidates.flatMap((c) =>
    baudRates.map((b) => probePort(c.path, b, timeout).catch(() => null))
  );

  const results = await Promise.all(probes);
  log("warn", `resultsresults: ${JSON.stringify(results)} left)`);
  const found = results.find(Boolean);
  if (!found) {
    const err = new Error(
      `detectScale: scale not responding on any candidate port [${candidates
        .map((c) => c.path)
        .join(", ")}]`
    );
    log("error", err.message);
    throw err;
  }
  log(
    "info",
    `detectScale: scale detected — ${found.path} @ ${found.baudRate} baud`
  );
  return found;
}

// Lớp đọc dữ liệu từ cân, tự động kết nối lại khi mất kết nối
class ScaleReader extends EventEmitter {
  constructor({ path, baudRate = 9600, weightDelta = 0.01 } = {}) {
    super();
    this.path = path;
    this.baudRate = baudRate;
    this._weightDelta = weightDelta;
    this._lastWeight = null;
    this._port = null;
    this._reconnectTimer = null;
    this._watcherActive = false;
  }

  // Nhận dạng model cân từ dòng dữ liệu thô
  _detectModel(line) {
    let result = {};
    if (typeof line === "string") {
      for (const profile of MODEL_PROFILES) {
        result = profile.parse(line);
        log("warn", `line ${line}`);

        log("warn", `detectmodal ${JSON.stringify(result)}`);
        if (result) return { model: profile.name, ...result };
      }
    } else if (typeof line === "object") {
      result = parserWeightByteLength(line);
    } else {
      result = genericParse(line);
    }
    return result ? { model: "Generic", ...result } : null;
  }

  // Mở kết nối tới cổng serial của cân
  connect() {
    this._disconnecting = false;
    if (this._port) {
      this._port.removeAllListeners();
      if (this._port.isOpen) this._port.close(() => {});
      this._port = null;
    }
    log(
      "info",
      `ScaleReader.connect: opening ${this.path} @ ${this.baudRate} baud`
    );

    openWithRetry(this.path, this.baudRate)
      .then((port) => {
        if (this._disconnecting) {
          port.removeAllListeners();
          port.close(() => {});
          return;
        }
        this._port = port;
        log(
          "info",
          `ScaleReader.connect: port open — ${this.path} @ ${this.baudRate} baud`
        );
        this._attachListeners(
          // port.pipe(new ReadlineParser({ delimiter: "\r\n" }))
          port.pipe(new ByteLengthParser({ length: 10 }))
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
          `ScaleReader.connect: failed to open ${this.path} — ${detail}`
        );
        this.emit("error", Object.assign(err, { detail }));
        this._scheduleReconnect();
      });
  }

  // Gắn listener cho parser (dữ liệu, đóng cổng, lỗi)
  _attachListeners(parser) {
    parser.on("data", (line) => {
      const trimmed = line;
      log(
        "debug",
        `ScaleReader: raw signal — "${trimmed}" (hex: ${Buffer.from(
          line
        ).toString("hex")})`
      );
      const data = this._detectModel(trimmed);
      if (data) {
        log(
          "debug",
          `ScaleReader: parsed — weight=${data.weight} unit=${data.unit} model=${data.model}`
        );
        // Bỏ qua nếu thay đổi cân nặng nhỏ hơn ngưỡng
        if (
          this._lastWeight !== null &&
          Math.abs(data.weight - this._lastWeight) < this._weightDelta
        )
          return;
        this._lastWeight = data.weight;
        log(
          "info",
          `ScaleReader: weight=${data.weight} ${data.unit} model=${data.model} raw="${trimmed}"`
        );
        this.emit("weight", data);
      } else {
        log("warn", `ScaleReader: unrecognised line — "${trimmed}"`);
        this.emit("raw", trimmed);
      }
    });

    // Lên lịch kết nối lại khi cổng bị đóng bất ngờ
    this._port.on("close", () => {
      log("warn", `ScaleReader: port closed — ${this.path}`);
      this.emit("disconnected");
      if (!this._disconnecting) this._scheduleReconnect();
    });

    this._port.on("error", (err) => {
      log(
        "error",
        `ScaleReader: port error on ${this.path} — ${err.message} (code:${
          err.cause?.errno ?? err.errno ?? "?"
        }${
          err.cause?.code
            ? " " + err.cause.code
            : err.code
            ? " " + err.code
            : ""
        })`
      );
      this.emit("error", err);
      this._scheduleReconnect();
    });
  }

  // Lên lịch thử kết nối lại sau một khoảng thời gian
  _scheduleReconnect(delay = 5000, attempts = 0) {
    if (this._watcherActive || this._disconnecting) return;
    log(
      "info",
      `ScaleReader: reconnecting in ${delay}ms… (attempt ${attempts + 1})`
    );
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => {
      if (this._disconnecting) return;
      // Đảm bảo cổng cũ được giải phóng hoàn toàn trước khi mở lại
      const cleanup = () => {
        if (this._port) {
          this._port.removeAllListeners();
          this._port = null;
        }
      };
      if (this._port && this._port.isOpen) {
        this._port.close(() => {
          cleanup();
          this._tryReopen(delay, attempts);
        });
      } else {
        cleanup();
        this._tryReopen(delay, attempts);
      }
    }, delay);
  }

  // Thử mở lại cổng cũ, nếu thất bại thì phát hiện lại cân
  _tryReopen(delay, attempts) {
    if (this._disconnecting) return;
    // Thử nhanh: mở lại cùng cổng
    openWithRetry(this.path, this.baudRate)
      .then((port) => {
        if (this._disconnecting) {
          port.removeAllListeners();
          port.close(() => {});
          return;
        }
        log("info", `ScaleReader: reopened ${this.path} (fast path)`);
        this._port = port;
        this._attachListeners(port.pipe(new ByteLengthParser({ length: 10 })));
        this.emit("connected", { path: this.path, baudRate: this.baudRate });
      })
      .catch(() => {
        // Dự phòng: phát hiện lại cân (Windows có thể đổi số COM port)
        detectScale()
          .then(({ path, baudRate }) => {
            this.path = path;
            this.baudRate = baudRate;
            this.connect();
          })
          .catch(() => {
            // Sau nhiều lần thất bại, chuyển sang chế độ watcher
            if (attempts >= 3) {
              log(
                "info",
                "ScaleReader: switching to watcher mode — waiting for device plug-in…"
              );
              this._watcherActive = true;
              const watcher = new ScaleWatcher();
              watcher.once("scaleFound", ({ path, baudRate }) => {
                watcher.stop();
                this._watcherActive = false;
                this.path = path;
                this.baudRate = baudRate;
                this.connect();
              });
              watcher.start();
            } else {
              this._scheduleReconnect(
                Math.min(delay * 1.5, 15000),
                attempts + 1
              );
            }
          });
      });
  }

  // Ngắt kết nối và dừng mọi timer
  disconnect() {
    log("info", `ScaleReader.disconnect: closing ${this.path}`);
    this._disconnecting = true;
    clearTimeout(this._reconnectTimer);
    return new Promise((resolve) => {
      if (!this._port || !this._port.isOpen) return resolve();
      this._port.close(() => resolve());
    }).catch((reason) => {
      log("error", `Disconnecting reader from ${reason}`);
    });
  }
}

// Lớp theo dõi thiết bị mới cắm vào, phát hiện cân khi xuất hiện
class ScaleWatcher extends EventEmitter {
  constructor({ pollInterval = 5000, probeTimeout = 5000 } = {}) {
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

  // Kiểm tra định kỳ các cổng mới xuất hiện
  async _poll() {
    try {
      const candidates = await findScalePorts();
      const newPorts = candidates.filter((c) => !this._knownPaths.has(c.path));

      // Thử phát hiện cân trên các cổng mới
      for (const candidate of newPorts) {
        this._knownPaths.add(candidate.path);
        detectScale(this._probeTimeout)
          .then((detected) => this.emit("scaleFound", detected))
          .catch(() => this._knownPaths.delete(candidate.path));
      }

      // Xoá các cổng đã bị rút khỏi danh sách theo dõi
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

// Tự động phát hiện và kết nối cân, nếu chưa có thì chờ thiết bị cắm vào
async function autoConnect(options = {}) {
  log("info", "autoConnect: starting…");
  return new Promise((resolve) => {
    const tryConnect = (detected) => {
      log(
        "info",
        `autoConnect: connecting to ${detected.path} @ ${detected.baudRate} baud`
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
          `autoConnect: initial detect failed (${err.message}) — watching for device…`
        );
        // Chờ thiết bị được cắm vào rồi kết nối
        const watcher = new ScaleWatcher(options);
        watcher.once("scaleFound", (detected) => {
          watcher.stop();
          tryConnect(detected);
        });
        watcher.start();
      });
  });
}

// Đăng ký hook dọn dẹp khi process thoát
function registerExitHooks(reader) {
  const cleanup = () => reader.disconnect();
  process.once("exit", cleanup);
  process.once("SIGINT", () => reader.disconnect().then(() => process.exit(0)));
  process.once("SIGTERM", () =>
    reader.disconnect().then(() => process.exit(0))
  );
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
