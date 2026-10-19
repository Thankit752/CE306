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

router.get('/', (req, res) => {
  res.json(db.prepare(`
    SELECT u.id, u.name, u.email, u.phone,
           SUM(CASE WHEN r.status IN ('pending','in_progress') THEN 1 ELSE 0 END) AS active_jobs,
           SUM(CASE WHEN r.status = 'done' THEN 1 ELSE 0 END) AS done_jobs
    FROM users u LEFT JOIN requests r ON r.assigned_staff_id = u.id
    WHERE u.role = 'staff'
    GROUP BY u.id ORDER BY u.id`).all());
});

router.post('/', (req, res) => {
  const { name, email, password, phone } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'กรอกชื่อ อีเมล และรหัสผ่าน' });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'อีเมลนี้ถูกใช้แล้ว' });
  }
  const r = db
    .prepare("INSERT INTO users (name, email, password_hash, role, phone) VALUES (?, ?, ?, 'staff', ?)")
    .run(name, email, bcrypt.hashSync(password, 10), phone || null);
  res.status(201).json({ id: Number(r.lastInsertRowid), name, email, phone });
});

router.put('/:id', (req, res) => {
  const { name, email, phone, password } = req.body || {};
  const staff = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'staff'").get(req.params.id);
  if (!staff) return res.status(404).json({ error: 'ไม่พบช่าง' });
  if (email && email !== staff.email && db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'อีเมลนี้ถูกใช้แล้ว' });
  }
  db.prepare('UPDATE users SET name = ?, email = ?, phone = ?, password_hash = ? WHERE id = ?').run(
    name || staff.name,
    email || staff.email,
    phone ?? staff.phone,
    password ? bcrypt.hashSync(password, 10) : staff.password_hash,
    staff.id
  );
  res.json({ id: staff.id, name: name || staff.name, email: email || staff.email, phone: phone ?? staff.phone });
});

router.delete('/:id', (req, res) => {
  const r = db.prepare("DELETE FROM users WHERE id = ? AND role = 'staff'").run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'ไม่พบช่าง' });
  // งานที่ค้างอยู่ของช่างคนนี้ assigned_staff_id จะกลายเป็น NULL (ON DELETE SET NULL) ให้ admin มอบหมายใหม่
  res.status(204).end();
});

module.exports = router;
