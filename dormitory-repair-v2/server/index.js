// ============================================================
// server/index.js — จุดเริ่มต้น Express
//   /api/*      RESTful API (JSON)
//   /uploads/*  รูปที่นักศึกษาแนบ
//   /*          หน้าเว็บ Vue ที่ build แล้ว (client/dist) — ตอน dev ใช้ Vite แทน
// ============================================================
const express = require('express');
const fs = require('fs');
const path = require('path');
const metrics = require('./metrics');
const { UPLOAD_DIR } = require('./upload');

require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');

app.use(express.json());

// จับเวลาทุก API request → KPI "API ตอบสนองเฉลี่ย"
app.use('/api', (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => metrics.record(Number(process.hrtime.bigint() - start) / 1e6));
  next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/slots', require('./routes/slots'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/repair-types', require('./routes/repairTypes'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api', (req, res) => res.status(404).json({ error: 'ไม่พบ endpoint นี้' }));

// nosniff: เบราว์เซอร์ต้องเชื่อ Content-Type ของไฟล์ ไม่เดาเองว่าเป็น HTML (กัน XSS อีกชั้น)
app.use('/uploads', express.static(UPLOAD_DIR, { setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff') }));
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('/{*path}', (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

// error กลาง: ช่องเต็ม (409), ไฟล์ใหญ่ (413), อื่น ๆ (500)
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'ไฟล์รูปใหญ่เกิน 5MB' });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์' });
});

app.listen(PORT, () => {
  console.log(`API พร้อมที่ http://localhost:${PORT}`);
  if (!fs.existsSync(CLIENT_DIST)) console.log('   (โหมด dev: เปิดหน้าเว็บที่ http://localhost:5173)');
});
