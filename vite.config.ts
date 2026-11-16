import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Dev server: http://admin.keston.localhost:5181, with /api passed to
// Keston ID's admin API (Docker: http://id.keston.localhost).
//
// In Docker (compose.dev.yaml) it runs behind Keston ID's Caddy, so:
// - KESTON_DEV_HOST=0.0.0.0 listens for Caddy, on port 8080;
// - KESTON_HMR_PORT=80 tells the browser where to reach live updates;
// - KESTON_UI_SRC points at the Keston UI checkout's src folder, so edits to
//   Keston UI show up live too, without building or releasing it.
const uiSrc = process.env.KESTON_UI_SRC

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    // One copy of these, whichever package asks: two Vues, or two vue-i18ns,
    // can't talk to each other.
    dedupe: ['vue', 'vue-i18n'],
    alias: uiSrc
      ? [
          { find: /^@thekestongroup\/ui\/theme\.css$/, replacement: `${uiSrc}/styles/theme.css` },
          { find: /^@thekestongroup\/ui$/, replacement: `${uiSrc}/index.ts` },
        ]
      : [],
  },
  server: {
    port: Number(process.env.KESTON_DEV_PORT ?? 5181),
    host: process.env.KESTON_DEV_HOST ?? 'admin.keston.localhost',
    allowedHosts: ['admin.keston.localhost', 'admin'],
    hmr: process.env.KESTON_HMR_PORT ? { clientPort: Number(process.env.KESTON_HMR_PORT) } : undefined,
    // Docker for Mac doesn't always tell the container about file changes.
    watch: process.env.KESTON_DEV_POLL ? { usePolling: true, interval: 300 } : undefined,
    fs: { allow: ['.', ...(uiSrc ? [uiSrc.replace(/\/src$/, '')] : [])] },
    proxy: {
      '/api': {
        target: process.env.KESTON_ID_URL ?? 'http://id.keston.localhost',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/admin/v1'),
      },
    },
  },
})
