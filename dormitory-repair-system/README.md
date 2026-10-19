# 🔧 ระบบแจ้งซ่อมหอพัก (Dormitory Repair Request System)

เว็บแอปที่สร้างตามสไลด์ Business Understanding — แจ้งซ่อม · มอบหมายงาน · ติดตามสถานะ

**Tech stack:** Node.js + Express (Backend/REST API) · SQLite (ฐานข้อมูล SQL) · JWT + bcrypt (ยืนยันตัวตน) · HTML/CSS/Vanilla JS (Frontend, Partial DOM Render)

---

## วิธีรัน

```bash
npm install
npm start        # หรือ npm run dev (รีสตาร์ทเองเมื่อแก้โค้ด)
```

เปิด http://localhost:3000 — ครั้งแรกระบบจะสร้างฐานข้อมูล `data/dorm.db` พร้อมข้อมูลตัวอย่าง

| บทบาท | อีเมล | รหัสผ่าน |
|---|---|---|
| นักศึกษา | student@dorm.test | student123 |
| ช่างซ่อม | staff1@dorm.test / staff2@dorm.test | staff123 |
| แอดมิน | admin@dorm.test | admin123 |

(ที่หน้า login มีปุ่ม "บัญชีทดลอง" กดแล้วกรอกให้อัตโนมัติ) · อยากล้างข้อมูลกลับเป็นค่าเริ่มต้น → ลบไฟล์ `data/dorm.db` แล้วรันใหม่

---

## โครงสร้างไฟล์

```
dormitory-repair-system/
├── server.js              จุดเริ่มต้น: ตั้งค่า Express, รวม route ทั้งหมดไว้ใต้ /api
├── db.js                  สร้างตาราง SQL 4 ตาราง + ข้อมูลตัวอย่าง
├── metrics.js             เก็บเวลาตอบสนอง API (ใช้ทำ KPI < 500ms)
├── middleware/
│   └── auth.js            ออก/ตรวจ JWT + ตรวจสิทธิ์ตาม role
├── routes/
│   ├── auth.js            สมัคร / ล็อกอิน / ดูข้อมูลตัวเอง
│   ├── requests.js        CRUD คำขอแจ้งซ่อม (หัวใจของระบบ)
│   ├── repairTypes.js     CRUD ประเภทงานซ่อม
│   ├── staff.js           CRUD ช่างซ่อม
│   └── stats.js           ข้อมูล Dashboard + KPI
├── public/                ฝั่งหน้าเว็บ (Frontend)
│   ├── index.html         โครงหน้าเว็บทุกหน้า (แยกเป็น section ตาม role)
│   ├── style.css
│   └── app.js             เรียก API, สลับหน้า, Partial Render, Polling
├── data/dorm.db           ไฟล์ฐานข้อมูล (สร้างอัตโนมัติ)
└── uploads/               รูปที่นักศึกษาอัปโหลด
```

---

## ภาพรวมการทำงาน (Architecture)

```
 Browser (public/app.js)                          Server (Express)                     SQLite
┌─────────────────────────┐   HTTP + JSON     ┌──────────────────────────────┐    ┌──────────┐
│ fetch('/api/...')       │ ────────────────▶ │ authenticate  → ตรวจ JWT      │    │ users    │
│ Header:                 │                   │ authorize()   → ตรวจ role     │ ─▶ │ rooms    │
│  Authorization: Bearer  │                   │ route handler → SQL query     │    │ repair_  │
│                         │ ◀──────────────── │ res.json(ผลลัพธ์)              │ ◀─ │  types   │
│ syncList() → แก้ DOM     │     JSON          └──────────────────────────────┘    │ requests │
│ เฉพาะแถวที่เปลี่ยน          │                                                      └──────────┘
└─────────────────────────┘
        ▲ ทุก 5 วินาที (polling)
```

ลำดับเหตุการณ์ตัวอย่าง **"นักศึกษาแจ้งซ่อม → ช่างอัปเดต → นักศึกษาเห็นทันที"**

