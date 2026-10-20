<!-- การ์ดคำขอ 1 ใบ ใช้ร่วมกันทั้งหน้านักศึกษาและหน้าช่าง (ปุ่มต่าง ๆ ส่งผ่าน slot) -->
<script setup>
import { STATUS_TEXT, fmtSlot, fmtTime } from '../util';

defineProps({
  r: { type: Object, required: true },
  showRequester: { type: Boolean, default: false }, // หน้าช่าง: แสดงห้อง + ผู้แจ้ง
});
const STEP = { pending: 1, in_progress: 2, done: 3, cancelled: 0 };
</script>

<template>
  <div class="req">
    <a v-if="r.image_url" :href="r.image_url" target="_blank"><img :src="r.image_url" alt=""></a>
    <div class="req-body">
      <div class="req-head">
        <span class="req-title">
          #{{ r.id }} · <template v-if="showRequester">ห้อง {{ r.building }}-{{ r.room_number }} · </template>{{ r.repair_type }}
        </span>
        <span class="status" :class="r.status">{{ STATUS_TEXT[r.status] }}</span>
      </div>
      <p class="req-desc">{{ r.description }}</p>
      <div class="req-meta appt">📅 {{ fmtSlot(r) }}<template v-if="!showRequester"> · {{ r.staff_name || 'ยังไม่มีช่าง' }}</template></div>
      <div class="req-meta">
        <template v-if="showRequester">ผู้แจ้ง: {{ r.user_name }} ({{ r.user_phone || '-' }}) · </template>
        จองเมื่อ {{ fmtTime(r.created_at) }}
      </div>
      <div v-if="!showRequester" class="steps">
        <span v-for="i in 3" :key="i" :class="{ on: i <= STEP[r.status] }"></span>
      </div>
      <div class="req-actions"><slot /></div>
    </div>
  </div>
</template>
