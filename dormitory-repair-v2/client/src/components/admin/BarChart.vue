<!-- กราฟแท่งแนวนอนแบบง่าย (CSS ล้วน ไม่ใช้ library)
     bars: [{ label, count, cls? }] — cls = คลาสสถานะ (pending/done/…) เพื่อใช้สีเดียวกับป้ายสถานะ -->
<script setup>
import { computed } from 'vue';

const props = defineProps({
  title: { type: String, required: true },
  bars: { type: Array, required: true },
});
const max = computed(() => Math.max(1, ...props.bars.map((b) => b.count)));
</script>

<template>
  <div class="card">
    <h3>{{ title }}</h3>
    <div class="bars">
      <div v-for="b in bars" :key="b.label" class="bar-row">
        <span>{{ b.label }}</span>
        <div class="bar-track"><div class="bar-fill" :class="b.cls" :style="{ width: (b.count / max) * 100 + '%' }"></div></div>
        <b>{{ b.count }}</b>
      </div>
    </div>
  </div>
</template>
