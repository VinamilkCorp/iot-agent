const { Transform } = require('stream');

class AutoMessageParser extends Transform {
  constructor(options = {}) {
    super({ readableObjectMode: true });

    this.buffer = Buffer.alloc(0);
    this.fixedLength = options.fixedLength || 8;
    this.delimiter = Buffer.from(options.delimiter || '\n');
    this.encoding = options.encoding || 'utf8';
  }

  isTextBuffer(buf) {
    return [...buf].every((byte) => {
      return (
        byte === 0x0a || // \n
        byte === 0x0d || // \r
        byte === 0x09 || // tab
        (byte >= 0x20 && byte <= 0x7e) // printable ASCII
      );
    });
  }

  _transform(chunk, encoding, callback) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length > 0) {
      const delimiterIndex = this.buffer.indexOf(this.delimiter);

      if (delimiterIndex !== -1) {
        const candidate = this.buffer.slice(0, delimiterIndex);
        const fullLine = this.buffer.slice(
          0,
          delimiterIndex + this.delimiter.length
        );

        if (this.isTextBuffer(fullLine)) {
          this.buffer = this.buffer.slice(delimiterIndex + this.delimiter.length);

          this.push({
            type: 'line',
            data: candidate.toString(this.encoding),
            raw: fullLine
          });

          continue;
        }
      }

      if (this.buffer.length >= this.fixedLength) {
        const frame = this.buffer.slice(0, this.fixedLength);
        this.buffer = this.buffer.slice(this.fixedLength);

        this.push({
          type: 'fixed',
          data: frame,
          raw: frame
        });

        continue;
      }

      break;
    }

    callback();
  }

  _flush(callback) {
    if (this.buffer.length > 0) {
      this.push({
        type: 'unknown',
        data: this.buffer,
        raw: this.buffer
      });
    }

    callback();
  }
}

module.exports = AutoMessageParser;
