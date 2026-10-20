// ============================================================
// util.js — ข้อความ/รูปแบบวันเวลา + toast + polling ที่ใช้ร่วมกันทุกหน้า
// ============================================================
import { reactive, onMounted, onBeforeUnmount } from 'vue';

export const STATUS_TEXT = {
  pending: 'รอคิว',
  in_progress: 'กำลังซ่อม',
  done: 'เสร็จสิ้น',
  cancelled: 'ยกเลิก',
};

/** งานที่ยังไม่ปิด (ยกเลิก/ย้ายช่างได้) */
export const isOpen = (r) => r.status === 'pending' || r.status === 'in_progress';

// "2026-10-21" → "อ. 21 ต.ค."
export function fmtDay(date, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(`${date}T00:00`).toLocaleDateString('th-TH', opts);
}

// คิวที่จอง เช่น "อ. 21 ต.ค. · 13:00–15:00" (slot_end ส่งมาจาก server)
export const fmtSlot = (r) => `${fmtDay(r.slot_date)} · ${r.slot_start}–${r.slot_end}`;

// เวลาที่ SQLite เก็บเป็น UTC → แสดงเป็นเวลาไทย
export function fmtTime(s) {
  if (!s) return '-';
  return new Date(s.replace(' ', 'T') + 'Z').toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

/** วันนี้แบบ "YYYY-MM-DD" ตามเวลาไทย (รูปแบบเดียวกับ slot_date) */
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

// ---------- Toast ----------
export const toasts = reactive([]);
let toastId = 0;
export function toast(text, isError = false) {
  const id = ++toastId;
  toasts.push({ id, text, isError });
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id);
    if (i >= 0) toasts.splice(i, 1);
  }, 3500);
}

/** เรียก API แล้วแจ้งผลเป็น toast — คืน true ถ้าสำเร็จ */
export async function attempt(promise, okText) {
  try {
    await promise;
    if (okText) toast(okText);
    return true;
  } catch (err) {
    toast(err.message, true);
    return false;
  }
}

// ---------- Polling: ดึงข้อมูลใหม่ทุก 5 วิ ----------
//   • ข้ามรอบถ้ารอบก่อนยังไม่เสร็จ (กันข้อมูลมาซ้อน/สลับลำดับ)
//   • หยุดดึงเมื่อสลับไปแท็บอื่น
export function usePolling(fn, ms = 5000) {
  let timer;
  let running = false;
  async function run() {
    if (running) return;
    running = true;
    try {
      await fn();
    } catch (err) {
      toast(err.message, true);
    } finally {
      running = false;
    }
  }
  onMounted(() => {
    run();
    timer = setInterval(() => { if (!document.hidden) run(); }, ms);
  });
  onBeforeUnmount(() => clearInterval(timer));
  return run; // เรียกเองได้หลังกดปุ่ม เพื่ออัปเดตทันที
}

/**
 * แจ้งเตือนเมื่อสถานะงานเปลี่ยนจากรอบก่อน
 * announceNew: แจ้งเมื่อมีคิวใหม่เข้ามา (ช่าง/แอดมิน) — นักศึกษาปิดไว้ เพราะได้ toast ตอนจองแล้ว
 */
export function useStatusWatcher({ announceNew = true } = {}) {
  const last = new Map();
  let firstRound = true; // รอบแรกแค่จำสถานะไว้ ไม่แจ้งเตือน
  return (items) => {
    for (const r of items) {
      const prev = last.get(r.id);
      if (prev && prev !== r.status) toast(`คิว #${r.id} เปลี่ยนเป็น "${STATUS_TEXT[r.status]}"`);
      if (!prev && !firstRound && announceNew) toast(`มีคิวใหม่ #${r.id} (${r.repair_type})`);
      last.set(r.id, r.status);
    }
    firstRound = false;
  };
}
