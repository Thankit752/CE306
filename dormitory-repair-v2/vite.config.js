import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// ตอน dev: Vite เสิร์ฟหน้าเว็บที่ :5173 และส่งต่อ /api, /uploads ไปที่ Express (:3000)
// ตอน build: ได้ไฟล์ใน client/dist ให้ Express เสิร์ฟเองที่ :3000
export default defineConfig({
  root: 'client',
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
