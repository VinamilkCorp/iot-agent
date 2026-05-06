
const { EventEmitter } = require("events");
const { SerialPort } = require("serialport");

const logger = new EventEmitter();

function log(level, msg) {
  logger.emit("log", { level, msg, ts: new Date().toISOString() });
}

// Cấu hình mặc định cho cổng serial
const SERIAL_DEFAULTS = {
  dataBits: 8,
  stopBits: 1,
  parity: "none",
  hupcl: false
};


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
        if (!err) return resolve(port);
        port.removeAllListeners();
        const isRetryable =
          /SetCommState|code 31|access denied|EACCES|port is not open|ERR_INVALID_STATE|ENXIO|cannot open|cannot find the file|device is not connected|not functioning|file not found/i.test(
            err.message
          ) || [2, 31, 1167].includes(err.cause?.errno ?? err.errno);
        if (n <= 1 || !isRetryable) return reject(err);
        log(
          "warn",
          `openWithRetry: ${err.message} — retrying in ${delayMs}ms… (${n - 1
          } left)`
        );
        setTimeout(() => attempt(n - 1), delayMs);
      });
    };
    attempt(retries);
  });
}

// Danh sách profile các model cân được hỗ trợ, mỗi profile có hàm parse riêng
const MODEL_PROFILES = [
  {
    name: "XK3190-T7E (Yaohua)",
    baudRate: 9600,
    // Phân tích chuỗi dữ liệu dạng "±số đơn_vị"
    parse: (line) => {
      const m = line?.match(/([+-]?\s*\d+\.?\d*)\s*(kg|g|lb)/i);
      return m
        ? {
            weight: parseFloat(m[1].replace(/\s/g, "")),
            unit: m[2].toLowerCase(),
          }
        : null;
    },
  },
  {
    name: "XK31970",
    baudRate: 9600,
    // =3.00000
    parse: (line) => {
      const m = line?.match(/=(\d+\.\d+)/);
      return m
        ? {
            weight: parseFloat(m[1].replace(/\s/g, "")),
            unit: "kg",
          }
        : null;
    },
  },
  {
    name: "XK3190-A9 (Yaohua)",
    baudRate: 9600,
    parse: (line) => {
      const m = line?.match(/([+-]?\s*\d+\.?\d*)\s*(kg|g|lb)/i);
      return m
        ? {
            weight: parseFloat(m[1].replace(/\s/g, "")),
            unit: m[2].toLowerCase(),
          }
        : null;
    },
  },
  {
    name: "XK3118T1 (Yaohua)",
    baudRate: 9600,
    // Format: "=00004.8(kg)"
    parse: (line) => {
      const m = line?.match(/^=([+-]?\d+\.?\d*)\((kg|g|lb)\)/i);
      return m ? { weight: parseFloat(m[1]), unit: m[2].toLowerCase() } : null;
    },
  },
  {
    name: "Defender 3000 i-D33P300B1X2 (OHAUS)",
    baudRate: 9600,
    // OHAUS continuous: " +0001.234 kg"
    parse: (line) => {
      const m = line?.match(/^\s*([+-]?\d+\.?\d*)\s*(kg|g|lb)/i);
      return m ? { weight: parseFloat(m[1]), unit: m[2].toLowerCase() } : null;
    },
  },
  {
    name: "IND231 (Mettler Toledo)",
    baudRate: 9600,
    // MT-SICS: "S S      1.234 kg" or "S D      1.234 kg"
    parse: (line) => {
      const m = line?.match(/^S\s+[SD]\s+([+-]?\d+\.?\d*)\s*(kg|g|lb)/i);
      return m ? { weight: parseFloat(m[1]), unit: m[2].toLowerCase() } : null;
    },
  },
  {
    name: "IND236 (Mettler Toledo)",
    baudRate: 9600,
    parse: (line) => {
      // MT-SICS: "S S      1.234 kg" or "S D      1.234 kg"
      const m = line?.match(/^S\s+[SD]\s+([+-]?\d+\.?\d*)\s*(kg|g|lb)/i);
      return m ? { weight: parseFloat(m[1]), unit: m[2].toLowerCase() } : null;
    },
  },
];

// Hàm phân tích chung cho các cân không khớp với profile cụ thể nào
function genericParse(line) {
  const m = line?.match(/([+-]?\d+\.?\d*)\s*(kg|g|lb)/i);
  return m ? { weight: parseFloat(m[1]), unit: m[2].toLowerCase() } : null;
}

function fixReversedNumber(str) {
  const match = str.match(/^=(\d+\.\d+)$/);
  if (!match) return str;

  // Strip the "=" and remove trailing zeros
  const raw = match[1].replace(/0+$/, "").replace(/\.$/, "");

  // Reverse all digit characters, keep the dot out
  const digitsOnly = raw.replace(".", "");
  const reversed = digitsOnly.split("").reverse().join("");

  // Re-insert decimal point at the mirrored position
  const originalDecimalPos = raw.indexOf(".");
  if (originalDecimalPos === -1) return reversed;

  // Decimal was N chars from the left in original → place it N chars from the right
  const fromRight = raw.length - 1 - originalDecimalPos;
  const insertAt = fromRight;

  return reversed.slice(0, insertAt) + "." + reversed.slice(insertAt);
}

module.exports = { MODEL_PROFILES, genericParse, fixReversedNumber, log, logger, openWithRetry, SERIAL_DEFAULTS };
