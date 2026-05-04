const { Transform } = require('stream');

class EqualOrLineParser extends Transform {
  constructor() {
    super({ readableObjectMode: true });
    this.buffer = '';
  }

  _transform(chunk, encoding, callback) {
    this.buffer += chunk.toString('utf8');

    while (true) {
      // Case 1: message kết thúc bằng xuống dòng
      const newlineIndex = this.buffer.search(/\r?\n/);

      if (newlineIndex !== -1) {
        const line = this.buffer.slice(0, newlineIndex).trim();
        this.buffer = this.buffer.slice(newlineIndex + 1);

        if (line) {
          this.push({
            type: 'line',
            data: line
          });
        }

        continue;
      }

      // Case 2: message dạng =0.000000=0.000000
      const match = this.buffer.match(/^=([-+]?\d+(?:\.\d+)?)/);

      if (match) {
        const current = match[0]; // ví dụ "=0.000000"
        const nextStart = this.buffer.indexOf('=', current.length);

        if (nextStart !== -1) {
          this.push({
            type: 'equal-value',
            data: Number(match[1]),
            raw: current
          });

          this.buffer = this.buffer.slice(current.length);
          continue;
        }
      }

      break;
    }

    callback();
  }
}

module.exports = EqualOrLineParser;
