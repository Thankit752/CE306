<!-- ============================================================
  AdminView.vue — ผู้ดูแลหอพัก: ประกอบหน้าจาก component ย่อยใน components/admin/
    KPI → ภาระงานช่าง → กราฟ → แท็บ (คิว / ช่าง / ประเภทงาน)
============================================================= -->
<script setup>
import { ref, computed } from 'vue';
import { api } from '../api';
import { STATUS_TEXT, usePolling, useStatusWatcher } from '../util';
import BarChart from '../components/admin/BarChart.vue';
import StaffLoadTable from '../components/admin/StaffLoadTable.vue';
import RequestsTable from '../components/admin/RequestsTable.vue';
import StaffPanel from '../components/admin/StaffPanel.vue';
import TypesPanel from '../components/admin/TypesPanel.vue';

const stats = ref(null);
const requests = ref([]);
const staff = ref([]);
const tab = ref('requests');
const watchStatus = useStatusWatcher();

const refresh = usePolling(async () => {
  const [s, list, people] = await Promise.all([api('/stats'), api('/requests'), api('/staff')]);
  stats.value = s;
  requests.value = list;
  staff.value = people;
  watchStatus(list);
});

const kpi = computed(() => stats.value?.kpi || {});
const statusBars = computed(() => Object.keys(STATUS_TEXT).map((k) => ({
  label: STATUS_TEXT[k],
  count: stats.value?.byStatus.find((x) => x.status === k)?.count || 0,
  cls: k, // ใช้สีเดียวกับป้ายสถานะ
})));
const typeBars = computed(() => (stats.value?.byType || []).map((t) => ({ label: t.name, count: t.count })));
</script>

<template>
  <div class="kpis">
    <div class="kpi card"><div class="kpi-label">คำขอทั้งหมด</div><div class="kpi-value">{{ stats?.total ?? '–' }}</div></div>
    <div class="kpi card">
      <div class="kpi-label">เวลาเฉลี่ยจนซ่อมเสร็จ</div>
      <div class="kpi-value">{{ kpi.avgResolveHours != null ? `${kpi.avgResolveHours} ชม.` : '–' }}</div>
    </div>
    <div class="kpi card">
      <div class="kpi-label">อัตราใช้คิวช่าง 7 วัน <small>(เกิน 90% = ควรเพิ่มช่าง)</small></div>
      <div class="kpi-value" :class="kpi.utilizationPct > 90 ? 'bad' : 'good'">{{ kpi.utilizationPct != null ? `${kpi.utilizationPct}%` : '–' }}</div>
    </div>
    <div class="kpi card">
      <div class="kpi-label">API ตอบสนองเฉลี่ย <small>(เป้า &lt;500ms)</small></div>
      <div class="kpi-value" :class="kpi.avgApiMs < 500 ? 'good' : 'bad'">{{ kpi.avgApiMs != null ? `${kpi.avgApiMs} ms` : '–' }}</div>
    </div>
  </div>

  <StaffLoadTable v-if="stats" :load="stats.load" />

  <div class="grid-2">
    <BarChart title="สถานะคำขอ" :bars="statusBars" />
    <BarChart title="ประเภทปัญหา" :bars="typeBars" />
  </div>

  <div class="card">
    <div class="tabs">
      <button class="tab" :class="{ active: tab === 'requests' }" @click="tab = 'requests'">คิวแจ้งซ่อม</button>
      <button class="tab" :class="{ active: tab === 'staff' }" @click="tab = 'staff'">ช่างซ่อม</button>
      <button class="tab" :class="{ active: tab === 'types' }" @click="tab = 'types'">ประเภทงานซ่อม</button>
    </div>
    <RequestsTable v-if="tab === 'requests'" :requests="requests" :staff="staff" @changed="refresh" />
    <StaffPanel v-if="tab === 'staff'" @changed="refresh" />
    <TypesPanel v-if="tab === 'types'" />
  </div>
</template>
