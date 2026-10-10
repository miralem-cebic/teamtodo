import { expect, test } from '@playwright/test';
import { readTasks, startFresh } from './helpers';

test('open and close the detail panel without page navigation and without losing scroll position', async ({ page }) => {
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
  await row.getByRole('button', { name: 'Open details' }).click();
  const panel = page.getByRole('complementary', { name: 'Task details' });
  await expect(panel).toBeVisible();
  await expect(row).toHaveClass(/selected/);
  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(before);
  expect(page.url()).toBe(url);

  await panel.getByRole('button', { name: 'Close details' }).click();
  await expect(panel).toHaveCount(0);
  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(before);
  expect(page.url()).toBe(url);
});

test('complete by click, undo via the notice', async ({ page }) => {
  await startFresh(page);
  const row = page.locator('[data-row]').first();
  const id = await row.getAttribute('data-row');
  await row.getByRole('button', { name: 'Mark as done' }).click();
  // stays visible (checked) until the view is left
  await expect(row).toHaveClass(/done/);
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
  await expect(row).not.toHaveClass(/done/);
  expect((await readTasks(page)).find((t) => t.id === id)!.completedAt).toBeNull();
});

test('delete via the panel, undo with Ctrl/⌘+Z', async ({ page }) => {
  await startFresh(page);
  const row = page.locator('[data-row]').first();
  const title = await row.getByRole('textbox').inputValue();
  await row.getByRole('button', { name: 'Open details' }).click();
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete task' }).click();
  await expect(page.locator(`input[value="${title}"]`)).toHaveCount(0);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+KeyZ' : 'Control+KeyZ');
  await expect(page.locator(`input[value="${title}"]`)).toHaveCount(1);
});
