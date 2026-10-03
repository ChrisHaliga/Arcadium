import { defineConfig, devices } from '@playwright/test';

/**
 * Ports of the suite's own, so it never talks to a dev client or match server you already
 * have running (and fails loudly instead if something else holds them).
 */
const WEB_PORT = 5391;
const SERVER_PORT = 8891;

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  // The matches run in real time and the smoke test steers by the clock, so one browser at a time.
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${WEB_PORT}`,
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npx tsx server/index.ts',
      url: `http://localhost:${SERVER_PORT}/healthz`,
      env: { PORT: String(SERVER_PORT), REGION: 'e2e' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { VITE_GAME_SERVERS: `ws://localhost:${SERVER_PORT}/play` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
