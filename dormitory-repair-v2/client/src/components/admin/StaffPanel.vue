<!-- ============================================================
  จัดการช่าง (แอดมิน): เพิ่ม/แก้/ลบ + ตั้ง "เวลาเข้า-เลิกงาน" และ "งานสูงสุดต่อวัน"
============================================================= -->
<script setup>
import { ref, reactive } from 'vue';
import { api } from '../../api';
import { attempt } from '../../util';

const emit = defineEmits(['changed']);

const staff = ref([]); // สำเนาของ panel นี้เอง แก้ในช่อง input ได้ก่อนกดบันทึก
const load = async () => { staff.value = await api('/staff'); };
load();

const blank = () => ({ name: '', email: '', phone: '', password: '', work_start: '08:00', work_end: '17:00', max_jobs_per_day: 3 });
const form = reactive(blank());

async function done(ok) {
  if (ok) await load();
  emit('changed');
  return ok;
}
async function add() {
  if (await done(await attempt(api('/staff', { method: 'POST', body: { ...form } }), 'เพิ่มช่างแล้ว'))) {
    Object.assign(form, blank());
  }
}
const save = async (s) => done(await attempt(api(`/staff/${s.id}`, { method: 'PUT', body: s }), `บันทึก ${s.name} แล้ว`));
async function remove(s) {
  if (confirm(`ลบ ${s.name}?`)) await done(await attempt(api(`/staff/${s.id}`, { method: 'DELETE' }), `ลบ ${s.name} แล้ว`));
}
</script>

<template>
  <form class="inline-form" @submit.prevent="add">
    <input v-model="form.name" placeholder="ชื่อช่าง" required>
    <input v-model="form.email" type="email" placeholder="อีเมล" required>
    <input v-model="form.phone" placeholder="เบอร์โทร">
    <input v-model="form.password" type="password" placeholder="รหัสผ่าน (6 ตัวขึ้นไป)" minlength="6" required>
    <span class="hours">🕘 <input v-model="form.work_start" type="time" required> – <input v-model="form.work_end" type="time" required></span>
    <span class="hours">งาน/วัน <input v-model.number="form.max_jobs_per_day" type="number" min="1" max="8" style="width:64px"></span>
    <button class="btn primary">เพิ่มช่าง</button>
  </form>
  <ul class="simple-list">
    <li v-for="s in staff" :key="s.id">
      <input v-model="s.name" class="grow">
      <input v-model="s.phone" class="grow" placeholder="เบอร์โทร">
      <span class="hours">🕘 <input v-model="s.work_start" type="time"> – <input v-model="s.work_end" type="time"></span>
      <span class="hours">งาน/วัน <input v-model.number="s.max_jobs_per_day" type="number" min="1" max="8" style="width:64px"></span>
      <span class="muted">คิวค้าง {{ s.active_jobs || 0 }} · เสร็จ {{ s.done_jobs || 0 }}</span>
      <button class="btn small" @click="save(s)">บันทึก</button>
      <button class="btn danger small" @click="remove(s)">ลบ</button>
    </li>
  </ul>
  <p class="muted">ปรับเวลางาน/งานต่อวันแล้ว มีผลกับการจองใหม่ — คิวที่จองไปแล้วไม่ถูกเลื่อน (มาก่อนได้ก่อน)</p>
</template>
