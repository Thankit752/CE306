// ============================================================
// routes/staff.js — CRUD ช่างซ่อม (admin เท่านั้น)
//   ช่างแต่ละคนมี: เวลาเข้า-เลิกงาน + จำนวนงานสูงสุดต่อวัน
// ============================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { text, id } = require('../validate');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, authorize('admin'));

/**
 * อ่าน + ตรวจข้อมูลช่างจาก body (ใช้ทั้งเพิ่มและแก้ไข)
 * @param current ข้อมูลเดิม (ตอนแก้ไข) — ช่องที่ไม่ได้ส่งมาจะใช้ค่าเดิม
 * @returns {{ data } | { error }}
 */
function readStaff(body = {}, current = {}) {
  const pick = (key) => (body[key] === undefined ? current[key] : body[key]);
  const data = {
    name: text(pick('name')),
    email: text(pick('email')),
    phone: text(pick('phone')),
    work_start: pick('work_start') ?? '08:00',
    work_end: pick('work_end') ?? '17:00',
    max_jobs_per_day: Number(pick('max_jobs_per_day') ?? 3),
  };
  const isHM = (s) => typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);
  if (!data.name || !data.email) return { error: 'กรอกชื่อและอีเมล' };
  if (!isHM(data.work_start) || !isHM(data.work_end)) return { error: 'กรุณาระบุเวลาเข้า-เลิกงาน' };
  if (data.work_end <= data.work_start) return { error: 'เวลาเลิกงานต้องอยู่หลังเวลาเข้างาน' };
  if (!Number.isInteger(data.max_jobs_per_day) || data.max_jobs_per_day < 1 || data.max_jobs_per_day > 8) {
    return { error: 'งานต่อวันต้องเป็น 1–8 งาน' };
  }
  return { data };
}

const emailTaken = (email, exceptId = 0) => db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, exceptId);

router.get('/', (req, res) => {
  res.json(db.prepare(`
    SELECT u.id, u.name, u.email, u.phone, u.work_start, u.work_end, u.max_jobs_per_day,
           SUM(CASE WHEN r.status IN ('pending','in_progress') THEN 1 ELSE 0 END) AS active_jobs,
           SUM(CASE WHEN r.status = 'done' THEN 1 ELSE 0 END) AS done_jobs
    FROM users u LEFT JOIN requests r ON r.assigned_staff_id = u.id
    WHERE u.role = 'staff'
    GROUP BY u.id ORDER BY u.id`).all());
});

router.post('/', (req, res) => {
  const { data, error } = readStaff(req.body);
  if (error) return res.status(400).json({ error });
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (password.length < 6) return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });
  if (emailTaken(data.email)) return res.status(409).json({ error: 'อีเมลนี้ถูกใช้แล้ว' });

  const r = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, phone, work_start, work_end, max_jobs_per_day)
    VALUES (?, ?, ?, 'staff', ?, ?, ?, ?)`)
    .run(data.name, data.email, bcrypt.hashSync(password, 10), data.phone,
      data.work_start, data.work_end, data.max_jobs_per_day);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

// หมายเหตุ: ลดเวลางาน/งานต่อวัน ไม่กระทบคิวที่จองไปแล้ว (มาก่อนได้ก่อน) — มีผลกับการจองใหม่เท่านั้น
router.put('/:id', (req, res) => {
  const staff = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'staff'").get(id(req.params.id));
  if (!staff) return res.status(404).json({ error: 'ไม่พบช่าง' });
  const { data, error } = readStaff(req.body, staff);
  if (error) return res.status(400).json({ error });
  if (emailTaken(data.email, staff.id)) return res.status(409).json({ error: 'อีเมลนี้ถูกใช้แล้ว' });

  db.prepare(`
    UPDATE users SET name = ?, email = ?, phone = ?, work_start = ?, work_end = ?, max_jobs_per_day = ?
    WHERE id = ?`)
    .run(data.name, data.email, data.phone, data.work_start, data.work_end, data.max_jobs_per_day, staff.id);
  res.json({ id: staff.id });
});

router.delete('/:id', (req, res) => {
  const active = db.prepare("SELECT COUNT(*) AS n FROM requests WHERE assigned_staff_id = ? AND status IN ('pending','in_progress')")
    .get(req.params.id).n;
  if (active > 0) return res.status(409).json({ error: `ลบไม่ได้ ช่างคนนี้ยังมีคิวค้าง ${active} งาน (ย้ายงานให้ช่างอื่นก่อน)` });
  const r = db.prepare("DELETE FROM users WHERE id = ? AND role = 'staff'").run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'ไม่พบช่าง' });
  res.status(204).end();
});

module.exports = router;
