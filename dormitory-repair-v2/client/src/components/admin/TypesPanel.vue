<!-- จัดการประเภทงานซ่อม (แอดมิน): เพิ่ม/แก้ชื่อ/ลบ (ลบไม่ได้ถ้ามีคำขอใช้อยู่) -->
<script setup>
import { ref } from 'vue';
import { api } from '../../api';
import { attempt } from '../../util';

const types = ref([]);
const load = async () => { types.value = await api('/repair-types'); };
load();

const newName = ref('');
async function add() {
  if (await attempt(api('/repair-types', { method: 'POST', body: { name: newName.value } }), 'เพิ่มประเภทแล้ว')) {
    newName.value = '';
    load();
  }
}
const save = async (t) => (await attempt(api(`/repair-types/${t.id}`, { method: 'PUT', body: { name: t.name } }), 'บันทึกแล้ว')) && load();
async function remove(t) {
  if (confirm(`ลบประเภท "${t.name}"?`) && await attempt(api(`/repair-types/${t.id}`, { method: 'DELETE' }))) load();
}
</script>

<template>
  <form class="inline-form" @submit.prevent="add">
    <input v-model="newName" placeholder="ชื่อประเภทงานซ่อมใหม่" required>
    <button class="btn primary">เพิ่ม</button>
  </form>
  <ul class="simple-list">
    <li v-for="t in types" :key="t.id">
      <input v-model="t.name" class="grow">
      <span class="muted">{{ t.request_count }} คำขอ</span>
      <button class="btn small" @click="save(t)">บันทึก</button>
      <button class="btn danger small" @click="remove(t)">ลบ</button>
    </li>
  </ul>
</template>
