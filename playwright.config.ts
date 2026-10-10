import { defineConfig } from '@playwright/test';

// End-to-end tests against the production build via file:// in the installed Chrome.
// In test mode (?e2e) the data folder is simulated in memory.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  reporter: [['list']],
  workers: 3,
  use: {
    channel: process.env.BROWSER_CHANNEL || 'chrome',
    headless: !process.env.HEADED,
    viewport: { width: 1400, height: 900 },
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
});
