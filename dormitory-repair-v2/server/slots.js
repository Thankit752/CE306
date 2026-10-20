// ============================================================
// slots.js — หัวใจของ v2: ตารางคิวช่าง
//   • วันละ 4 ช่อง ช่องละ 2 ชม. (SLOTS)
//   • ช่าง 1 คน รับได้ 1 งานต่อ 1 ช่อง และไม่เกิน max_jobs_per_day งานต่อวัน
//   • ช่องที่ "ว่าง" = มีช่างอย่างน้อย 1 คนที่อยู่ในเวลางาน + ช่องนั้นยังไม่มีงาน + งานวันนั้นยังไม่เต็ม
//   • จองแบบมาก่อนได้ก่อน ทำใน transaction + มี UNIQUE index กันคิวซ้อนอีกชั้น
// ============================================================
const db = require('./db');
const { thaiDate, thaiTime } = require('./time');

const SLOTS = [
  { start: '08:00', end: '10:00' },
  { start: '10:00', end: '12:00' },
  { start: '13:00', end: '15:00' },
  { start: '15:00', end: '17:00' },
];
const BOOKING_DAYS = 7; // จองล่วงหน้าได้ 7 วัน (รวมวันนี้)

const findSlot = (start) => SLOTS.find((s) => s.start === start);

/** เวลาจบของช่อง เช่น "13:00" → "15:00" (หน้าเว็บใช้แสดงผล ไม่ต้องรู้ตาราง SLOTS เอง) */
const slotEnd = (start) => findSlot(start)?.end ?? null;

// วันที่จองได้ทั้งหมด เริ่มจากวันนี้ (เวลาไทย)
const bookingDates = () => [...Array(BOOKING_DAYS)].map((_, i) => thaiDate(i));

// ช่องเวลาที่เริ่มไปแล้วของวันนี้จองไม่ได้
function isPast(date, slotStart) {
  const today = thaiDate();
  return date < today || (date === today && slotStart <= thaiTime());
}

// ช่างคนนี้อยู่ในเวลางานตลอดช่องนี้หรือไม่
const inShift = (staff, slot) => staff.work_start <= slot.start && slot.end <= staff.work_end;

function loadStaff() {
  return db.prepare("SELECT id, name, work_start, work_end, max_jobs_per_day FROM users WHERE role = 'staff' ORDER BY id").all();
}

// งานในช่วงวันที่กำหนด (นับทุกงานที่ไม่ถูกยกเลิก — งานที่ซ่อมเสร็จแล้วก็ยังกินโควตาของวันนั้น)
function loadBookings(fromDate, toDate, excludeRequestId = 0) {
  return db.prepare(`
    SELECT assigned_staff_id AS staff_id, slot_date, slot_start
    FROM requests
    WHERE status != 'cancelled' AND assigned_staff_id IS NOT NULL
      AND slot_date BETWEEN ? AND ? AND id != ?`)
    .all(fromDate, toDate, excludeRequestId);
}

// ตัวช่วยตอบคำถาม "ช่างคนนี้ว่างช่องนี้ไหม / วันนั้นรับไปกี่งานแล้ว"
function bookingIndex(bookings) {
  const taken = new Set();       // "staffId|date|start"
  const perDay = new Map();      // "staffId|date" → จำนวนงาน
  for (const b of bookings) {
    taken.add(`${b.staff_id}|${b.slot_date}|${b.slot_start}`);
    const key = `${b.staff_id}|${b.slot_date}`;
    perDay.set(key, (perDay.get(key) || 0) + 1);
  }
  return {
    isTaken: (staffId, date, start) => taken.has(`${staffId}|${date}|${start}`),
    jobsOn: (staffId, date) => perDay.get(`${staffId}|${date}`) || 0,
  };
}

// ช่างคนนี้รับงานช่องนี้ได้ไหม: อยู่ในกะ + ช่องยังว่าง + งานวันนั้นยังไม่เต็ม
const canStaffTake = (staff, index, date, slot) =>
  inShift(staff, slot)
  && !index.isTaken(staff.id, date, slot.start)
  && index.jobsOn(staff.id, date) < staff.max_jobs_per_day;

