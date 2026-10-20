<!-- ============================================================
  App.vue — โครงหลัก: เช็ก token → โหลดข้อมูลผู้ใช้ → สลับหน้าตาม role
============================================================= -->
<script setup>
import { ref, watch } from 'vue';
import { api, token, setToken } from './api';
import { toasts } from './util';
import LoginView from './views/LoginView.vue';
import StudentView from './views/StudentView.vue';
import StaffView from './views/StaffView.vue';
import AdminView from './views/AdminView.vue';

const me = ref(null);
const ROLE_TEXT = { student: 'นักศึกษา', staff: 'ช่างซ่อม', admin: 'ผู้ดูแลหอพัก' };
const VIEWS = { student: StudentView, staff: StaffView, admin: AdminView };

// token เปลี่ยน (ล็อกอิน/ออก/หมดอายุ) → โหลดข้อมูลผู้ใช้ใหม่
watch(token, async (t) => {
  me.value = null;
  if (!t) return;
  try {
    me.value = await api('/auth/me');
  } catch {
    setToken(null);
  }
}, { immediate: true });
</script>

<template>
  <header class="topbar">
    <div class="brand">🔧 <span>ระบบแจ้งซ่อมหอพัก</span></div>
    <div v-if="me" class="user-box">
      <span class="live" title="ดึงข้อมูลอัตโนมัติทุก 5 วินาที">● Live</span>
      <span>{{ me.name }}</span>
      <span class="role-badge">{{ ROLE_TEXT[me.role] }}</span>
      <button class="btn ghost small" @click="setToken(null)">ออกจากระบบ</button>
    </div>
  </header>

  <main>
    <LoginView v-if="!token" />
    <!-- :key ทำให้เปลี่ยนผู้ใช้แล้ว component ถูกสร้างใหม่ ไม่ค้างข้อมูลคนเก่า -->
    <component :is="VIEWS[me.role]" v-else-if="me" :key="me.id" :me="me" />
  </main>

  <div class="toasts">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="{ err: t.isError }">{{ t.text }}</div>
  </div>
</template>
