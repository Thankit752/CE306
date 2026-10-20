// ============================================================
// routes/slots.js — GET /api/slots  ตารางช่องเวลาว่าง 7 วัน (ทุก role ที่ล็อกอิน)
// ============================================================
const express = require('express');
const { getAvailability } = require('../slots');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  res.json(getAvailability());
});

module.exports = router;
