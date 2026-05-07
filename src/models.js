// Parser chung cho các model Yaohua dạng "±số đơn_vị"
const yaohuaStdParse = (line) => {
  const m = line.match(/([+-]?\s*\d+\.?\d*)\s*(kg|g|lb)/i);
  return m ? { weight: parseFloat(m[1].replace(/\s/g, "")), unit: m[2].toLowerCase() } : null;
};

// Parser chung cho Mettler Toledo MT-SICS: "S S 1.234 kg"
const mtSicsParse = (line) => {
  const m = line.match(/^S\s+[SD]\s+([+-]?\d+\.?\d*)\s*(kg|g|lb)/i);
  return m ? { weight: parseFloat(m[1]), unit: m[2].toLowerCase() } : null;
};

// Danh sách profile các model cân được hỗ trợ, mỗi profile có hàm parse riêng
const MODEL_PROFILES = [
  {
    name: "XK3190-T7E (Yaohua)",
    baudRate: 9600,
    parse: yaohuaStdParse,
  },
  {
    name: "XK31970",
    baudRate: 9600,
    // =3.00000
    parse: (line) => {
      const m = line.match(/=(\d+\.\d+)/);
      return m ? { weight: parseFloat(m[1]), unit: "kg" } : null;
    },
  },
  {
    name: "XK3190-A9 (Yaohua)",
    baudRate: 9600,
    parse: yaohuaStdParse,
  },
  {
    name: "XK3118T1 (Yaohua)",
    baudRate: 9600,
    // Format: "=00004.8(kg)"
    parse: (line) => {
      const m = line.match(/^=([+-]?\d+\.?\d*)\((kg|g|lb)\)/i);
      return m ? { weight: parseFloat(m[1]), unit: m[2].toLowerCase() } : null;
    },
  },
  {
    name: "Defender 3000 i-D33P300B1X2 (OHAUS)",
    baudRate: 9600,
    // OHAUS continuous: " +0001.234 kg"
    parse: (line) => {
      const m = line.match(/^\s*([+-]?\d+\.?\d*)\s*(kg|g|lb)/i);
      return m ? { weight: parseFloat(m[1]), unit: m[2].toLowerCase() } : null;
    },
  },
  {
    name: "IND231 (Mettler Toledo)",
    baudRate: 9600,
    parse: mtSicsParse,
  },
  {
    name: "IND236 (Mettler Toledo)",
    baudRate: 9600,
    parse: mtSicsParse,
  },
];

// Hàm phân tích chung cho các cân không khớp với profile cụ thể nào
function genericParse(line) {
  const m = line.match(/([+-]?\d+\.?\d*)\s*(kg|g|lb)/i);
  return m ? { weight: parseFloat(m[1]), unit: m[2].toLowerCase() } : null;
}

module.exports = { MODEL_PROFILES, genericParse };