1. นักศึกษากรอกฟอร์ม → `app.js` ส่ง `POST /api/requests` แบบ `FormData` (มีรูป) พร้อม JWT
2. Server: `authenticate` ถอด token ได้ `{id, role:'student'}` → `authorize('student')` ผ่าน → `multer` เก็บรูปลง `uploads/` → `INSERT INTO requests` สถานะ `pending`
3. แอดมินเลือกช่างใน dropdown → `PUT /api/requests/:id/assign` → บันทึก `assigned_staff_id`, `assigned_at`
4. ช่างกด "เริ่มซ่อม" → `PUT /api/requests/:id/status` `{status:'in_progress'}` → server อัปเดต `updated_at`
5. หน้าเว็บนักศึกษา polling ทุก 5 วิ → ได้รายการใหม่ → `syncList()` เห็นว่า `updated_at` ของคำขอนั้นเปลี่ยน → **แทนที่เฉพาะการ์ดใบนั้น** + ไฮไลต์สีเหลือง + toast แจ้งเตือน

---

## ส่วนที่ 1 — โจทย์ธุรกิจและผู้ใช้ (สไลด์ 2–5)

ในโค้ด role ทั้ง 3 ถูกกำหนดที่คอลัมน์ `users.role` ([db.js](db.js)) และหน้าเว็บสลับตาม role ใน `showView(state.me.role)` ([public/app.js](public/app.js))

| Role | หน้าที่เห็น | ทำอะไรได้ |
|---|---|---|
| 🎓 student | ฟอร์มแจ้งซ่อม + การ์ดคำขอของตัวเอง + แถบสถานะ 3 ขั้น | แจ้งซ่อมพร้อมรูป, ยกเลิกคำขอที่ยังรอดำเนินการ |
| 🔧 staff | รายการงานที่ได้รับมอบหมาย + ตัวกรองสถานะ | กด "เริ่มซ่อม" / "ซ่อมเสร็จแล้ว" |
| 🗂️ admin | Dashboard KPI + กราฟ + ตารางคำขอทั้งหมด + แท็บจัดการ | มอบหมายช่าง, ยกเลิก, CRUD ประเภทงาน, CRUD ช่าง |

---

## ส่วนที่ 2 — สถาปัตยกรรมระบบและ API (สไลด์ 6–8)

### 2.1 ฐานข้อมูล SQL ([db.js](db.js))

เลือก SQL เพราะข้อมูลสัมพันธ์กันชัดเจน — `requests` อ้างถึงตารางอื่นด้วย `FOREIGN KEY`

- `users` 1—N `requests` (ผู้แจ้ง: `user_id`) และ 1—N `requests` (ช่าง: `assigned_staff_id`)
- `rooms` 1—N `requests`
- `repair_types` 1—N `requests`

คอลัมน์ที่เพิ่มจากสไลด์ (เพื่อให้ฟีเจอร์ทำงานได้จริง):

| คอลัมน์ | ใช้ทำอะไร |
|---|---|
| `created_at`, `assigned_at`, `completed_at` | คำนวณ KPI เวลาเฉลี่ย / มอบหมายภายใน 24 ชม. |
| `updated_at` | ให้ฝั่งเว็บรู้ว่าแถวไหนเปลี่ยน → Partial Render |
| `CHECK (status IN (...))` | ฐานข้อมูลบังคับให้สถานะมีแค่ 4 ค่า |

ทุก query ใช้ **prepared statement** (`db.prepare('... WHERE id = ?').get(id)`) → ป้องกัน SQL Injection

### 2.2 RESTful API Endpoints

| Method | Endpoint | สิทธิ์ | ไฟล์ |
|---|---|---|---|
| POST | `/api/auth/register` | ทุกคน | routes/auth.js |
| POST | `/api/auth/login` | ทุกคน | routes/auth.js |
| GET | `/api/auth/me` | ล็อกอินแล้ว | routes/auth.js |
| GET | `/api/repair-types` | ทุกคน | routes/repairTypes.js |
| POST / PUT / DELETE | `/api/repair-types/:id` | admin | routes/repairTypes.js |
| POST | `/api/requests` | student | routes/requests.js |
| GET | `/api/requests` | ทุก role (กรองให้อัตโนมัติ) | routes/requests.js |
| GET | `/api/requests/:id` | เจ้าของ / ช่างที่รับงาน / admin | routes/requests.js |
| PUT | `/api/requests/:id/assign` | admin | routes/requests.js |
| PUT | `/api/requests/:id/status` | staff / admin | routes/requests.js |
| DELETE | `/api/requests/:id` | student (เจ้าของ) / admin | routes/requests.js |
| GET / POST / PUT / DELETE | `/api/staff/:id` | admin | routes/staff.js |
| GET | `/api/stats` | admin | routes/stats.js |

