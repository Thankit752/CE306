// ============================================================
// routes/auth.js — POST /api/auth/register, POST /api/auth/login, GET /api/auth/me
// ============================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { text } = require('../validate');
const { signToken, authenticate } = require('../middleware/auth');

const router = express.Router();

// สมัครสมาชิก (นักศึกษาเท่านั้น — staff/admin ถูกสร้างโดย admin)
router.post('/register', (req, res) => {
  const body = req.body || {};
  const [name, student_id, email, building, room_number] =
    [body.name, body.student_id, body.email, body.building, body.room_number].map(text);
  const phone = text(body.phone);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!name || !student_id || !email || !password || !building || !room_number) {
    return res.status(400).json({ error: 'กรอกข้อมูลให้ครบ' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });
  }
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'อีเมลนี้ถูกใช้แล้ว' });
  }

  // ห้องที่มีคนพักอยู่แล้ว ห้ามสมัครซ้ำ
  const room = db.prepare('SELECT * FROM rooms WHERE building = ? AND room_number = ?').get(building, room_number);
  if (room && room.user_id) {
    return res.status(409).json({ error: 'ห้องนี้มีผู้พักลงทะเบียนแล้ว' });
  }

  // เก็บรหัสผ่านแบบ hash (bcrypt) — ไม่เก็บรหัสผ่านจริงลงฐานข้อมูล
  const password_hash = bcrypt.hashSync(password, 10);
  const user = db
    .prepare('INSERT INTO users (name, student_id, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?, ?)')
    .run(name, student_id, email, password_hash, 'student', phone || null);

  if (room) {
    db.prepare('UPDATE rooms SET user_id = ? WHERE id = ?').run(user.lastInsertRowid, room.id);
  } else {
    db.prepare('INSERT INTO rooms (building, room_number, user_id) VALUES (?, ?, ?)')
      .run(building, room_number, user.lastInsertRowid);
  }

  const created = { id: Number(user.lastInsertRowid), name, role: 'student' };
  res.status(201).json({ token: signToken(created), user: created });
});

// เข้าสู่ระบบ → ได้ JWT กลับไป
router.post('/login', (req, res) => {
  const email = text(req.body?.email) || '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  }
  const payload = { id: user.id, name: user.name, role: user.role };
  res.json({ token: signToken(payload), user: payload });
});

// ข้อมูลผู้ใช้ปัจจุบัน (ใช้ตอนเปิดเว็บใหม่ เพื่อตรวจว่า token ยังใช้ได้)
router.get('/me', authenticate, (req, res) => {
  const user = db.prepare(`
    SELECT u.id, u.name, u.email, u.student_id, u.role, u.phone, u.work_start, u.work_end, u.max_jobs_per_day,
           r.building, r.room_number
    FROM users u LEFT JOIN rooms r ON r.user_id = u.id
    WHERE u.id = ?`).get(req.user.id);
  if (!user) return res.status(401).json({ error: 'ไม่พบผู้ใช้' });
  res.json(user);
});

module.exports = router;
