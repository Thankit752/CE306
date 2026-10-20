// ============================================================
// middleware/auth.js — JWT Authentication + Role-based Access Control
// ============================================================
const jwt = require('jsonwebtoken');
const db = require('../db');

// ใน production ต้องตั้งค่า JWT_SECRET ผ่าน environment variable เสมอ (ไม่ตั้ง = ไม่ยอมเปิด server)
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('ต้องตั้งค่า JWT_SECRET ก่อนรันแบบ production');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = '8h';

// ออก Token หลังล็อกอินสำเร็จ — ใส่ id, role ไว้ใน payload
function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

// ขั้นที่ 1: ตรวจว่ามี Token ที่ถูกต้องใน Header "Authorization: Bearer <token>"
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  }
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET); // { id, role, name, iat, exp }
  } catch {
    return res.status(401).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ' });
  }
  // อ่าน role ล่าสุดจากฐานข้อมูล — ช่างที่ถูกลบไปแล้วใช้ token เก่าต่อไม่ได้
  const user = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(payload.id);
  if (!user) return res.status(401).json({ error: 'ไม่พบบัญชีผู้ใช้นี้แล้ว' });
  req.user = user;
  next();
}

// ขั้นที่ 2: ตรวจว่า role ใน Token มีสิทธิ์เรียก endpoint นี้หรือไม่
//   ใช้แบบ: router.put('/x', authenticate, authorize('admin'), handler)
function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง' });
    }
    next();
  };
}

module.exports = { signToken, authenticate, authorize };
