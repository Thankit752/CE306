// ============================================================
// routes/requests.js — CRUD ของ "คำขอแจ้งซ่อม" (Repair Request)
//   POST   /api/requests              แจ้งซ่อมใหม่ (student)  + อัปโหลดรูป
//   GET    /api/requests              ดูรายการ (กรองตาม role อัตโนมัติ)
//   GET    /api/requests/:id          ดูรายละเอียด
//   PUT    /api/requests/:id/assign   มอบหมายช่าง (admin)
//   PUT    /api/requests/:id/status   อัปเดตสถานะ (staff / admin)
//   DELETE /api/requests/:id          ยกเลิกคำขอ (student เจ้าของ / admin)
// ============================================================
const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate); // ทุก endpoint ในไฟล์นี้ต้องล็อกอิน

// ---------- ตั้งค่าอัปโหลดรูป ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', 'uploads'),
    filename: (req, file, cb) =>
      cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // ไม่เกิน 5MB
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)),
});

// SELECT พร้อม JOIN ชื่อผู้แจ้ง ห้อง ประเภท และช่าง
const BASE_SELECT = `
  SELECT r.*, u.name AS user_name, u.phone AS user_phone,
         rm.building, rm.room_number, t.name AS repair_type,
         s.name AS staff_name
  FROM requests r
  JOIN users u         ON u.id  = r.user_id
  JOIN rooms rm        ON rm.id = r.room_id
  JOIN repair_types t  ON t.id  = r.repair_type_id
  LEFT JOIN users s    ON s.id  = r.assigned_staff_id`;

// ตรวจว่าผู้ใช้คนนี้มีสิทธิ์เห็นคำขอนี้ไหม (RBAC ระดับข้อมูล)
function canView(user, row) {
  if (user.role === 'admin') return true;
  if (user.role === 'student') return row.user_id === user.id;
  if (user.role === 'staff') return row.assigned_staff_id === user.id;
  return false;
}

function findRequest(id) {
  return db.prepare(`${BASE_SELECT} WHERE r.id = ?`).get(id);
}

// ---------- CREATE ----------
router.post('/', authorize('student'), upload.single('image'), (req, res) => {
  const { repair_type_id, description } = req.body || {};
  if (!repair_type_id || !description?.trim()) {
    return res.status(400).json({ error: 'กรุณาเลือกประเภทและระบุรายละเอียด' });
  }
  const room = db.prepare('SELECT id FROM rooms WHERE user_id = ?').get(req.user.id);
  if (!room) return res.status(400).json({ error: 'ไม่พบห้องพักของคุณ' });
  if (!db.prepare('SELECT id FROM repair_types WHERE id = ?').get(repair_type_id)) {
    return res.status(400).json({ error: 'ประเภทงานซ่อมไม่ถูกต้อง' });
  }

  const image_url = req.file ? `/uploads/${req.file.filename}` : null;
  const result = db
    .prepare('INSERT INTO requests (user_id, room_id, repair_type_id, description, image_url) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, room.id, repair_type_id, description.trim(), image_url);

  res.status(201).json(findRequest(result.lastInsertRowid));
});

// ---------- READ (list) ----------
// role ไหนก็เรียก endpoint เดียวกัน แต่ server กรองข้อมูลให้ตามสิทธิ์
router.get('/', (req, res) => {
  const where = [];
  const params = [];
  if (req.user.role === 'student') { where.push('r.user_id = ?'); params.push(req.user.id); }
  if (req.user.role === 'staff')   { where.push('r.assigned_staff_id = ?'); params.push(req.user.id); }
  if (req.query.status)            { where.push('r.status = ?'); params.push(req.query.status); }

  const sql = `${BASE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.id DESC`;
  res.json(db.prepare(sql).all(...params));
});

// ---------- READ (detail) ----------
router.get('/:id', (req, res) => {
  const row = findRequest(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (!canView(req.user, row)) return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง' });
  res.json(row);
});

// ---------- UPDATE: มอบหมายช่าง ----------
router.put('/:id/assign', authorize('admin'), (req, res) => {
  const row = findRequest(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (['done', 'cancelled'].includes(row.status)) {
    return res.status(400).json({ error: 'คำขอนี้ปิดไปแล้ว' });
  }
  const staff = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'staff'").get(req.body?.staff_id);
  if (!staff) return res.status(400).json({ error: 'ไม่พบช่างที่เลือก' });

  db.prepare(`
    UPDATE requests
    SET assigned_staff_id = ?, assigned_at = COALESCE(assigned_at, datetime('now')), updated_at = datetime('now')
    WHERE id = ?`).run(staff.id, row.id);
  res.json(findRequest(row.id));
});

// ---------- UPDATE: เปลี่ยนสถานะ ----------
const STATUS_FLOW = ['pending', 'in_progress', 'done'];

router.put('/:id/status', authorize('staff', 'admin'), (req, res) => {
  const { status } = req.body || {};
  if (!STATUS_FLOW.includes(status)) return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });

  const row = findRequest(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (!canView(req.user, row)) return res.status(403).json({ error: 'งานนี้ไม่ได้มอบหมายให้คุณ' });
  if (row.status === 'cancelled') return res.status(400).json({ error: 'คำขอนี้ถูกยกเลิกแล้ว' });

  db.prepare(`
    UPDATE requests
    SET status = ?,
        completed_at = CASE WHEN ? = 'done' THEN datetime('now') ELSE NULL END,
        updated_at = datetime('now')
    WHERE id = ?`).run(status, status, row.id);
  res.json(findRequest(row.id));
});

// ---------- DELETE: ยกเลิกคำขอ (Soft delete — เก็บประวัติไว้ทำรายงาน) ----------
router.delete('/:id', authorize('student', 'admin'), (req, res) => {
  const row = findRequest(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (req.user.role === 'student') {
    if (row.user_id !== req.user.id) return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง' });
    if (row.status !== 'pending') return res.status(400).json({ error: 'ยกเลิกได้เฉพาะคำขอที่ยังรอดำเนินการ' });
  }
  if (row.status === 'done') return res.status(400).json({ error: 'งานนี้ซ่อมเสร็จแล้ว' });

  db.prepare("UPDATE requests SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(row.id);
  res.json(findRequest(row.id));
});

module.exports = router;
