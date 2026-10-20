// ============================================================
// db.js — ฐานข้อมูล SQL (SQLite) 4 ตาราง: users, rooms, repair_types, requests
// v2: ช่างมีเวลาทำงาน + จำนวนงานสูงสุดต่อวัน, คำขอผูกกับ "ช่องเวลา" (slot) ที่จองไว้
// ============================================================
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { thaiDate } = require('./time');

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'dorm.db'));
db.exec('PRAGMA foreign_keys = ON;');

// ---------- Schema ----------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  student_id        TEXT,
  email             TEXT NOT NULL UNIQUE,
  password_hash     TEXT NOT NULL,
  role              TEXT NOT NULL CHECK (role IN ('student','staff','admin')),
  phone             TEXT,
  work_start        TEXT,                -- ช่าง: เวลาเข้างาน เช่น "08:00"
  work_end          TEXT,                -- ช่าง: เวลาเลิกงาน เช่น "17:00"
  max_jobs_per_day  INTEGER,             -- ช่าง: รับได้กี่งานต่อวัน
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
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
  slot_date         TEXT NOT NULL,       -- วันที่จอง "YYYY-MM-DD"
  slot_start        TEXT NOT NULL,       -- ช่องเวลาที่จอง เช่น "13:00" (ยาว 2 ชม.)
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  assigned_at       TEXT,
  completed_at      TEXT,                -- ใช้คำนวณ KPI เวลาเฉลี่ยจนซ่อมเสร็จ
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))  -- ใช้ตรวจว่าแถวไหนเปลี่ยน
);

-- ★ กันคิวซ้อนที่ระดับฐานข้อมูล: ช่าง 1 คน มีงานที่ยังไม่ปิดได้แค่ 1 งานต่อ 1 ช่องเวลา
--   (งานที่ยกเลิก/เสร็จแล้วไม่นับ → ยกเลิกแล้วช่องว่างทันที)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_staff_slot
  ON requests (assigned_staff_id, slot_date, slot_start)
  WHERE status IN ('pending', 'in_progress');
`);

// ---------- Seed ข้อมูลตัวอย่าง (รันครั้งแรกเท่านั้น) ----------
const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (userCount === 0) {
  const hash = (pw) => bcrypt.hashSync(pw, 10);
  const addUser = db.prepare(`
    INSERT INTO users (name, student_id, email, password_hash, role, phone, work_start, work_end, max_jobs_per_day)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  addUser.run('ผู้ดูแลหอพัก', null, 'admin@dorm.test', hash('admin123'), 'admin', '081-000-0000', null, null, null);
  const s1 = addUser.run('ช่างสมชาย', null, 'staff1@dorm.test', hash('staff123'), 'staff', '081-111-1111', '08:00', '17:00', 3);
  const s2 = addUser.run('ช่างสมหญิง', null, 'staff2@dorm.test', hash('staff123'), 'staff', '081-222-2222', '10:00', '17:00', 2);
  const st = addUser.run('นักศึกษา ตัวอย่าง', '65010001', 'student@dorm.test', hash('student123'), 'student', '089-999-9999', null, null, null);

  const addType = db.prepare('INSERT INTO repair_types (name) VALUES (?)');
  ['ไฟฟ้า', 'ประปา', 'แอร์', 'เฟอร์นิเจอร์', 'อินเทอร์เน็ต', 'อื่น ๆ'].forEach((t) => addType.run(t));

  const room = db.prepare('INSERT INTO rooms (building, room_number, user_id) VALUES (?, ?, ?)')
    .run('A', '101', st.lastInsertRowid);

  // คำขอตัวอย่าง: เสร็จแล้ว 1 งาน (3 วันก่อน) และจองไว้ล่วงหน้า 2 งาน (พรุ่งนี้)
  const day = (offset) => thaiDate(offset);
  const addReq = db.prepare(`
    INSERT INTO requests (user_id, room_id, repair_type_id, description, status, assigned_staff_id,
                          slot_date, slot_start, created_at, assigned_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?), datetime('now', ?), ?)`);
  addReq.run(st.lastInsertRowid, room.lastInsertRowid, 2, 'ก๊อกน้ำในห้องน้ำรั่ว', 'done', s1.lastInsertRowid,
    day(-3), '10:00', '-4 days', '-4 days', db.prepare("SELECT datetime('now','-3 days') AS t").get().t);
  addReq.run(st.lastInsertRowid, room.lastInsertRowid, 1, 'หลอดไฟหน้าห้องดับ', 'pending', s1.lastInsertRowid,
    day(1), '08:00', '-2 hours', '-2 hours', null);
  addReq.run(st.lastInsertRowid, room.lastInsertRowid, 3, 'แอร์ไม่เย็น มีน้ำหยด', 'pending', s2.lastInsertRowid,
    day(1), '10:00', '-1 hours', '-1 hours', null);

  console.log('สร้างฐานข้อมูลและข้อมูลตัวอย่างแล้ว');
}

module.exports = db;
