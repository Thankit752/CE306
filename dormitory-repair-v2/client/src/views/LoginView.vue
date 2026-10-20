<!-- หน้าเข้าสู่ระบบ / สมัครสมาชิก (นักศึกษา) -->
<script setup>
import { ref, reactive } from 'vue';
import { api, setToken } from '../api';

const tab = ref('login');
const error = ref('');
const login = reactive({ email: '', password: '' });
const reg = reactive({ name: '', student_id: '', email: '', phone: '', building: '', room_number: '', password: '' });

// บัญชีทดลอง (ข้อมูลเดียวกับ seed ใน server/db.js)
const DEMO = {
  student: ['student@dorm.test', 'student123', '🎓 นักศึกษา'],
  staff: ['staff1@dorm.test', 'staff123', '🔧 ช่าง'],
  admin: ['admin@dorm.test', 'admin123', '🗂️ แอดมิน'],
};
function fillDemo(role) {
  [login.email, login.password] = DEMO[role];
}

async function submit(path, body) {
  error.value = '';
  try {
    const { token } = await api(path, { method: 'POST', body });
    setToken(token);
  } catch (err) {
    error.value = err.message;
  }
}
</script>

<template>
  <div class="auth-card card">
    <h1>จองคิวช่างซ่อม<br>ได้ในไม่กี่คลิก</h1>
    <div class="tabs">
      <button class="tab" :class="{ active: tab === 'login' }" @click="tab = 'login'">เข้าสู่ระบบ</button>
      <button class="tab" :class="{ active: tab === 'register' }" @click="tab = 'register'">สมัครสมาชิก (นักศึกษา)</button>
    </div>

    <form v-if="tab === 'login'" class="form" @submit.prevent="submit('/auth/login', login)">
      <label>อีเมล <input v-model="login.email" type="email" required autocomplete="username"></label>
      <label>รหัสผ่าน <input v-model="login.password" type="password" required autocomplete="current-password"></label>
      <button class="btn primary">เข้าสู่ระบบ</button>
      <div class="demo">
        <span>บัญชีทดลอง:</span>
        <button v-for="(d, role) in DEMO" :key="role" type="button" class="chip" @click="fillDemo(role)">{{ d[2] }}</button>
      </div>
    </form>

    <form v-else class="form" @submit.prevent="submit('/auth/register', reg)">
      <div class="row2">
        <label>ชื่อ-นามสกุล <input v-model="reg.name" required></label>
        <label>รหัสนักศึกษา <input v-model="reg.student_id" required></label>
      </div>
      <div class="row2">
        <label>อีเมล <input v-model="reg.email" type="email" required></label>
        <label>เบอร์โทร <input v-model="reg.phone"></label>
      </div>
      <div class="row2">
        <label>อาคาร <input v-model="reg.building" required placeholder="เช่น A"></label>
        <label>เลขห้อง <input v-model="reg.room_number" required placeholder="เช่น 205"></label>
      </div>
      <label>รหัสผ่าน (อย่างน้อย 6 ตัว) <input v-model="reg.password" type="password" minlength="6" required></label>
      <button class="btn primary">สมัครสมาชิก</button>
    </form>
    <p class="error">{{ error }}</p>
  </div>
</template>
