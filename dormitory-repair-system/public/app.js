// ============================================================
// app.js — ฝั่ง Frontend (Vanilla JS, ไม่ใช้ framework)
//   1) api()       เรียก REST API พร้อมแนบ JWT ใน Header
//   2) showView()  สลับหน้าตาม role (student / staff / admin)
//   3) syncList()  Partial Render — อัปเดตเฉพาะแถวที่เปลี่ยนใน DOM
//   4) startPolling() ดึงข้อมูลใหม่ทุก 5 วินาที โดยไม่รีโหลดหน้า
// ============================================================

const STATUS_TEXT = {
  pending: 'รอดำเนินการ',
  in_progress: 'กำลังซ่อม',
  done: 'เสร็จสิ้น',
  cancelled: 'ยกเลิก',
};
const POLL_MS = 5000;

const state = {
  token: localStorage.getItem('token'),
  me: null,
  repairTypes: [],
  staff: [],
  staffFilter: '',
  adminFilter: '',
  lastStatus: new Map(), // id → status ล่าสุด ใช้ตรวจว่าสถานะเปลี่ยนเพื่อแจ้งเตือน
  pollTimer: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- 1) Helper เรียก API ----------
async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`; // แนบ JWT
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: form || (body ? JSON.stringify(body) : undefined), // form = FormData (มีรูป)
  });

  if (res.status === 401 && state.token) { logout(); throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'); }
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data;
}

// ป้องกัน XSS: แปลงอักขระพิเศษก่อนแทรกลง innerHTML
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// SQLite เก็บเวลาเป็น UTC "YYYY-MM-DD HH:MM:SS" → แปลงเป็นเวลาไทย
function fmtTime(s) {
  if (!s) return '-';
  return new Date(s.replace(' ', 'T') + 'Z').toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

function toast(msg, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' err' : '');
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 3500);
}

function statusBadge(status) {
  return `<span class="status ${status}">${STATUS_TEXT[status]}</span>`;
}

// ---------- 3) Partial Render ----------
// แทนที่จะลบแล้ววาดใหม่ทั้งรายการ (innerHTML = ...) ฟังก์ชันนี้จะ
//   - เพิ่ม element ใหม่ เฉพาะรายการที่ยังไม่มี
//   - แทนที่ element เฉพาะรายการที่ updated_at เปลี่ยน (แล้วไฮไลต์ให้เห็น)
//   - ลบ element ของรายการที่หายไป
//   - รายการที่ไม่เปลี่ยน → ไม่แตะ DOM เลย
function syncList(container, items, renderFn) {
  const keep = new Set();

  items.forEach((item, index) => {
    const id = String(item.id);
    keep.add(id);
    let el = container.querySelector(`:scope > [data-id="${id}"]`);

    if (!el || el.dataset.version !== item.updated_at) {
      const fresh = htmlToElement(renderFn(item));
      fresh.dataset.id = id;
      fresh.dataset.version = item.updated_at;
      if (el) {
        el.replaceWith(fresh);
        fresh.classList.add('flash'); // ให้เห็นว่าแถวนี้ถูกอัปเดต
      } else if (container.children.length && container.dataset.ready) {
        fresh.classList.add('flash'); // รายการใหม่ที่เพิ่งเข้ามา
      }
      el = fresh;
    }
    // จัดลำดับให้ตรงกับข้อมูล (ย้ายเฉพาะตัวที่อยู่ผิดตำแหน่ง)
    if (container.children[index] !== el) container.insertBefore(el, container.children[index] || null);
  });

  [...container.children].forEach((el) => { if (!keep.has(el.dataset.id)) el.remove(); });
  container.dataset.ready = '1';

  const empty = $(`[data-empty-for="${container.id}"]`);
  if (empty) empty.classList.toggle('hidden', items.length > 0);
}

function htmlToElement(html) {
  const t = document.createElement('template'); // <template> รองรับ <tr> ได้ถูกต้อง
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// แจ้งเตือนเมื่อสถานะงานเปลี่ยน (เทียบกับรอบก่อนหน้า)
function notifyChanges(items) {
  const firstLoad = state.lastStatus.size === 0; // โหลดครั้งแรกไม่ต้องแจ้งเตือน
  items.forEach((r) => {
    const prev = state.lastStatus.get(r.id);
    if (prev && prev !== r.status) toast(`คำขอ #${r.id} เปลี่ยนเป็น "${STATUS_TEXT[r.status]}"`);
    if (!prev && !firstLoad && state.me.role !== 'student') toast(`มีงานใหม่ #${r.id} (${r.repair_type})`);
    state.lastStatus.set(r.id, r.status);
  });
}

