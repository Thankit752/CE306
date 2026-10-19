// ============================================================
// routes/staff.js — CRUD ช่างซ่อม (admin เท่านั้น)
//   GET    /api/staff        รายชื่อช่าง + จำนวนงานค้าง
//   POST   /api/staff        เพิ่มช่าง
//   PUT    /api/staff/:id    แก้ไขข้อมูลช่าง
//   DELETE /api/staff/:id    ลบช่าง
// ============================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, authorize('admin'));

// เวลาทำงานต้องเป็น "HH:MM" และเวลาเลิกต้องอยู่หลังเวลาเข้า
const isHM = (s) => typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);
function badHours(start, end) {
  if (!isHM(start) || !isHM(end)) return 'กรุณาระบุเวลาทำงาน (เข้า–เลิก)';
  if (end <= start) return 'เวลาเลิกงานต้องอยู่หลังเวลาเข้างาน';
  return null;
}

router.get('/', (req, res) => {
  res.json(db.prepare(`
    SELECT u.id, u.name, u.email, u.phone, u.work_start, u.work_end,
           SUM(CASE WHEN r.status IN ('pending','in_progress') THEN 1 ELSE 0 END) AS active_jobs,
           SUM(CASE WHEN r.status = 'done' THEN 1 ELSE 0 END) AS done_jobs
    FROM users u LEFT JOIN requests r ON r.assigned_staff_id = u.id
    WHERE u.role = 'staff'
    GROUP BY u.id ORDER BY u.id`).all());
});

router.post('/', (req, res) => {
  const { name, email, password, phone, work_start = '08:00', work_end = '17:00' } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'กรอกชื่อ อีเมล และรหัสผ่าน' });
  const hoursError = badHours(work_start, work_end);
  if (hoursError) return res.status(400).json({ error: hoursError });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'อีเมลนี้ถูกใช้แล้ว' });
  }
  const r = db
    .prepare(`INSERT INTO users (name, email, password_hash, role, phone, work_start, work_end)
              VALUES (?, ?, ?, 'staff', ?, ?, ?)`)
    .run(name, email, bcrypt.hashSync(password, 10), phone || null, work_start, work_end);
  res.status(201).json({ id: Number(r.lastInsertRowid), name, email, phone, work_start, work_end });
});

router.put('/:id', (req, res) => {
  const { name, email, phone, password } = req.body || {};
  const staff = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'staff'").get(req.params.id);
  if (!staff) return res.status(404).json({ error: 'ไม่พบช่าง' });
  if (email && email !== staff.email && db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'อีเมลนี้ถูกใช้แล้ว' });
  }
  const work_start = req.body?.work_start || staff.work_start;
  const work_end = req.body?.work_end || staff.work_end;
  const hoursError = badHours(work_start, work_end);
  if (hoursError) return res.status(400).json({ error: hoursError });

  db.prepare('UPDATE users SET name = ?, email = ?, phone = ?, password_hash = ?, work_start = ?, work_end = ? WHERE id = ?').run(
    name || staff.name,
    email || staff.email,
    phone ?? staff.phone,
    password ? bcrypt.hashSync(password, 10) : staff.password_hash,
    work_start,
    work_end,
    staff.id
  );
  res.json({ id: staff.id, name: name || staff.name, email: email || staff.email, phone: phone ?? staff.phone, work_start, work_end });
});

router.delete('/:id', (req, res) => {
  const r = db.prepare("DELETE FROM users WHERE id = ? AND role = 'staff'").run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'ไม่พบช่าง' });
  // งานที่ค้างอยู่ของช่างคนนี้ assigned_staff_id จะกลายเป็น NULL (ON DELETE SET NULL) ให้ admin มอบหมายใหม่
  res.status(204).end();
});

module.exports = router;
