const MODEL_PROFILES = [
  {
    name: "XK3190-T7E (Yaohua)",
    baudRate: 9600,
    parse: (line) => {
      const m = line.match(/([+-]?\s*\d+\.?\d*)\s*(kg|g|lb)/i);
      return m
        ? {
            weight: parseFloat(m[1].replace(/\s/g, "")),
            unit: m[2].toLowerCase(),
          }
        : null;
    },
  },
  {
    name: "XK3190-A9 (Yaohua)",
    baudRate: 9600,
    parse: (line) => {
      const m = line.match(/([+-]?\s*\d+\.?\d*)\s*(kg|g|lb)/i);
      return m
        ? {
            weight: parseFloat(m[1].replace(/\s/g, "")),
            unit: m[2].toLowerCase(),
          }
        : null;
    },
  },
  {
    name: "IND231 (Mettler Toledo)",
    baudRate: 9600,
    // MT-SICS: "S S      1.234 kg" or "S D      1.234 kg"
    parse: (line) => {
      const m = line.match(/^S\s+[SD]\s+([+-]?\d+\.?\d*)\s*(kg|g|lb)/i);
      return m ? { weight: parseFloat(m[1]), unit: m[2].toLowerCase() } : null;
    },
  },
  {
    name: "IND236 (Mettler Toledo)",
    baudRate: 9600,
    parse: (line) => {
      // MT-SICS: "S S      1.234 kg" or "S D      1.234 kg"
      const m = line.match(/^S\s+[SD]\s+([+-]?\d+\.?\d*)\s*(kg|g|lb)/i);
      return m ? { weight: parseFloat(m[1]), unit: m[2].toLowerCase() } : null;
    },
  },
];

function genericParse(line) {
  const m = line.match(/([+-]?\d+\.?\d*)\s*(kg|g|lb)/i);
  return m ? { weight: parseFloat(m[1]), unit: m[2].toLowerCase() } : null;
}

module.exports = { MODEL_PROFILES, genericParse };