// ช่างที่รับงานช่องนี้ได้ เรียงคนที่งานวันนั้นน้อยสุดก่อน (กระจายงานให้เท่ากัน)
function freeStaff(staffList, index, date, slot) {
  return staffList
    .filter((s) => canStaffTake(s, index, date, slot))
    .sort((a, b) => index.jobsOn(a.id, date) - index.jobsOn(b.id, date) || a.id - b.id);
}

// ข้อมูลตั้งต้นของ 7 วันข้างหน้า: วันที่ + รายชื่อช่าง + งานที่จองแล้ว
function loadWeek() {
  const dates = bookingDates();
  return { dates, staff: loadStaff(), index: bookingIndex(loadBookings(dates[0], dates[dates.length - 1])) };
}

/**
 * ตารางช่องว่าง 7 วัน สำหรับหน้าจองของนักศึกษา
 * @returns [{ date, slots: [{ start, end, free, past }] }]
 */
function getAvailability() {
  const { dates, staff, index } = loadWeek();
  return dates.map((date) => ({
    date,
    slots: SLOTS.map((slot) => ({
      ...slot,
      past: isPast(date, slot.start),
      free: freeStaff(staff, index, date, slot).length,
    })),
  }));
}

// ตรวจว่าช่องที่ส่งมาถูกต้องและยังไม่เลยเวลา → คืนข้อความ error หรือ null
function validateSlot(date, start) {
  if (!findSlot(start) || !bookingDates().includes(date)) return 'ช่องเวลาไม่ถูกต้อง';
  if (isPast(date, start)) return 'ช่องเวลานี้เลยมาแล้ว';
  return null;
}

class SlotFullError extends Error {
  constructor() {
    super('ช่องเวลานี้เพิ่งเต็ม กรุณาเลือกช่องอื่น');
    this.status = 409;
  }
}

/**
 * จองช่องเวลา + สร้างคำขอแจ้งซ่อม แบบ atomic (ทั้งหมดหรือไม่มีเลย)
 * BEGIN IMMEDIATE ล็อกการเขียนไว้ก่อน → ไม่มีใครแทรกจองช่องเดียวกันระหว่างที่เราเช็กอยู่
 */
function bookRequest({ userId, roomId, repairTypeId, description, imageUrl, date, start }) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const index = bookingIndex(loadBookings(date, date));
    const [staff] = freeStaff(loadStaff(), index, date, findSlot(start));
    if (!staff) throw new SlotFullError();

    const result = db.prepare(`
      INSERT INTO requests (user_id, room_id, repair_type_id, description, image_url,
                            assigned_staff_id, slot_date, slot_start, assigned_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`)
      .run(userId, roomId, repairTypeId, description, imageUrl, staff.id, date, start);
    db.exec('COMMIT');
    return Number(result.lastInsertRowid);
  } catch (err) {
    db.exec('ROLLBACK');
    // ถ้าหลุดมาชน UNIQUE index (ไม่ควรเกิด) ก็ตอบเหมือนช่องเต็ม
    if (String(err.message).includes('UNIQUE')) throw new SlotFullError();
    throw err;
  }
}

/** แอดมินย้ายงานไปให้ช่างคนอื่น "ในช่องเวลาเดิม" — ต้องว่างจริงเท่านั้น (ไม่แซงคิวใคร) */
function canTake(staff, date, start, requestId) {
  const index = bookingIndex(loadBookings(date, date, requestId)); // ไม่นับงานที่กำลังย้ายเอง
  return canStaffTake(staff, index, date, findSlot(start));
}

/** ภาระงานช่างแต่ละคน 7 วันข้างหน้า (หน้าแอดมิน + KPI อัตราใช้คิว) */
function getStaffLoad() {
  const { dates, staff, index } = loadWeek();
  return {
    dates,
    staff: staff.map((s) => ({
      id: s.id,
      name: s.name,
      // งานที่ช่างคนนี้รับได้จริงต่อวัน = min(จำนวนช่องในกะ, งานสูงสุด/วัน)
      capacity: Math.min(SLOTS.filter((slot) => inShift(s, slot)).length, s.max_jobs_per_day),
      days: dates.map((d) => index.jobsOn(s.id, d)),
    })),
  };
}

module.exports = { slotEnd, getAvailability, validateSlot, bookRequest, canTake, getStaffLoad };
