<!-- ============================================================
  SlotPicker.vue — ตารางจองคิว 7 วัน × 4 ช่อง (ช่องละ 2 ชม.)
  เขียว = ว่าง (บอกจำนวนช่างที่ว่าง) · เทา = เต็ม/เลยเวลา (กดไม่ได้)
  ใช้แบบ v-model: <SlotPicker v-model="picked" :days="days" />
============================================================= -->
<script setup>
import { computed } from 'vue';
import { fmtDay } from '../util';

const props = defineProps({ days: { type: Array, required: true } });
const picked = defineModel({ type: Object, default: null }); // { date, start, end }

// จัดข้อมูลเป็นแถว (ช่องเวลา) × คอลัมน์ (วัน) ครั้งเดียว template จะได้อ่านง่าย
const rows = computed(() =>
  (props.days[0]?.slots || []).map((s, i) => ({
    start: s.start,
    end: s.end,
    cells: props.days.map((d) => {
      const slot = d.slots[i];
      return {
        date: d.date,
        ...slot,
        blocked: slot.past || slot.free === 0,
        label: slot.past ? 'เลยเวลา' : slot.free === 0 ? 'เต็ม' : `ว่าง ${slot.free}`,
      };
    }),
  })));

const isPicked = (c) => picked.value?.date === c.date && picked.value?.start === c.start;
const pick = (c) => { if (!c.blocked) picked.value = { date: c.date, start: c.start, end: c.end }; };
const dayName = (date, i) => (i === 0 ? 'วันนี้' : i === 1 ? 'พรุ่งนี้' : fmtDay(date, { weekday: 'short' }));
</script>

<template>
  <div class="slot-grid">
    <div></div>
    <div v-for="(d, i) in days" :key="d.date" class="head">
      <b>{{ dayName(d.date, i) }}</b>
      {{ fmtDay(d.date, { day: 'numeric', month: 'short' }) }}
    </div>

    <template v-for="r in rows" :key="r.start">
      <div class="time">{{ r.start }}–{{ r.end }}</div>
      <button
        v-for="c in r.cells"
        :key="c.date"
        type="button"
        class="slot"
        :class="{ full: c.blocked, picked: isPicked(c) }"
        :disabled="c.blocked"
        @click="pick(c)"
      >{{ c.label }}</button>
    </template>
  </div>
  <div class="slot-legend">
    <span><i class="legend-free"></i>ว่าง (ตัวเลข = ช่างที่ว่าง)</span>
    <span><i class="legend-full"></i>เต็ม / เลยเวลา</span>
    <span><i class="legend-picked"></i>ที่คุณเลือก</span>
  </div>
</template>
