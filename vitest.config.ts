import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // Component tests (.tsx) run in jsdom; pure logic tests stay in node.
    environmentMatchGlobs: [['src/**/*.test.tsx', 'jsdom']],
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    // Required for @testing-library/react's automatic per-test DOM cleanup.
    globals: true,
  },
  // Vite define shim so import.meta.env works identically in tests.
  define: {
    'import.meta.env.DEV': JSON.stringify(true),
  },
});
