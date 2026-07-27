import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// PlayerTicker — static SPA. The Demo Market surfaces need no server; The Board reads the
// internal HTTP API (Phase 9) over HTTP only.
//
// DEV PROXY: by default the app calls `/api/...` on the dev server's own origin and this proxy
// forwards to the local API server. Same-origin from the browser's point of view, so no CORS
// is involved in the default local setup. Point it elsewhere with PLAYERTICKER_API_PROXY_TARGET,
// or bypass it entirely by setting VITE_PLAYERTICKER_API_URL to an absolute URL (which then
// does require the API server to allow this origin — see scripts/serve-api.ts).
const API_PROXY_TARGET = process.env.PLAYERTICKER_API_PROXY_TARGET ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: API_PROXY_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Keep the detail-chart dependency (recharts) off the critical path (§29.1, §30).
        manualChunks: {
          recharts: ['recharts'],
        },
      },
    },
  },
});
