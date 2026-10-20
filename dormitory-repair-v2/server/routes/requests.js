// ============================================================
// routes/requests.js — คำขอแจ้งซ่อม (จองคิวช่าง)
//   POST   /api/requests               จองช่องเวลา + แจ้งซ่อม (student)
//   GET    /api/requests               รายการ (กรองตาม role อัตโนมัติ)
//   GET    /api/requests/:id           รายละเอียด
//   PUT    /api/requests/:id/status    อัปเดตสถานะ (staff / admin)
//   PUT    /api/requests/:id/reassign  ย้ายให้ช่างอื่นในช่องเวลาเดิม (admin)
//   DELETE /api/requests/:id           ยกเลิก → ช่องเวลาว่างทันที (student เจ้าของ / admin)
// ============================================================
const express = require('express');
const db = require('../db');
const { slotEnd, validateSlot, bookRequest, canTake } = require('../slots');
const { upload, isRealImage, removeUpload } = require('../upload');
const { text, id } = require('../validate');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const OPEN = ['pending', 'in_progress']; // งานที่ยังไม่ปิด

const BASE_SELECT = `
  SELECT r.*, u.name AS user_name, u.phone AS user_phone,
         rm.building, rm.room_number, t.name AS repair_type,
         s.name AS staff_name, s.phone AS staff_phone
  FROM requests r
  JOIN users u        ON u.id  = r.user_id
  JOIN rooms rm       ON rm.id = r.room_id
  JOIN repair_types t ON t.id  = r.repair_type_id
  LEFT JOIN users s   ON s.id  = r.assigned_staff_id`;

// เติมเวลาจบของช่อง (slot_end) ให้หน้าเว็บ — ตารางช่องเวลามีที่เดียวคือ server/slots.js
const withSlotEnd = (r) => r && { ...r, slot_end: slotEnd(r.slot_start) };
const findRequest = (requestId) => withSlotEnd(db.prepare(`${BASE_SELECT} WHERE r.id = ?`).get(requestId));

// สิทธิ์ระดับแถว: นักศึกษาเห็นของตัวเอง ช่างเห็นงานตัวเอง แอดมินเห็นทั้งหมด
function canView(user, row) {
  if (user.role === 'admin') return true;
  if (user.role === 'student') return row.user_id === user.id;
  return row.assigned_staff_id === user.id;
}

// ---------- CREATE: จองคิว ----------
router.post('/', authorize('student'), upload.single('image'), (req, res) => {
  let booked = false;
  try {
    const body = req.body || {};
    const repairTypeId = id(body.repair_type_id);
    const description = text(body.description);
    if (!repairTypeId || !description) return res.status(400).json({ error: 'กรุณาเลือกประเภทและระบุรายละเอียด' });

    const slotError = validateSlot(body.slot_date, body.slot_start);
    if (slotError) return res.status(400).json({ error: slotError });
    if (req.file && !isRealImage(req.file.path)) return res.status(400).json({ error: 'ไฟล์ที่แนบไม่ใช่รูปภาพ' });

    const room = db.prepare('SELECT id FROM rooms WHERE user_id = ?').get(req.user.id);
    if (!room) return res.status(400).json({ error: 'ไม่พบห้องพักของคุณ' });
    if (!db.prepare('SELECT id FROM repair_types WHERE id = ?').get(repairTypeId)) {
      return res.status(400).json({ error: 'ประเภทงานซ่อมไม่ถูกต้อง' });
    }

    const requestId = bookRequest({
      userId: req.user.id,
      roomId: room.id,
      repairTypeId,
      description,
      imageUrl: req.file ? `/uploads/${req.file.filename}` : null,
      date: body.slot_date,
      start: body.slot_start,
    }); // ช่องเต็ม → SlotFullError (409) ไปที่ error handler ใน index.js
    booked = true;
    res.status(201).json(findRequest(requestId));
  } finally {
    if (!booked) removeUpload(req.file); // จองไม่สำเร็จ (400/409/500) → ลบรูปทิ้ง ไม่ให้ค้าง
  }
});

// ---------- READ ----------
router.get('/', (req, res) => {
  const where = [];
  const params = [];
  if (req.user.role === 'student') { where.push('r.user_id = ?'); params.push(req.user.id); }
  if (req.user.role === 'staff')   { where.push('r.assigned_staff_id = ?'); params.push(req.user.id); }
  if (req.query.status)            { where.push('r.status = ?'); params.push(req.query.status); }
  const sql = `${BASE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY r.slot_date DESC, r.slot_start DESC, r.id DESC`;
  res.json(db.prepare(sql).all(...params).map(withSlotEnd));
});

router.get('/:id', (req, res) => {
  const row = findRequest(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (!canView(req.user, row)) return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง' });
  res.json(row);
});

// ---------- UPDATE: สถานะ (เดินหน้าได้ทีละขั้น ย้อนกลับไม่ได้) ----------
//   รอคิว → กำลังซ่อม → เสร็จสิ้น   (completed_at ถูกบันทึกครั้งเดียว KPI จึงไม่เพี้ยน)
const NEXT_STATUS = { pending: 'in_progress', in_progress: 'done' };

router.put('/:id/status', authorize('staff', 'admin'), (req, res) => {
  const row = findRequest(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (!canView(req.user, row)) return res.status(403).json({ error: 'งานนี้ไม่ได้มอบหมายให้คุณ' });
  if (req.body?.status !== NEXT_STATUS[row.status]) {
    return res.status(400).json({ error: 'เปลี่ยนสถานะแบบนี้ไม่ได้ (ต้องเดินหน้าทีละขั้น)' });
  }

  db.prepare(`
    UPDATE requests
    SET status = ?, completed_at = CASE WHEN ? = 'done' THEN datetime('now') END, updated_at = datetime('now')
    WHERE id = ?`).run(req.body.status, req.body.status, row.id);
  res.json(findRequest(row.id));
});

// ---------- UPDATE: ย้ายช่าง (ช่องเวลาเดิม ไม่แซงคิวใคร) ----------
router.put('/:id/reassign', authorize('admin'), (req, res) => {
  const row = findRequest(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (!OPEN.includes(row.status)) return res.status(400).json({ error: 'คำขอนี้ปิดไปแล้ว' });

  const staff = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'staff'").get(id(req.body?.staff_id));
  if (!staff) return res.status(400).json({ error: 'ไม่พบช่างที่เลือก' });
  if (!canTake(staff, row.slot_date, row.slot_start, row.id)) {
    return res.status(409).json({ error: `${staff.name} ไม่ว่างในช่องเวลานี้ หรืองานวันนั้นเต็มแล้ว` });
  }

  db.prepare("UPDATE requests SET assigned_staff_id = ?, assigned_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
    .run(staff.id, row.id);
  res.json(findRequest(row.id));
});

// ---------- DELETE: ยกเลิก (soft delete) → ช่องเวลาว่างให้คนอื่นจองทันที ----------
router.delete('/:id', authorize('student', 'admin'), (req, res) => {
  const row = findRequest(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (req.user.role === 'student') {
    if (row.user_id !== req.user.id) return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง' });
    if (row.status !== 'pending') return res.status(400).json({ error: 'ยกเลิกได้เฉพาะคิวที่ยังไม่เริ่มซ่อม' });
  }
  if (!OPEN.includes(row.status)) return res.status(400).json({ error: 'คำขอนี้ปิดไปแล้ว' });

  db.prepare("UPDATE requests SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(row.id);
  res.json(findRequest(row.id));
});

module.exports = router;
