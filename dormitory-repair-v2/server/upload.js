// ============================================================
// upload.js — รับรูปที่นักศึกษาแนบอย่างปลอดภัย
//   • นามสกุลไฟล์มาจากรายการที่เรากำหนด (ไม่ใช้ชื่อไฟล์ที่ผู้ใช้ส่งมา)
//     → อัปโหลด x.html / x.svg ปลอมเป็นรูปไม่ได้ (กัน Stored XSS)
//   • ตรวจ "magic bytes" ต้นไฟล์ว่าเป็นรูปจริง ไม่ใช่แค่เชื่อ Content-Type
//   • ลบไฟล์ทิ้งเมื่อการจองไม่สำเร็จ ไม่ให้มีไฟล์ค้าง
// ============================================================
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const EXT_BY_TYPE = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + EXT_BY_TYPE[file.mimetype]),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype in EXT_BY_TYPE),
});

// ไบต์แรกของไฟล์รูปแต่ละชนิด
function isRealImage(filePath) {
  const head = Buffer.alloc(12);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, head, 0, 12, 0);
  fs.closeSync(fd);
  const hex = head.toString('hex');
  return hex.startsWith('89504e47')                                       // PNG
    || hex.startsWith('ffd8ff')                                           // JPEG
    || hex.startsWith('47494638')                                         // GIF
    || (hex.startsWith('52494646') && head.toString('ascii', 8, 12) === 'WEBP'); // WEBP
}

function removeUpload(file) {
  if (file) fs.rm(file.path, { force: true }, () => {});
}

module.exports = { upload, isRealImage, removeUpload, UPLOAD_DIR };
