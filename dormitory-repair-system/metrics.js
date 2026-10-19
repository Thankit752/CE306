// ============================================================
// metrics.js — เก็บเวลาตอบสนองของ API ล่าสุด 500 ครั้ง (ใช้ทำ KPI "< 500ms")
// ============================================================
const samples = [];
const MAX = 500;

module.exports = {
  record(ms) {
    samples.push(ms);
    if (samples.length > MAX) samples.shift();
  },
  average() {
    if (!samples.length) return null;
    return Number((samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(2));
  },
};
