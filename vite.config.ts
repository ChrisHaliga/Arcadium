import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  // Relative base so the same build loads from file:// (Electron) and capacitor:// (mobile).
  base: './',
  plugins: [preact()],
  server: { port: 5173, host: true },
  build: { target: 'es2022', outDir: 'dist' },
  test: {
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
