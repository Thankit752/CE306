// ============================================================
// server.js — จุดเริ่มต้นของแอป (Express)
//   - เสิร์ฟหน้าเว็บ (public/) และรูปที่อัปโหลด (uploads/)
//   - รวม RESTful API ทั้งหมดไว้ใต้ /api
// ============================================================
const express = require('express');
const fs = require('fs');
const path = require('path');
const metrics = require('./metrics');

require('./db'); // สร้างตาราง + seed ข้อมูลครั้งแรก

const app = express();
const PORT = process.env.PORT || 3000;

fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });

app.use(express.json()); // อ่าน JSON payload จาก request body

// วัดเวลาตอบสนองของทุก API request → ใช้ใน KPI
app.use('/api', (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => metrics.record(Number(process.hrtime.bigint() - start) / 1e6));
  next();
});

// ---------- RESTful API ----------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/repair-types', require('./routes/repairTypes'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/stats', require('./routes/stats'));

app.use('/api', (req, res) => res.status(404).json({ error: 'ไม่พบ endpoint นี้' }));

// ---------- ไฟล์ static ----------
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// จัดการ error กลาง (เช่น ไฟล์ใหญ่เกิน)
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 500;
  res.status(status).json({ error: status === 413 ? 'ไฟล์รูปใหญ่เกิน 5MB' : 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์' });
});

// หมายเหตุ: ตอนพัฒนาใช้ HTTP บน localhost
// ตอน deploy จริงให้รันหลัง reverse proxy (Nginx/Caddy) หรือ Render/Railway ที่เปิด HTTPS ให้
app.listen(PORT, () => console.log(`🔧 ระบบแจ้งซ่อมหอพัก พร้อมใช้งานที่ http://localhost:${PORT}`));