// ============================================================
// 2) Auth & เปลี่ยนหน้า
// ============================================================
function showView(name) {
  $$('.view').forEach((v) => v.classList.add('hidden'));
  $(`#view-${name}`).classList.remove('hidden');
}

async function boot() {
  if (!state.token) return showView('auth');
  try {
    state.me = await api('/auth/me');
  } catch {
    return logout();
  }
  $('#user-box').classList.remove('hidden');
  $('#user-name').textContent = state.me.name;
  $('#user-role').textContent = { student: 'นักศึกษา', staff: 'ช่างซ่อม', admin: 'ผู้ดูแลหอพัก' }[state.me.role];
  state.repairTypes = await api('/repair-types');

  showView(state.me.role);
  if (state.me.role === 'student') initStudent();
  if (state.me.role === 'admin') await initAdmin();
  startPolling();
}

function logout() {
  localStorage.removeItem('token');
  state.token = null;
  state.me = null;
  state.lastStatus.clear();
  clearInterval(state.pollTimer);
  $$('[data-id]').forEach((el) => el.remove());
  $$('[data-ready]').forEach((el) => delete el.dataset.ready);
  $('#user-box').classList.add('hidden');
  showView('auth');
}

function onLoggedIn({ token }) {
  state.token = token;
  localStorage.setItem('token', token);
  $('#auth-error').textContent = '';
  boot();
}

$$('#view-auth .tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    $$('#view-auth .tab').forEach((t) => t.classList.toggle('active', t === tab));
    $('#form-login').classList.toggle('hidden', tab.dataset.tab !== 'login');
    $('#form-register').classList.toggle('hidden', tab.dataset.tab !== 'register');
    $('#auth-error').textContent = '';
  })
);

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    onLoggedIn(await api('/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }));
  } catch (err) {
    $('#auth-error').textContent = err.message;
  }
});

$('#form-register').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    onLoggedIn(await api('/auth/register', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }));
  } catch (err) {
    $('#auth-error').textContent = err.message;
  }
});

// ปุ่มกรอกบัญชีทดลอง (ข้อมูลจาก seed ใน db.js)
const DEMO = {
  student: ['student@dorm.test', 'student123'],
  staff: ['staff1@dorm.test', 'staff123'],
  admin: ['admin@dorm.test', 'admin123'],
};
$$('[data-demo]').forEach((b) =>
  b.addEventListener('click', () => {
    const [email, password] = DEMO[b.dataset.demo];
    $('#form-login [name=email]').value = email;
    $('#form-login [name=password]').value = password;
  })
);

$('#btn-logout').addEventListener('click', logout);

// ============================================================
// หน้านักศึกษา
// ============================================================
function initStudent() {
  $('#student-room').textContent = `ห้อง ${state.me.building}-${state.me.room_number} · รหัส ${state.me.student_id}`;
  $('#select-type').innerHTML =
    '<option value="">— เลือกประเภท —</option>' +
    state.repairTypes.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  renderAvailPicker();
}

