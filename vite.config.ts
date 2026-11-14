import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Dev server: http://admin.keston.localhost:5181, with /api passed to
// Keston ID's admin API (Docker: http://id.keston.localhost).
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5181,
    host: 'admin.keston.localhost',
    proxy: {
      '/api': {
        target: process.env.KESTON_ID_URL ?? 'http://id.keston.localhost',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/admin/v1'),
      },
    },
  },
})
