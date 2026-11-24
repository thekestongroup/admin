import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import pkg from './package.json' with { type: 'json' }

// What the footer shows: the version from package.json, and the build (the commit, from CI, or the
// APP_BUILD build argument in Docker). Empty on a local run.
const build = (process.env.APP_BUILD ?? process.env.GITHUB_SHA ?? '').slice(0, 7)

// Dev server: http://admin.keston.localhost:5181, with /api passed straight
// to Keston ID's /v1 (Docker: http://keston-id:8080). The built app has its own
// API in front of Keston ID instead (api/), which this skips.
//
// In Docker (compose.dev.yaml) it runs behind Keston ID's Caddy, so:
// - KESTON_DEV_HOST=0.0.0.0 listens for Caddy, on port 8080;
// - KESTON_HMR_PORT=80 tells the browser where to reach live updates;
// - KESTON_UI_SRC points at the Keston UI checkout's src folder, so edits to
//   Keston UI show up live too, without building or releasing it.
const uiSrc = process.env.KESTON_UI_SRC

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(build),
  },
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
        target: process.env.KESTON_ID_URL ?? 'http://keston-id:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/v1'),
      },
    },
  },
})