// ---------- ตัวเลือกวัน/ช่วงเวลาที่สะดวก (กดปุ่มแทนการพิมพ์วันที่) ----------
const SLOTS = [
  { key: 'morning', label: '🌅 เช้า', from: '08:00', to: '12:00' },
  { key: 'afternoon', label: '☀️ บ่าย', from: '12:00', to: '16:00' },
  { key: 'evening', label: '🌆 เย็น', from: '16:00', to: '20:00' },
  { key: 'allday', label: 'ทั้งวัน', from: '08:00', to: '20:00' },
];
const pick = { date: null, slot: null };

// วันที่ตามเวลาเครื่อง (ไม่ใช้ toISOString เพราะจะกลายเป็นเวลา UTC)
function localDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function renderAvailPicker() {
  const days = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const label = i === 0 ? 'วันนี้' : i === 1 ? 'พรุ่งนี้'
      : d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
    return { value: localDate(d), label };
  });
  $('#date-chips').innerHTML = days
    .map((d) => `<button type="button" class="chip ${pick.date === d.value ? 'active' : ''}" data-date="${d.value}">${d.label}</button>`)
    .join('');

  // วันนี้: ช่วงเวลาที่เลยไปแล้วกดไม่ได้
  const now = new Date();
  const nowHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const isToday = pick.date === localDate(now);
  $('#slot-chips').innerHTML = SLOTS
    .map((s) => {
      const past = isToday && s.to <= nowHM;
      if (past && pick.slot === s.key) pick.slot = null;
      return `<button type="button" class="chip ${pick.slot === s.key ? 'active' : ''}" data-slot="${s.key}" ${past ? 'disabled' : ''}>
        ${s.label} <small>${s.from}–${s.to}</small></button>`;
    })
    .join('');

  const slot = SLOTS.find((s) => s.key === pick.slot);
  const form = $('#form-request');
  form.avail_start.value = pick.date && slot ? `${pick.date}T${slot.from}` : '';
  form.avail_end.value = pick.date && slot ? `${pick.date}T${slot.to}` : '';
  $('#avail-summary').textContent = form.avail_start.value
    ? `สะดวก ${fmtLocal(form.avail_start.value)} – ${slot.to} น.`
    : 'ยังไม่ได้เลือกเวลา';
}

$('#date-chips').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-date]');
  if (!btn) return;
  pick.date = btn.dataset.date;
  renderAvailPicker();
});

$('#slot-chips').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-slot]');
  if (!btn || btn.disabled) return;
  pick.slot = btn.dataset.slot;
  renderAvailPicker();
});

$('#input-image').addEventListener('change', (e) => {
  const file = e.target.files[0];
  const img = $('#image-preview');
  img.classList.toggle('hidden', !file);
  if (file) img.src = URL.createObjectURL(file);
});

$('#form-request').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!e.target.avail_start.value) return toast('กรุณาเลือกวันและช่วงเวลาที่สะดวก', true);
  try {
    // ใช้ FormData เพราะต้องส่งไฟล์รูป (multipart/form-data)
    const created = await api('/requests', { method: 'POST', form: new FormData(e.target) });
    e.target.reset();
    pick.date = pick.slot = null;
    renderAvailPicker();
    $('#image-preview').classList.add('hidden');
    toast(created.scheduled_at
      ? `ส่งคำขอ #${created.id} แล้ว · ${created.staff_name} จะเข้าซ่อม ${fmtLocal(created.scheduled_at)} น.`
      : `ส่งคำขอ #${created.id} แล้ว · ยังไม่มีช่างว่างในช่วงนี้ แอดมินจะจัดให้`);
    await refresh(); // วาดเฉพาะการ์ดใหม่ที่เพิ่มเข้ามา
  } catch (err) {
    toast(err.message, true);
  }
});

