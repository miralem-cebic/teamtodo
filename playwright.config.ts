import { defineConfig } from '@playwright/test';

// Ende-zu-Ende-Tests gegen den Produktions-Build unter file:// im installierten Chrome.
// Der Datenordner wird im Testmodus (?e2e) im Speicher nachgebildet.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  reporter: [['list']],
  workers: 3,
  use: {
    channel: process.env.BROWSER_CHANNEL || 'chrome',
    headless: !process.env.HEADED,
    viewport: { width: 1400, height: 900 },
    locale: 'de-DE',
    trace: 'retain-on-failure',
  },
});
