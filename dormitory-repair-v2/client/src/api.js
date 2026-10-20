// ============================================================
// api.js — เรียก REST API + แนบ JWT ทุกครั้ง, เก็บ token ใน localStorage
// ============================================================
import { ref } from 'vue';

export const token = ref(localStorage.getItem('token'));

export function setToken(value) {
  token.value = value;
  if (value) localStorage.setItem('token', value);
  else localStorage.removeItem('token');
}

/**
 * @param {string} path  เช่น '/requests'
 * @param {{ method?: string, body?: object, form?: FormData }} opts
 */
export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (token.value) headers.Authorization = `Bearer ${token.value}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`/api${path}`, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  if (res.status === 401 && token.value) {
    setToken(null); // token หมดอายุ → App.vue จะพากลับหน้าล็อกอินเอง
    throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  }
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data;
}
