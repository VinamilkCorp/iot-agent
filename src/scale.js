const { SerialPort } = require("serialport");
const EqualOrLineParser = require('./EqualOrLineParser');
const ScaleWatcher = require('./ScaleWatcher');
const ScaleReader = require('./ScaleReader');

const { MODEL_PROFILES, genericParse, log, openWithRetry } = require("./models");


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
    weight: data
      ?.toString("utf8")
      ?.replace(/[\x00-\x1F\x7F-\x9F]/g, "")
      ?.trim(),
    unit: "kg",
  };
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
    `findScalePorts: ${candidates.length} candidate(s) — ${candidates
      .map((p) => `${p.path} [VID:${p.vendorId || "?"}]`)
      .join(", ") || "none"
    }`
  );
  return candidates;
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
        if (port.isOpen) port.close(() => { });
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
          openedPort.close(() => { });
          return;
        }
        port = openedPort;
        // log("info", `openWithRetry: ${JSON.stringify(port)} portportport`);
        log(
          "info",
          `probePort: opened ${path} @ ${baudRate}, waiting for data…`
        );
        // Phân tích dữ liệu nhận được, khớp với profile cân đã biết
        // const parser = port.pipe(new ReadlineParser({ delimiter: "\r" }));
        const parser = port.pipe(new EqualOrLineParser());

        parser.on("data", (line) => {
          log("warn", `linetostring: ${line?.toString()}}`);
          // const result = parserWeightByteLength(line);
          // genericParse(line) ||
          // MODEL_PROFILES.reduce((acc, p) => acc || p.parse(line), null);

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
            `err ${(err, message)} ${JSON.stringify(err)}`
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
    `detectScale: probing ${candidates.length} port(s) × ${baudRates.length
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
  autoConnect,
  registerExitHooks,
};
