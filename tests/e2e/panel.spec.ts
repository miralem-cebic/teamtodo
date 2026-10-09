import { expect, test } from '@playwright/test';
import { readTasks, startFresh } from './helpers';

test('Detailansicht öffnen und schließen ohne Seitenwechsel und ohne Scroll-Verlust', async ({ page }) => {
  await page.setViewportSize({ width: 1300, height: 520 });
  await startFresh(page);
  await page.getByRole('button', { name: /^Marketing/ }).click();
  const scroller = page.getByTestId('list-scroll');
  await scroller.evaluate((el) => (el.scrollTop = 260));
  const before = await scroller.evaluate((el) => el.scrollTop);
  expect(before).toBeGreaterThan(100);
  const url = page.url();

  const row = page.locator('[data-row]').filter({ hasText: '' }).nth(5);
  await row.hover();
  await row.getByRole('button', { name: 'Details öffnen' }).click();
  const panel = page.getByRole('complementary', { name: 'Aufgabendetails' });
  await expect(panel).toBeVisible();
  await expect(row).toHaveClass(/selected/);
  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(before);
  expect(page.url()).toBe(url);

  await panel.getByRole('button', { name: 'Details schließen' }).click();
  await expect(panel).toHaveCount(0);
  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(before);
  expect(page.url()).toBe(url);
});

test('Erledigen per Klick, Rückgängig über den Hinweis', async ({ page }) => {
  await startFresh(page);
  const row = page.locator('[data-row]').first();
  const id = await row.getAttribute('data-row');
  await row.getByRole('button', { name: 'Als erledigt markieren' }).click();
  // bleibt sichtbar (abgehakt) bis zum Verlassen der Ansicht
  await expect(row).toHaveClass(/done/);
  await page.locator('.toast').getByRole('button', { name: 'Rückgängig' }).click();
  await expect(row).not.toHaveClass(/done/);
  expect((await readTasks(page)).find((t) => t.id === id)!.completedAt).toBeNull();
});

test('Löschen über das Panel mit Strg/⌘+Z rückgängig', async ({ page }) => {
  await startFresh(page);
  const row = page.locator('[data-row]').first();
  const title = await row.getByRole('textbox').inputValue();
  await row.getByRole('button', { name: 'Details öffnen' }).click();
  await page.getByRole('button', { name: 'Weitere Aktionen' }).click();
  await page.getByRole('menuitem', { name: 'Aufgabe löschen' }).click();
  await expect(page.locator(`input[value="${title}"]`)).toHaveCount(0);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+KeyZ' : 'Control+KeyZ');
  await expect(page.locator(`input[value="${title}"]`)).toHaveCount(1);
});