// เวลาจาก datetime-local ("2026-10-20T13:30") เป็นเวลาท้องถิ่นอยู่แล้ว ไม่ต้องแปลง timezone
function fmtLocal(s) {
  if (!s) return '-';
  return new Date(s).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

// บรรทัดแสดงช่วงเวลาที่นักศึกษาสะดวก + เวลานัดที่ระบบจัดให้
function scheduleInfo(r) {
  const avail = r.avail_start ? `${fmtLocal(r.avail_start)} – ${r.avail_end.slice(11)} น.` : 'ไม่ได้ระบุ';
  const appt = r.scheduled_at
    ? `<b class="appt">📅 นัดซ่อม ${fmtLocal(r.scheduled_at)} น.${r.staff_name ? ` · ${esc(r.staff_name)}` : ''}</b>`
    : ['done', 'cancelled'].includes(r.status)
      ? ''
      : r.assigned_staff_id
        ? '<span class="muted">ยังไม่ได้กำหนดเวลานัด</span>'
        : '<span class="muted">⏳ ยังไม่มีช่างว่างในช่วงนี้ รอแอดมินจัดให้</span>';
  return `<div class="req-meta">🕒 นักศึกษาสะดวก: ${avail}</div><div class="req-meta">${appt}</div>`;
}

function stepsBar(status) {
  const n = { pending: 1, in_progress: 2, done: 3, cancelled: 0 }[status];
  return `<div class="steps">${[1, 2, 3].map((i) => `<span class="${i <= n ? 'on' : ''}"></span>`).join('')}</div>`;
}

function renderStudentCard(r) {
  return `
  <div class="req">
    ${r.image_url ? `<a href="${esc(r.image_url)}" target="_blank"><img src="${esc(r.image_url)}" alt=""></a>` : ''}
    <div class="req-body">
      <div class="req-head">
        <span class="req-title">#${r.id} · ${esc(r.repair_type)}</span>
        ${statusBadge(r.status)}
      </div>
      <p class="req-desc">${esc(r.description)}</p>
      <div class="req-meta">แจ้งเมื่อ ${fmtTime(r.created_at)} · ช่าง: ${esc(r.staff_name || 'ยังไม่มอบหมาย')}</div>
      ${scheduleInfo(r)}
      ${stepsBar(r.status)}
      ${r.status === 'pending' ? `<div class="req-actions"><button class="btn danger small" data-cancel="${r.id}">ยกเลิกคำขอ</button></div>` : ''}
    </div>
  </div>`;
}

// ใช้ Event Delegation: ฟังคลิกที่ container เดียว ไม่ต้องผูก event ใหม่ทุกครั้งที่ DOM เปลี่ยน
$('#student-list').addEventListener('click', async (e) => {
  const id = e.target.dataset.cancel;
  if (!id || !confirm(`ยืนยันยกเลิกคำขอ #${id}?`)) return;
  try {
    await api(`/requests/${id}`, { method: 'DELETE' });
    await refresh();
  } catch (err) {
    toast(err.message, true);
  }
});

// ============================================================
// หน้าช่างซ่อม
// ============================================================
function renderStaffCard(r) {
  const next =
    r.status === 'pending' ? `<button class="btn primary small" data-status="in_progress" data-rid="${r.id}">▶ เริ่มซ่อม</button>`
    : r.status === 'in_progress' ? `<button class="btn success small" data-status="done" data-rid="${r.id}">✔ ซ่อมเสร็จแล้ว</button>`
    : '';
  return `
  <div class="req">
    ${r.image_url ? `<a href="${esc(r.image_url)}" target="_blank"><img src="${esc(r.image_url)}" alt=""></a>` : ''}
    <div class="req-body">
      <div class="req-head">
        <span class="req-title">#${r.id} · ห้อง ${esc(r.building)}-${esc(r.room_number)} · ${esc(r.repair_type)}</span>
        ${statusBadge(r.status)}
      </div>
      <p class="req-desc">${esc(r.description)}</p>
      <div class="req-meta">ผู้แจ้ง: ${esc(r.user_name)} (${esc(r.user_phone || '-')}) · แจ้งเมื่อ ${fmtTime(r.created_at)}</div>
      ${scheduleInfo(r)}
      ${next ? `<div class="req-actions">${next}</div>` : ''}
    </div>
  </div>`;
}

$('#staff-list').addEventListener('click', async (e) => {
  const { status, rid } = e.target.dataset;
  if (!status) return;
  try {
    await api(`/requests/${rid}/status`, { method: 'PUT', body: { status } });
    await refresh();
  } catch (err) {
    toast(err.message, true);
  }
});

$$('[data-staff-filter]').forEach((b) =>
  b.addEventListener('click', () => {
    $$('[data-staff-filter]').forEach((x) => x.classList.toggle('active', x === b));
    state.staffFilter = b.dataset.staffFilter;
    delete $('#staff-list').dataset.ready; // เปลี่ยนตัวกรอง ไม่ต้องไฮไลต์
    refresh();
  })
);

// ============================================================
// หน้าผู้ดูแลหอพัก
// ============================================================
async function initAdmin() {
  state.staff = await api('/staff');
  renderTypeList();
  renderStaffManageList();
}

// ช่องช่างในตารางแอดมิน: ระบบจัดให้แล้ว → แสดงชื่อ + ปุ่มเปลี่ยนช่าง (กรณีพิเศษ)
//                        ระบบหาช่างว่างไม่ได้ → ให้แอดมินเลือกเอง
function staffCell(r, options) {
  const select = (hidden) =>
    `<select data-assign="${r.id}" class="${hidden ? 'hidden' : ''}"><option value="">— เลือกช่าง —</option>${options}</select>`;
  if (!r.assigned_staff_id) {
    return `<span class="need-assign">⏳ ต้องจัดช่างเอง</span>${select(false)}`;
  }
  return `<b>${esc(r.staff_name)}</b>
    <div class="req-meta">${r.auto_assigned ? '🤖 ระบบจัดให้' : '👤 แอดมินเลือก'}</div>
    <button class="link-btn" data-change-staff="${r.id}">เปลี่ยนช่าง</button>${select(true)}`;
}

function renderAdminRow(r) {
  const closed = ['done', 'cancelled'].includes(r.status);
  const options = state.staff
    .map((s) => `<option value="${s.id}" ${s.id === r.assigned_staff_id ? 'selected' : ''}>${esc(s.name)}</option>`)
    .join('');
  return `
  <tr>
    <td>${r.id}</td>
    <td>${esc(r.building)}-${esc(r.room_number)}<div class="req-meta">${esc(r.user_name)}</div></td>
    <td>${esc(r.repair_type)}</td>
    <td class="desc">${esc(r.description)}
      ${r.image_url ? ` <a href="${esc(r.image_url)}" target="_blank">📷</a>` : ''}
      <div class="req-meta">${fmtTime(r.created_at)}</div>${scheduleInfo(r)}</td>
    <td>${statusBadge(r.status)}</td>
    <td>${closed ? esc(r.staff_name || '-') : staffCell(r, options)}</td>
    <td>${closed ? '' : `<button class="btn danger small" data-admin-cancel="${r.id}">ยกเลิก</button>`}</td>
  </tr>`;
}

$('#admin-list').addEventListener('change', async (e) => {
  const id = e.target.dataset.assign;
  if (!id || !e.target.value) return;
  try {
    const r = await api(`/requests/${id}/assign`, { method: 'PUT', body: { staff_id: Number(e.target.value) } });
    toast(`มอบหมายคำขอ #${id} ให้ ${r.staff_name} แล้ว`);
    await refresh();
  } catch (err) {
    toast(err.message, true);
  }
});

$('#admin-list').addEventListener('click', async (e) => {
  const changeId = e.target.dataset.changeStaff;
  if (changeId) {
    e.target.classList.add('hidden');
    $(`[data-assign="${changeId}"]`).classList.remove('hidden');
    return;
  }
  const id = e.target.dataset.adminCancel;
  if (!id || !confirm(`ยืนยันยกเลิกคำขอ #${id}?`)) return;
  try {
    await api(`/requests/${id}`, { method: 'DELETE' });
    await refresh();
  } catch (err) {
    toast(err.message, true);
  }
});

$$('[data-admin-filter]').forEach((b) =>
  b.addEventListener('click', () => {
    $$('[data-admin-filter]').forEach((x) => x.classList.toggle('active', x === b));
    state.adminFilter = b.dataset.adminFilter;
    delete $('#admin-list').dataset.ready;
    refresh();
  })
);

$$('[data-admin-tab]').forEach((tab) =>
  tab.addEventListener('click', () => {
    $$('[data-admin-tab]').forEach((t) => t.classList.toggle('active', t === tab));
    $$('[data-admin-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.adminPanel !== tab.dataset.adminTab));
  })
);

// --- Dashboard: KPI + กราฟแท่ง (วาดด้วย CSS ไม่ใช้ library) ---
function renderBars(el, rows) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  el.innerHTML = rows
    .map((r) => `
      <div class="bar-row">
        <span>${esc(r.label)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(r.count / max) * 100}%;${r.color ? `background:${r.color}` : ''}"></div></div>
        <b>${r.count}</b>
      </div>`)
    .join('');
}

async function refreshStats() {
  const s = await api('/stats');
  $('#kpi-total').textContent = s.total;
  $('#kpi-resolve').textContent = s.kpi.avgResolveHours == null ? '–' : `${s.kpi.avgResolveHours} ชม.`;

  const pct = s.kpi.autoAssignedPct;
  $('#kpi-assign').textContent = pct == null ? '–' : `${pct}%`;
  $('#kpi-assign').className = 'kpi-value ' + (pct == null ? '' : pct >= 90 ? 'good' : 'bad');

  const ms = s.kpi.avgApiMs;
  $('#kpi-api').textContent = ms == null ? '–' : `${ms} ms`;
  $('#kpi-api').className = 'kpi-value ' + (ms == null ? '' : ms < 500 ? 'good' : 'bad');

  const colors = { pending: 'var(--pending)', in_progress: 'var(--progress)', done: 'var(--done)', cancelled: 'var(--cancelled)' };
  renderBars($('#chart-status'), Object.keys(STATUS_TEXT).map((k) => ({
    label: STATUS_TEXT[k],
    count: s.byStatus.find((x) => x.status === k)?.count || 0,
    color: colors[k],
  })));
  renderBars($('#chart-type'), s.byType.map((t) => ({ label: t.name, count: t.count })));
}

// --- CRUD ประเภทงานซ่อม ---
function renderTypeList() {
  $('#type-list').innerHTML = state.repairTypes
    .map((t) => `
      <li>
        <input class="grow" value="${esc(t.name)}" data-type-name="${t.id}">
        <span class="muted">${t.request_count} คำขอ</span>
        <button class="btn small" data-type-save="${t.id}">บันทึก</button>
        <button class="btn danger small" data-type-del="${t.id}">ลบ</button>
      </li>`)
    .join('');
}

async function reloadTypes() {
  state.repairTypes = await api('/repair-types');
  renderTypeList();
}

$('#form-type').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/repair-types', { method: 'POST', body: { name: e.target.name.value } });
    e.target.reset();
    await reloadTypes();
  } catch (err) {
    toast(err.message, true);
  }
});

