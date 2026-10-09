// Abnahmetest Build: dist/index.html per file:// im installierten Chrome öffnen
// und prüfen, dass die App ohne Konsolenfehler startet.
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const url = pathToFileURL(resolve('dist/index.html')).href;
const channel = process.env.BROWSER_CHANNEL || 'chrome';
const browser = await chromium.launch({ channel, headless: process.env.HEADED ? false : true });
const page = await browser.newPage();
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));

await page.goto(url);
await page.getByRole('button', { name: 'Datenordner wählen' }).waitFor({ timeout: 5000 });
const env = await page.evaluate(async () => {
  await document.fonts.ready;
  return {
    protocol: location.protocol,
    secureContext: isSecureContext,
    directoryPicker: typeof showDirectoryPicker === 'function',
    indexedDb: typeof indexedDB !== 'undefined',
    font: document.fonts.check('600 14px "Hanken Grotesk"'),
    fontFamilyUsed: getComputedStyle(document.body).fontFamily.split(',')[0],
    ui: document.querySelector('.onb button')?.textContent ?? null,
  };
});
console.log(`Browser: ${channel} ${browser.version()}`);
console.log(env);
console.log(problems.length ? `PROBLEME:\n${problems.join('\n')}` : 'Keine Konsolenfehler oder -warnungen.');
await browser.close();
process.exit(problems.length || !env.directoryPicker || !env.secureContext || !env.font ? 1 : 0);