ใช้ HTTP status code ตามมาตรฐาน: `200` สำเร็จ · `201` สร้างใหม่ · `204` ลบสำเร็จ · `400` ข้อมูลผิด · `401` ไม่ได้ล็อกอิน · `403` ไม่มีสิทธิ์ · `404` ไม่พบ · `409` ข้อมูลซ้ำ/ชนกัน

> **จุดน่าพูดตอนพรีเซนต์:** `GET /api/requests` เป็น endpoint เดียวกันทุก role แต่ server เติม `WHERE` ตาม role ใน token เอง (student เห็นของตัวเอง, staff เห็นงานตัวเอง) — ฝั่งเว็บปลอมแปลงไม่ได้

### 2.3 การยืนยันตัวตน JWT ([middleware/auth.js](middleware/auth.js))

1. **Login** — `routes/auth.js` เทียบรหัสผ่านกับ `password_hash` ด้วย `bcrypt.compareSync` (เก็บแบบ hash ไม่เก็บรหัสจริง)
2. **ออก Token** — `signToken()` ใส่ `{id, role, name}` ลงใน payload แล้วเซ็นด้วย `JWT_SECRET` อายุ 8 ชม.
3. **แนบ Header** — `api()` ใน app.js ใส่ `Authorization: Bearer <token>` ทุก request (token เก็บใน `localStorage`)
4. **ตรวจ** — `authenticate` ใช้ `jwt.verify()` ถ้า token ถูกแก้หรือหมดอายุ → `401`
5. **RBAC** — `authorize('admin')` เช็ค `req.user.role` → ไม่ตรง → `403` และ `canView()` เช็คสิทธิ์ระดับ "แถวข้อมูล" อีกชั้น

**HTTPS:** ตอนพัฒนารันบน `http://localhost` ตอน deploy จริงให้รันหลัง reverse proxy (Nginx / Caddy) หรือบริการอย่าง Render/Railway ซึ่งเปิด HTTPS ให้ — token จึงถูกเข้ารหัสระหว่างทาง

---

## ส่วนที่ 3 — ขอบเขตฟีเจอร์และการวัดผล (สไลด์ 9–10)

### 3.1 CRUD

| Entity | Create | Read | Update | Delete |
|---|---|---|---|---|
| Repair Request | แจ้งซ่อม + รูป | รายการ / รายละเอียด | มอบหมายช่าง / เปลี่ยนสถานะ | ยกเลิก (soft delete → `cancelled` เก็บประวัติไว้ทำรายงาน) |
| Repair Type | เพิ่มประเภท | รายการ + จำนวนคำขอ | แก้ชื่อ | ลบ (ห้ามลบถ้ามีคำขอใช้อยู่ → `409`) |
| Staff | เพิ่มช่าง | รายชื่อ + งานค้าง/เสร็จ | แก้ชื่อ/เบอร์ | ลบ (งานค้างกลับเป็น "ยังไม่มอบหมาย") |

### 3.2 Dynamic Update — Partial Render ([public/app.js](public/app.js) ฟังก์ชัน `syncList`)

แทนที่จะรีโหลดหน้าหรือเขียน `innerHTML` ทับทั้งรายการ ระบบทำแบบนี้:

```js
// ทุก element มี data-id และ data-version (= updated_at)
if (!el || el.dataset.version !== item.updated_at) {
  const fresh = htmlToElement(renderFn(item));
  el ? el.replaceWith(fresh) : container.insertBefore(fresh, ...);
  fresh.classList.add('flash');   // ไฮไลต์ให้เห็นว่าเปลี่ยน
}
// รายการที่ไม่ได้อยู่ในข้อมูลใหม่ → el.remove()
// รายการที่ version เท่าเดิม → ไม่แตะ DOM เลย
```

