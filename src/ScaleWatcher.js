

const { EventEmitter } = require("events");

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

module.exports = ScaleWatcher;