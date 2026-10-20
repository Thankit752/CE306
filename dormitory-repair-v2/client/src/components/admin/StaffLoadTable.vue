<!-- ภาระงานช่าง 7 วันข้างหน้า: งานที่จอง / งานที่รับได้ต่อวัน (แดง = เต็ม) -->
<script setup>
import { fmtDay } from '../../util';

defineProps({ load: { type: Object, required: true } }); // { dates, staff: [{ id, name, capacity, days }] }
</script>

<template>
  <div class="card">
    <h2>👷 ภาระงานช่าง 7 วันข้างหน้า <span class="count">(งานที่จอง / งานที่รับได้ต่อวัน)</span></h2>
    <div class="table-wrap">
      <table class="load-table">
        <tr>
          <th>ช่าง</th>
          <th v-for="d in load.dates" :key="d">{{ fmtDay(d) }}</th>
        </tr>
        <tr v-for="s in load.staff" :key="s.id">
          <td>{{ s.name }}</td>
          <td v-for="(n, i) in s.days" :key="load.dates[i]">
            <span class="load-cell" :class="{ full: n >= s.capacity, zero: n === 0 }">{{ n }}/{{ s.capacity }}</span>
          </td>
        </tr>
      </table>
    </div>
  </div>
</template>