- `startPolling()` เรียก `fetch` ทุก 5 วินาที (หยุดเองเมื่อสลับแท็บไปที่อื่น — `document.hidden`)
- `notifyChanges()` เทียบสถานะกับรอบก่อน → แสดง toast "คำขอ #3 เปลี่ยนเป็น กำลังซ่อม"
- ใช้ **Event Delegation** (ผูก click ที่ container เดียว) จึงไม่ต้องผูก event ใหม่ทุกครั้งที่แถวถูกแทนที่
- ใช้ `esc()` แปลงอักขระพิเศษก่อนแทรก HTML → ป้องกัน XSS

**ข้อดีเทียบกับรีโหลดหน้า:** โหลดเร็วกว่า, ไม่กระพริบ, ฟอร์มที่กำลังพิมพ์ค้างอยู่ไม่หาย, dropdown ที่แอดมินกำลังเลือกไม่ถูกรีเซ็ต

### 3.3 KPI ([routes/stats.js](routes/stats.js)) — แสดงบน Dashboard แอดมิน

| KPI ในสไลด์ | คำนวณยังไงในโค้ด |
|---|---|
| ระยะเวลาเฉลี่ยแจ้งซ่อมจนเสร็จ ↓ | `AVG(completed_at − created_at)` ของงานที่ `done` (หน่วยชั่วโมง) |
| 90% ได้รับมอบหมายภายใน 24 ชม. | สัดส่วนคำขอที่ `assigned_at − created_at ≤ 24 ชม.` (เขียว ≥ 90%, แดงถ้าต่ำกว่า) |
| API ตอบสนอง < 500ms | middleware ใน `server.js` จับเวลาทุก request → `metrics.js` เฉลี่ย 500 ครั้งล่าสุด |

### 3.4 Roadmap

- ✅ **MVP (ทำแล้วในโค้ดนี้):** สมัคร/ล็อกอิน + แจ้งซ่อม + ติดตามสถานะ + มอบหมายช่าง + Dashboard พื้นฐาน
- ⏭️ **Phase 2:** มอบหมายอัตโนมัติ (เลือกช่างที่ `active_jobs` น้อยสุด — ข้อมูลมีอยู่แล้วใน `GET /api/staff`), แจ้งเตือน Email/LINE, เปลี่ยน polling เป็น WebSocket/SSE
- ⏭️ **Phase 3:** รายงานค่าใช้จ่าย (เพิ่มคอลัมน์ `cost`), กราฟรายเดือน
- ❌ **นอกขอบเขต:** ระบบชำระเงิน, แชทสด

---

## สคริปต์เดโมตอนพรีเซนต์ (~5 นาที)

1. **เปิด 2 หน้าต่างคู่กัน:** ซ้าย = นักศึกษา, ขวา = แอดมิน (ใช้ incognito หน้าต่างหนึ่ง เพราะ token อยู่ใน localStorage แยกกัน)
2. นักศึกษาแจ้งซ่อมใหม่พร้อมรูป → ฝั่งแอดมินมีแถวใหม่โผล่ขึ้นมาเองภายใน 5 วิ (ไฮไลต์เหลือง + toast "มีงานใหม่")
3. แอดมินมอบหมายให้ "ช่างสมชาย" → สลับหน้าต่างขวาเป็นช่าง (staff1) → กด "เริ่มซ่อม"
4. หน้านักศึกษา: การ์ดใบนั้นเปลี่ยนสถานะเป็น "กำลังซ่อม" **โดยไม่รีโหลด** ← จุดสำคัญ Partial Render
5. เปิด DevTools → Network ให้ดูว่า request มี `Authorization: Bearer ...` และได้ JSON กลับมา
6. โชว์ความปลอดภัย: ลบ token ใน localStorage แล้วเรียก API → `401` / ล็อกอินเป็นช่างแล้วเรียก `/api/stats` → `403`
7. ปิดท้ายที่ Dashboard: KPI 3 ตัวตรงกับสไลด์ 10
