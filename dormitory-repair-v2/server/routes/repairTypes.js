// ============================================================
// routes/repairTypes.js — CRUD ประเภทงานซ่อม (ต้องล็อกอิน)
//   GET    /api/repair-types        ทุก role (ใช้ในฟอร์มแจ้งซ่อม)
//   POST   /api/repair-types        admin
//   PUT    /api/repair-types/:id    admin
//   DELETE /api/repair-types/:id    admin
// ============================================================
const express = require('express');
const db = require('../db');
const { text } = require('../validate');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  res.json(db.prepare(`
    SELECT t.id, t.name, COUNT(r.id) AS request_count
    FROM repair_types t LEFT JOIN requests r ON r.repair_type_id = t.id
    GROUP BY t.id ORDER BY t.id`).all());
});

router.post('/', authorize('admin'), (req, res) => {
  const name = text(req.body?.name);
  if (!name) return res.status(400).json({ error: 'กรุณาระบุชื่อประเภท' });
  try {
    const r = db.prepare('INSERT INTO repair_types (name) VALUES (?)').run(name);
    res.status(201).json({ id: Number(r.lastInsertRowid), name });
  } catch {
    res.status(409).json({ error: 'มีประเภทนี้อยู่แล้ว' });
  }
});

router.put('/:id', authorize('admin'), (req, res) => {
  const name = text(req.body?.name);
  if (!name) return res.status(400).json({ error: 'กรุณาระบุชื่อประเภท' });
  try {
    const r = db.prepare('UPDATE repair_types SET name = ? WHERE id = ?').run(name, req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: 'ไม่พบประเภทนี้' });
    res.json({ id: Number(req.params.id), name });
  } catch {
    res.status(409).json({ error: 'มีประเภทนี้อยู่แล้ว' });
  }
});

router.delete('/:id', authorize('admin'), (req, res) => {
  const used = db.prepare('SELECT COUNT(*) AS n FROM requests WHERE repair_type_id = ?').get(req.params.id).n;
  if (used > 0) return res.status(409).json({ error: `ลบไม่ได้ มีคำขอใช้ประเภทนี้อยู่ ${used} รายการ` });
  const r = db.prepare('DELETE FROM repair_types WHERE id = ?').run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'ไม่พบประเภทนี้' });
  res.status(204).end();
});

module.exports = router;
