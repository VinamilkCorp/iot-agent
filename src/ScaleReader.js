
const { EventEmitter } = require("events");
const { log, openWithRetry, MODEL_PROFILES, genericParse } = require("./models");

function parserWeightByteLength(data) {
  return {
    weight: data
      ?.toString("utf8")
      ?.replace(/[\x00-\x1F\x7F-\x9F]/g, "")
      ?.trim(),
    unit: "kg",
  };
}

const EqualOrLineParser = require('./EqualOrLineParser');
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
        else {
          return parserWeightByteLength(line);
        }
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
      if (this._port.isOpen) this._port.close(() => { });
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
          port.close(() => { });
          return;
        }
        this._port = port;
        log(
          "info",
          `ScaleReader.connect: port open — ${this.path} @ ${this.baudRate} baud`
        );
        this._attachListeners(
          // port.pipe(new ReadlineParser({ delimiter: "\r\n" }))
          port.pipe(new EqualOrLineParser())
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
        `ScaleReader: raw signal — "${trimmed.data}" - ${JSON.stringify(trimmed)}`
      );
      const data = this._detectModel(trimmed.data);

      if (data) {
        log(
          "debug",
          `ScaleReader: parsed: ${JSON.stringify(data)} — weight=${data.weight} unit=${data.unit} model=${data.model}`
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
        `ScaleReader: port error on ${this.path} — ${err.message} (code:${err.cause?.errno ?? err.errno ?? "?"
        }${err.cause?.code
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
          port.close(() => { });
          return;
        }
        log("info", `ScaleReader: reopened ${this.path} (fast path)`);
        this._port = port;
        this._attachListeners(port.pipe(new EqualOrLineParser()));
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

module.exports = ScaleReader;