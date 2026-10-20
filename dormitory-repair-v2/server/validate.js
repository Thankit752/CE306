// ============================================================
// validate.js — ตรวจชนิดข้อมูลจาก request ก่อนใช้งาน
//   ข้อมูลจากผู้ใช้อาจไม่ใช่ string (เช่น ส่งช่องเดียวกันซ้ำมาเป็น array)
//   → ตรวจก่อนเสมอ แล้วตอบ 400 แทนที่ server จะพัง (500)
// ============================================================

/** คืน string ที่ตัดช่องว่างหัวท้ายแล้ว หรือ null ถ้าไม่ใช่ string / ว่างเปล่า */
function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** คืนเลข id จำนวนเต็มบวก หรือ null */
function id(value) {
  const n = Number(value);
  return (typeof value === 'string' || typeof value === 'number') && Number.isInteger(n) && n > 0 ? n : null;
}

module.exports = { text, id };
