<!-- ============================================================
  ตารางคิวทั้งหมด (แอดมิน): กรองสถานะ · ย้ายช่างในช่องเวลาเดิม · ยกเลิก
  ทำรายการเสร็จ → emit('changed') ให้หน้าแม่โหลดข้อมูลใหม่
============================================================= -->
<script setup>
import { ref, computed } from 'vue';
import { api } from '../../api';
import { STATUS_TEXT, attempt, isOpen, fmtSlot } from '../../util';

const props = defineProps({
  requests: { type: Array, required: true },
  staff: { type: Array, required: true },
});
const emit = defineEmits(['changed']);

const filter = ref('');
const shown = computed(() => props.requests.filter((r) => !filter.value || r.status === filter.value));

// ย้ายได้เฉพาะช่างที่ว่างในช่องเวลาเดิม — ถ้าไม่ว่าง server ตอบ 409 แล้วคืนค่า dropdown กลับเป็นช่างเดิม
async function reassign(r, event) {
  const ok = await attempt(
    api(`/requests/${r.id}/reassign`, { method: 'PUT', body: { staff_id: Number(event.target.value) } }),
    `ย้ายคิว #${r.id} แล้ว`,
  );
  if (!ok) event.target.value = r.assigned_staff_id;
  emit('changed');
}

async function cancel(r) {
  if (!confirm(`ยืนยันยกเลิกคิว #${r.id}?`)) return;
  await attempt(api(`/requests/${r.id}`, { method: 'DELETE' }), `ยกเลิกคิว #${r.id} แล้ว`);
  emit('changed');
}
</script>

<template>
  <div class="filters">
    <button class="chip" :class="{ active: !filter }" @click="filter = ''">ทั้งหมด</button>
    <button v-for="(text, k) in STATUS_TEXT" :key="k" class="chip" :class="{ active: filter === k }" @click="filter = k">{{ text }}</button>
  </div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr><th>#</th><th>คิว</th><th>ห้อง</th><th>รายละเอียด</th><th>สถานะ</th><th>ช่าง</th><th></th></tr>
      </thead>
      <TransitionGroup name="list" tag="tbody">
        <tr v-for="r in shown" :key="r.id">
          <td>{{ r.id }}</td>
          <td class="appt">{{ fmtSlot(r) }}</td>
          <td>{{ r.building }}-{{ r.room_number }}<div class="req-meta">{{ r.user_name }}</div></td>
          <td class="desc">{{ r.repair_type }} · {{ r.description }}
            <a v-if="r.image_url" :href="r.image_url" target="_blank">📷</a></td>
          <td><span class="status" :class="r.status">{{ STATUS_TEXT[r.status] }}</span></td>
          <td>
            <select v-if="isOpen(r)" :value="r.assigned_staff_id" title="ย้ายได้เฉพาะช่างที่ว่างในช่องเวลาเดิม"
                    @change="reassign(r, $event)">
              <option v-for="s in staff" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
            <template v-else>{{ r.staff_name || '-' }}</template>
          </td>
          <td><button v-if="isOpen(r)" class="btn danger small" @click="cancel(r)">ยกเลิก</button></td>
        </tr>
      </TransitionGroup>
    </table>
  </div>
  <p v-if="!shown.length" class="muted">ไม่มีคิวในหมวดนี้</p>
</template>