$('#type-list').addEventListener('click', async (e) => {
  const { typeSave, typeDel } = e.target.dataset;
  try {
    if (typeSave) {
      const name = $(`[data-type-name="${typeSave}"]`).value;
      await api(`/repair-types/${typeSave}`, { method: 'PUT', body: { name } });
      toast('บันทึกแล้ว');
    }
    if (typeDel && confirm('ยืนยันลบประเภทนี้?')) {
      await api(`/repair-types/${typeDel}`, { method: 'DELETE' });
    }
    if (typeSave || typeDel) await reloadTypes();
  } catch (err) {
    toast(err.message, true);
  }
});

// --- CRUD ช่างซ่อม ---
function renderStaffManageList() {
  $('#staff-manage-list').innerHTML = state.staff
    .map((s) => `
      <li>
        <input class="grow" value="${esc(s.name)}" data-staff-name="${s.id}">
        <input class="grow" value="${esc(s.phone || '')}" placeholder="เบอร์โทร" data-staff-phone="${s.id}">
        <span class="hours">🕘 <input type="time" value="${esc(s.work_start || '')}" data-staff-start="${s.id}">
          – <input type="time" value="${esc(s.work_end || '')}" data-staff-end="${s.id}"></span>
        <span class="muted">${esc(s.email)} · ค้าง ${s.active_jobs || 0} · เสร็จ ${s.done_jobs || 0}</span>
        <button class="btn small" data-staff-save="${s.id}">บันทึก</button>
        <button class="btn danger small" data-staff-del="${s.id}">ลบ</button>
      </li>`)
    .join('');
}

