module.exports = {
  // Known USB-serial vendor IDs
  KNOWN_VIDS: ["0403", "067b", "10c4", "1a86", "0557"],

  // Default serial port settings
  SERIAL_DEFAULTS: {
    dataBits: 8,
    stopBits: 1,
    parity: "none",
    hupcl: false,
  },

  // openWithRetry
  OPEN_RETRIES: 5,
  OPEN_RETRY_DELAY_MS: 2000,

  // ScaleReader defaults
  READER_BAUD_RATE: 9600,
  READER_WEIGHT_DELTA: 0.01,
  READER_SILENCE_TIMEOUT_MS: 15000,
  READER_RECONNECT_DELAY_MS: 5000,
  READER_RECONNECT_MAX_DELAY_MS: 15000,
  READER_RECONNECT_MAX_ATTEMPTS: 3,

  // Signal polling
  SIGNAL_POLL_INTERVAL_MS: 2000,

  // Signal polling
  SIGNAL_POLL_INTERVAL_MS: 2000,

  // SSE interval
  SSE_STATE_INTERVAL_MS: 5000,

  WATCHER_POLL_INTERVAL_MS: 3000,
  WATCHER_PROBE_TIMEOUT_MS: 2000,
};
