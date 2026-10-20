// ============================================================
// time.js — วันที่/เวลาตามเวลาไทยเสมอ (ไม่ขึ้นกับ timezone ของเครื่อง server)
//   deploy บน cloud ที่เป็น UTC ก็ยังได้ "วันนี้" ตรงกับเวลาไทย
// ============================================================
const TZ = 'Asia/Bangkok';

// "en-CA" ให้รูปแบบ YYYY-MM-DD และ "en-GB" ให้ HH:MM แบบ 24 ชม.
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** วันที่ไทยแบบ "YYYY-MM-DD" — offsetDays = เลื่อนกี่วันจากวันนี้ */
function thaiDate(offsetDays = 0) {
  return dateFmt.format(new Date(Date.now() + offsetDays * 86400000));
}

/** เวลาไทยตอนนี้แบบ "HH:MM" */
function thaiTime() {
  return timeFmt.format(new Date());
}

module.exports = { thaiDate, thaiTime };
