// ============================================================
// db.js — สร้างฐานข้อมูล SQL (SQLite) ตามสไลด์ "โครงสร้างข้อมูล"
// ตาราง: users, rooms, repair_types, requests  (ความสัมพันธ์ 1—N)
// ============================================================
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'dorm.db'));
db.exec('PRAGMA foreign_keys = ON;');

// ---------- Schema ----------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  student_id    TEXT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('student','staff','admin')),
  phone         TEXT,
  work_start    TEXT,   -- เวลาทำงานของช่าง (fix ไว้) เช่น "08:00"
  work_end      TEXT,   -- เช่น "16:00"
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rooms (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  building    TEXT NOT NULL,
  room_number TEXT NOT NULL,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (building, room_number)
);

CREATE TABLE IF NOT EXISTS repair_types (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS requests (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id),
  room_id           INTEGER NOT NULL REFERENCES rooms(id),
  repair_type_id    INTEGER NOT NULL REFERENCES repair_types(id),
  description       TEXT NOT NULL,
  image_url         TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','in_progress','done','cancelled')),
  assigned_staff_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  assigned_at       TEXT,   -- ใช้คำนวณ KPI "มอบหมายภายใน 24 ชม."
  completed_at      TEXT,   -- ใช้คำนวณ KPI "เวลาเฉลี่ยจนซ่อมเสร็จ"
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),  -- ใช้ตรวจว่าแถวไหนเปลี่ยน (Partial Render)
  avail_start       TEXT,   -- ช่วงเวลาที่นักศึกษาสะดวก (เวลาท้องถิ่น "YYYY-MM-DDTHH:MM")
  avail_end         TEXT,
  scheduled_at      TEXT,   -- เวลานัดเข้าซ่อม
  auto_assigned     INTEGER NOT NULL DEFAULT 0  -- 1 = ระบบจัดช่างให้เอง (ใช้คำนวณ KPI)
);
`);

// ---------- Migration: ฐานข้อมูลเก่าที่ยังไม่มีคอลัมน์เวลานัด ----------
const requestCols = db.prepare('PRAGMA table_info(requests)').all().map((c) => c.name);
for (const col of ['avail_start', 'avail_end', 'scheduled_at']) {
  if (!requestCols.includes(col)) db.exec(`ALTER TABLE requests ADD COLUMN ${col} TEXT`);
}
if (!requestCols.includes('auto_assigned')) {
  db.exec('ALTER TABLE requests ADD COLUMN auto_assigned INTEGER NOT NULL DEFAULT 0');
}
const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
for (const col of ['work_start', 'work_end']) {
  if (!userCols.includes(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT`);
}

// ---------- Seed ข้อมูลตัวอย่าง (รันครั้งแรกเท่านั้น) ----------
const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (userCount === 0) {
  const hash = (pw) => bcrypt.hashSync(pw, 10);
  const addUser = db.prepare(
    'INSERT INTO users (name, student_id, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?, ?)'
  );
  addUser.run('ผู้ดูแลหอพัก', null, 'admin@dorm.test', hash('admin123'), 'admin', '081-000-0000');
  const s1 = addUser.run('ช่างสมชาย', null, 'staff1@dorm.test', hash('staff123'), 'staff', '081-111-1111');
  const s2 = addUser.run('ช่างสมหญิง', null, 'staff2@dorm.test', hash('staff123'), 'staff', '081-222-2222');
  // ช่างแต่ละคนมีเวลาทำงาน fix ไว้ — ระบบใช้จัดงานให้อัตโนมัติ
  const setHours = db.prepare('UPDATE users SET work_start = ?, work_end = ? WHERE id = ?');
  setHours.run('08:00', '16:00', s1.lastInsertRowid);
  setHours.run('12:00', '20:00', s2.lastInsertRowid);
  const st = addUser.run('นักศึกษา ตัวอย่าง', '65010001', 'student@dorm.test', hash('student123'), 'student', '089-999-9999');

  const addType = db.prepare('INSERT INTO repair_types (name) VALUES (?)');
  ['ไฟฟ้า', 'ประปา', 'แอร์', 'เฟอร์นิเจอร์', 'อินเทอร์เน็ต', 'อื่น ๆ'].forEach((t) => addType.run(t));

  const room = db
    .prepare('INSERT INTO rooms (building, room_number, user_id) VALUES (?, ?, ?)')
    .run('A', '101', st.lastInsertRowid);

  // คำขอตัวอย่าง เพื่อให้ Dashboard มีข้อมูลตอนเดโม
  const addReq = db.prepare(`
    INSERT INTO requests (user_id, room_id, repair_type_id, description, status, assigned_staff_id,
                          created_at, assigned_at, completed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?), ?, ?, datetime('now'))`);
  addReq.run(st.lastInsertRowid, room.lastInsertRowid, 2, 'ก๊อกน้ำในห้องน้ำรั่ว', 'done', s1.lastInsertRowid,
    '-3 days', db.prepare("SELECT datetime('now','-3 days','+2 hours') AS t").get().t,
    db.prepare("SELECT datetime('now','-2 days') AS t").get().t);
  addReq.run(st.lastInsertRowid, room.lastInsertRowid, 1, 'หลอดไฟหน้าห้องดับ', 'in_progress', s1.lastInsertRowid,
    '-1 days', db.prepare("SELECT datetime('now','-20 hours') AS t").get().t, null);
  addReq.run(st.lastInsertRowid, room.lastInsertRowid, 3, 'แอร์ไม่เย็น มีน้ำหยด', 'pending', null,
    '-2 hours', null, null);

  console.log('✔ สร้างฐานข้อมูลและข้อมูลตัวอย่างแล้ว');
}

// ช่างที่ยังไม่มีเวลาทำงาน (เช่น จากฐานข้อมูลเก่า) ให้ใช้ค่าเริ่มต้น 08:00–17:00
db.exec("UPDATE users SET work_start = '08:00', work_end = '17:00' WHERE role = 'staff' AND work_start IS NULL");

module.exports = db;
