// ============================================================
// scheduler.js — จัดช่างที่ว่างให้อัตโนมัติ
//   ช่างมีเวลาทำงาน fix ไว้ (users.work_start / work_end)
//   นักศึกษาบอกช่วงที่สะดวก (requests.avail_start / avail_end)
//   ระบบหา "ชั่วโมงแรกสุด" ที่ทั้งสองฝ่ายว่างตรงกัน 1 งาน = 1 ชั่วโมง
// ============================================================
const db = require('./db');

const pad = (n) => String(n).padStart(2, '0');

// เวลาปัจจุบันแบบท้องถิ่นในรูปแบบเดียวกับ datetime-local ("YYYY-MM-DDTHH:MM")
function nowLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ช่างคนนี้มีนัดอื่นในชั่วโมงนั้นแล้วหรือยัง
const isBusy = db.prepare(`
  SELECT 1 FROM requests
  WHERE assigned_staff_id = ? AND scheduled_at = ? AND status IN ('pending', 'in_progress')`);

/**
 * หาช่าง + เวลานัด ที่ว่างตรงกับช่วงที่นักศึกษาสะดวก
 * @param {string} availStart  "2026-10-20T12:00"
 * @param {string} availEnd    "2026-10-20T16:00"
 * @param {number} [onlyStaffId] ระบุเมื่อแอดมินเลือกช่างเอง (หาแค่เวลาให้ช่างคนนั้น)
 * @returns {{ staff_id: number, staff_name: string, scheduled_at: string } | null}
 */
function findSlot(availStart, availEnd, onlyStaffId) {
  if (!availStart || !availEnd) return null;

  // เรียงช่างที่งานค้างน้อยสุดก่อน เพื่อกระจายงานให้เท่า ๆ กัน
  const staff = db.prepare(`
    SELECT u.id, u.name, u.work_start, u.work_end,
           (SELECT COUNT(*) FROM requests r
            WHERE r.assigned_staff_id = u.id AND r.status IN ('pending', 'in_progress')) AS load
    FROM users u
    WHERE u.role = 'staff' ${onlyStaffId ? 'AND u.id = ?' : ''}
    ORDER BY load, u.id`).all(...(onlyStaffId ? [onlyStaffId] : []));

  const date = availStart.slice(0, 10);
  const fromH = Number(availStart.slice(11, 13));
  const toH = Number(availEnd.slice(11, 13));
  const now = nowLocal();

  // ไล่ทีละชั่วโมงจากเช้าไปเย็น → ได้เวลานัดที่เร็วที่สุด
  for (let h = fromH; h < toH; h++) {
    const start = `${pad(h)}:00`;
    const end = `${pad(h + 1)}:00`;
    const slot = `${date}T${start}`;
    if (slot < now) continue; // เวลาที่ผ่านไปแล้ว

    for (const s of staff) {
      const inShift = s.work_start <= start && end <= s.work_end;
      if (inShift && !isBusy.get(s.id, slot)) {
        return { staff_id: s.id, staff_name: s.name, scheduled_at: slot };
      }
    }
  }
  return null; // ไม่มีช่างว่างในช่วงนี้ → รอแอดมินจัดการเอง
}

module.exports = { findSlot };
