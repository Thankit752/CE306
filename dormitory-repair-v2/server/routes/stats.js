// ============================================================
// routes/stats.js — GET /api/stats (admin) Dashboard + KPI + ภาระงานช่าง
// ============================================================
const express = require('express');
const db = require('../db');
const metrics = require('../metrics');
const { getStaffLoad } = require('../slots');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, authorize('admin'), (req, res) => {
  const byStatus = db.prepare('SELECT status, COUNT(*) AS count FROM requests GROUP BY status').all();
  const byType = db.prepare(`
    SELECT t.name, COUNT(r.id) AS count
    FROM repair_types t LEFT JOIN requests r ON r.repair_type_id = t.id AND r.status != 'cancelled'
    GROUP BY t.id ORDER BY count DESC`).all();

  // KPI 1: เวลาเฉลี่ย (ชม.) ตั้งแต่แจ้งจนซ่อมเสร็จ
  const avgHours = db.prepare(`
    SELECT AVG((julianday(completed_at) - julianday(created_at)) * 24) AS h
    FROM requests WHERE status = 'done' AND completed_at IS NOT NULL`).get().h;

  // KPI 2: อัตราใช้คิวช่าง 7 วันข้างหน้า = งานที่จองแล้ว ÷ งานที่ช่างทุกคนรับได้รวมกัน
  //   สูงเกิน 90% = ใกล้เต็ม ควรเพิ่มช่าง / ต่ำมาก = ช่างว่างเยอะ
  const load = getStaffLoad();
  const booked = load.staff.reduce((sum, s) => sum + s.days.reduce((a, b) => a + b, 0), 0);
  const capacity = load.staff.reduce((sum, s) => sum + s.capacity * load.dates.length, 0);

  res.json({
    total: byStatus.reduce((s, x) => s + x.count, 0),
    byStatus,
    byType,
    load,
    kpi: {
      avgResolveHours: avgHours == null ? null : Number(avgHours.toFixed(1)),
      utilizationPct: capacity ? Math.round((booked / capacity) * 100) : null,
      // KPI 3: เวลาตอบสนอง API เฉลี่ย (เป้า < 500ms)
      avgApiMs: metrics.average(),
    },
  });
});

module.exports = router;