async function reloadStaff() {
  state.staff = await api('/staff');
  renderStaffManageList();
  // dropdown มอบหมายช่างในตารางต้องวาดใหม่ทั้งหมด เพราะรายชื่อช่างเปลี่ยน
  $('#admin-list').innerHTML = '';
  await refresh();
}

$('#form-staff').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/staff', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
    e.target.reset();
    toast('เพิ่มช่างแล้ว');
    await reloadStaff();
  } catch (err) {
    toast(err.message, true);
  }
});

$('#staff-manage-list').addEventListener('click', async (e) => {
  const { staffSave, staffDel } = e.target.dataset;
  try {
    if (staffSave) {
      await api(`/staff/${staffSave}`, {
        method: 'PUT',
        body: {
          name: $(`[data-staff-name="${staffSave}"]`).value,
          phone: $(`[data-staff-phone="${staffSave}"]`).value,
          work_start: $(`[data-staff-start="${staffSave}"]`).value,
          work_end: $(`[data-staff-end="${staffSave}"]`).value,
        },
      });
      toast('บันทึกแล้ว');
    }
    if (staffDel && confirm('ยืนยันลบช่างคนนี้? งานที่ค้างจะกลับเป็น "ยังไม่มอบหมาย"')) {
      await api(`/staff/${staffDel}`, { method: 'DELETE' });
    }
    if (staffSave || staffDel) await reloadStaff();
  } catch (err) {
    toast(err.message, true);
  }
});

