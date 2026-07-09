import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// PlayerTicker — static SPA (no server needed for the Demo Market).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
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
