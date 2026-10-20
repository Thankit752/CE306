<!-- ============================================================
  StudentView.vue — นักศึกษา: เลือกช่องเวลาที่ว่าง → แจ้งซ่อม → ติดตามสถานะ
============================================================= -->
<script setup>
import { ref, reactive, computed } from 'vue';
import { api } from '../api';
import { toast, attempt, usePolling, useStatusWatcher, fmtDay } from '../util';
import SlotPicker from '../components/SlotPicker.vue';
import RequestCard from '../components/RequestCard.vue';

const props = defineProps({ me: { type: Object, required: true } });

const types = ref([]);
const days = ref([]);
const requests = ref([]);
const picked = ref(null);
const form = reactive({ repair_type_id: '', description: '' });
const image = ref(null);
const preview = ref('');
const sending = ref(false);
const watchStatus = useStatusWatcher({ announceNew: false }); // คิวใหม่ของตัวเองมี toast ตอนจองอยู่แล้ว

api('/repair-types').then((t) => (types.value = t));

const refresh = usePolling(async () => {
  const [slots, list] = await Promise.all([api('/slots'), api('/requests')]);
  days.value = slots;
  requests.value = list; // Vue เทียบ :key แล้วอัปเดตเฉพาะการ์ดที่เปลี่ยน (Partial Render)
  watchStatus(list);

  // ช่องที่เลือกไว้ถูกคนอื่นจองจนเต็มระหว่างนี้ → ล้างการเลือก
  if (picked.value) {
    const slot = slots.find((d) => d.date === picked.value.date)?.slots.find((s) => s.start === picked.value.start);
    if (!slot || !slot.free || slot.past) {
      toast('ช่องที่คุณเลือกเพิ่งเต็ม กรุณาเลือกช่องใหม่', true);
      picked.value = null;
    }
  }
});

const pickedText = computed(() =>
  picked.value ? `${fmtDay(picked.value.date, { weekday: 'long', day: 'numeric', month: 'long' })} ${picked.value.start}–${picked.value.end} น.` : '');

function onImage(e) {
  image.value = e.target.files[0] || null;
  preview.value = image.value ? URL.createObjectURL(image.value) : '';
}

async function submit(e) {
  if (!picked.value) return toast('กรุณาเลือกช่องเวลาที่ว่างก่อน', true);
  const fd = new FormData();
  fd.append('repair_type_id', form.repair_type_id);
  fd.append('description', form.description);
  fd.append('slot_date', picked.value.date);
  fd.append('slot_start', picked.value.start);
  if (image.value) fd.append('image', image.value);

  sending.value = true;
  try {
    const r = await api('/requests', { method: 'POST', form: fd });
    toast(`จองคิว #${r.id} แล้ว · ${r.staff_name} จะเข้าซ่อม ${pickedText.value}`);
    Object.assign(form, { repair_type_id: '', description: '' });
    picked.value = null;
    image.value = null;
    preview.value = '';
    e.target.reset();
  } catch (err) {
    toast(err.message, true); // เช่น 409 ช่องเพิ่งเต็ม
    picked.value = null;
  } finally {
    sending.value = false;
    refresh();
  }
}

async function cancel(r) {
  if (!confirm(`ยืนยันยกเลิกคิว #${r.id}? ช่องเวลานี้จะว่างให้คนอื่นจองทันที`)) return;
  await attempt(api(`/requests/${r.id}`, { method: 'DELETE' }), `ยกเลิกคิว #${r.id} แล้ว`);
  refresh();
}
</script>

<template>
  <div class="grid-2">
    <div class="card">
      <h2>📝 แจ้งซ่อม + จองคิวช่าง</h2>
      <p class="muted">ห้อง {{ props.me.building }}-{{ props.me.room_number }} · รหัส {{ props.me.student_id }}</p>
      <form class="form" @submit.prevent="submit">
        <label>ประเภทงานซ่อม
          <select v-model="form.repair_type_id" required>
            <option value="">— เลือกประเภท —</option>
            <option v-for="t in types" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </label>
        <label>รายละเอียดปัญหา
          <textarea v-model="form.description" rows="3" required placeholder="อธิบายอาการ เช่น ก๊อกน้ำรั่วตลอดเวลา"></textarea>
        </label>

        <div class="field">
          <span class="field-label">เลือกช่องเวลาที่สะดวกให้ช่างเข้า (กดช่องสีเขียว)</span>
          <SlotPicker v-if="days.length" v-model="picked" :days="days" />
          <p class="avail-summary" :class="picked ? 'appt' : 'muted'">
            {{ picked ? `✔ เลือกแล้ว: ${pickedText}` : 'ยังไม่ได้เลือกช่องเวลา' }}
          </p>
        </div>

        <label>แนบรูป (ไม่เกิน 5MB)
          <input type="file" accept="image/*" @change="onImage">
        </label>
        <img v-if="preview" :src="preview" class="preview" alt="ตัวอย่างรูป">
        <button class="btn primary" :disabled="sending">{{ sending ? 'กำลังจอง…' : 'จองคิวและแจ้งซ่อม' }}</button>
      </form>
    </div>

    <div class="card">
      <h2>📋 คิวของฉัน <span class="count">({{ requests.length }})</span></h2>
      <TransitionGroup name="list" tag="div" class="req-list">
        <RequestCard v-for="r in requests" :key="r.id" :r="r">
          <button v-if="r.status === 'pending'" class="btn danger small" @click="cancel(r)">ยกเลิกคิว</button>
        </RequestCard>
      </TransitionGroup>
      <p v-if="!requests.length" class="muted">ยังไม่มีคิวแจ้งซ่อม</p>
    </div>
  </div>
</template>