// ============================================================
// 4) Polling — ดึงข้อมูลใหม่เป็นระยะ แล้ว Partial Render
// ============================================================
async function refresh() {
  if (!state.me) return;
  const role = state.me.role;
  const filter = role === 'staff' ? state.staffFilter : role === 'admin' ? state.adminFilter : '';
  const items = await api('/requests' + (filter ? `?status=${filter}` : ''));
  if (!filter) notifyChanges(items);

  if (role === 'student') {
    syncList($('#student-list'), items, renderStudentCard);
    $('#student-count').textContent = `(${items.length})`;
  } else if (role === 'staff') {
    syncList($('#staff-list'), items, renderStaffCard);
    $('#staff-count').textContent = `(${items.length})`;
  } else {
    syncList($('#admin-list'), items, renderAdminRow);
    await refreshStats();
  }

  const live = $('#live');
  live.classList.remove('tick');
  void live.offsetWidth; // restart animation
  live.classList.add('tick');
  live.title = 'อัปเดตล่าสุด ' + new Date().toLocaleTimeString('th-TH');
}

function startPolling() {
  clearInterval(state.pollTimer);
  refresh().catch((err) => toast(err.message, true));
  state.pollTimer = setInterval(() => {
    if (!document.hidden) refresh().catch(() => {}); // แท็บไม่ได้เปิดดูอยู่ → ไม่ต้องดึง
  }, POLL_MS);
}

boot();
