<!-- ============================================================
  StaffView.vue — ช่าง: คิวงานของตัวเองเรียงตามวัน + บอกว่าวันนั้นรับไปกี่งานจากโควตา
============================================================= -->
<script setup>
import { ref, computed } from 'vue';
import { api } from '../api';
import { attempt, usePolling, useStatusWatcher, isOpen, fmtDay, today } from '../util';
import RequestCard from '../components/RequestCard.vue';

const props = defineProps({ me: { type: Object, required: true } });

const requests = ref([]);
const showDone = ref(false);
const watchStatus = useStatusWatcher();

const refresh = usePolling(async () => {
  requests.value = await api('/requests');
  watchStatus(requests.value);
});

// จัดกลุ่มตามวัน เรียงวันที่ใกล้สุดก่อน และในวันเรียงตามช่องเวลา
const groups = computed(() => {
  const active = requests.value.filter((r) => showDone.value || isOpen(r));
  const byDate = new Map();
  for (const r of [...active].sort((a, b) => (a.slot_date + a.slot_start).localeCompare(b.slot_date + b.slot_start))) {
    if (!byDate.has(r.slot_date)) byDate.set(r.slot_date, []);
    byDate.get(r.slot_date).push(r);
  }
  // โควตาต่อวันนับทุกงานที่ไม่ถูกยกเลิก (ตรงกับฝั่ง server) ไม่ขึ้นกับตัวกรองที่เลือก
  const bookedOn = (date) => requests.value.filter((r) => r.slot_date === date && r.status !== 'cancelled').length;
  return [...byDate].map(([date, items]) => ({ date, items, booked: bookedOn(date) }));
});

async function setStatus(r, status) {
  await attempt(api(`/requests/${r.id}/status`, { method: 'PUT', body: { status } }));
  refresh();
}
</script>

<template>
  <div class="card">
    <h2>🧰 คิวงานของฉัน</h2>
    <p class="muted">
      เวลางาน {{ props.me.work_start }}–{{ props.me.work_end }} น. · รับได้สูงสุด {{ props.me.max_jobs_per_day }} งาน/วัน
      — ระบบจัดคิวให้อัตโนมัติ ไม่มีคิวซ้อนและไม่มีใครแซงคิว
    </p>
    <div class="filters">
      <button class="chip" :class="{ active: !showDone }" @click="showDone = false">คิวที่ต้องทำ</button>
      <button class="chip" :class="{ active: showDone }" @click="showDone = true">ทั้งหมด (รวมที่ปิดแล้ว)</button>
    </div>

    <section v-for="g in groups" :key="g.date" class="queue-day">
      <h3>
        <span>{{ g.date === today() ? 'วันนี้ · ' : '' }}{{ fmtDay(g.date, { weekday: 'long', day: 'numeric', month: 'long' }) }}</span>
        <span class="cap" :class="{ full: g.booked >= props.me.max_jobs_per_day }">{{ g.booked }}/{{ props.me.max_jobs_per_day }} งาน</span>
      </h3>
      <TransitionGroup name="list" tag="div" class="req-list">
        <RequestCard v-for="r in g.items" :key="r.id" :r="r" show-requester>
          <button v-if="r.status === 'pending'" class="btn primary small" @click="setStatus(r, 'in_progress')">▶ เริ่มซ่อม</button>
          <button v-if="r.status === 'in_progress'" class="btn success small" @click="setStatus(r, 'done')">✔ ซ่อมเสร็จแล้ว</button>
        </RequestCard>
      </TransitionGroup>
    </section>
    <p v-if="!groups.length" class="muted">ยังไม่มีคิวงาน</p>
  </div>
</template>
