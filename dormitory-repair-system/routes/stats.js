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

  // KPI 2: % คำขอที่ได้รับมอบหมายภายใน 24 ชั่วโมง (เป้าหมาย 90%)
  const assign = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN assigned_at IS NOT NULL
                     AND (julianday(assigned_at) - julianday(created_at)) * 24 <= 24 THEN 1 ELSE 0 END) AS within
    FROM requests
    WHERE status != 'cancelled'
      AND (assigned_at IS NOT NULL OR (julianday('now') - julianday(created_at)) * 24 > 24)`).get();

  res.json({
    total: byStatus.reduce((s, x) => s + x.count, 0),
    byStatus,
    byType,
    kpi: {
      avgResolveHours: avgHours == null ? null : Number(avgHours.toFixed(1)),
      assignedWithin24hPct: assign.total ? Math.round((assign.within / assign.total) * 100) : null,
      // KPI 3: เวลาตอบสนอง API เฉลี่ย (เป้าหมาย < 500ms) วัดจาก middleware ใน server.js
      avgApiMs: metrics.average(),
    },
  });
});

module.exports = router;
