// ============================================================
// routes/stats.js — GET /api/stats  (admin)  ข้อมูลสำหรับ Dashboard + KPI
// ============================================================
const express = require('express');
const db = require('../db');
const metrics = require('../metrics');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, authorize('admin'), (req, res) => {
  const byStatus = db.prepare('SELECT status, COUNT(*) AS count FROM requests GROUP BY status').all();
  const byType = db.prepare(`
    SELECT t.name, COUNT(r.id) AS count
    FROM repair_types t LEFT JOIN requests r ON r.repair_type_id = t.id AND r.status != 'cancelled'
    GROUP BY t.id ORDER BY count DESC`).all();

  // KPI 1: ระยะเวลาเฉลี่ย (ชั่วโมง) ตั้งแต่แจ้งจนซ่อมเสร็จ
  const avgHours = db.prepare(`
    SELECT AVG((julianday(completed_at) - julianday(created_at)) * 24) AS h
    FROM requests WHERE status = 'done' AND completed_at IS NOT NULL`).get().h;

  // KPI 2: % คำขอที่ระบบจัดช่างว่างให้ได้เองทันที (เป้าหมาย 90%)
  //   นับเฉพาะคำขอที่นักศึกษาระบุช่วงเวลาสะดวก (คำขอแบบใหม่) — ถ้าต่ำแปลว่าช่างไม่พอในบางช่วง
  const auto = db.prepare(`
    SELECT COUNT(*) AS total, SUM(auto_assigned) AS auto
    FROM requests
    WHERE status != 'cancelled' AND avail_start IS NOT NULL`).get();

  res.json({
    total: byStatus.reduce((s, x) => s + x.count, 0),
    byStatus,
    byType,
    kpi: {
      avgResolveHours: avgHours == null ? null : Number(avgHours.toFixed(1)),
      autoAssignedPct: auto.total ? Math.round((auto.auto / auto.total) * 100) : null,
      // KPI 3: เวลาตอบสนอง API เฉลี่ย (เป้าหมาย < 500ms) วัดจาก middleware ใน server.js
      avgApiMs: metrics.average(),
    },
  });
});

module.exports = router;
