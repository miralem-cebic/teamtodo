import { expect, test } from '@playwright/test';
import { startFresh } from './helpers';

test('choose a pastel theme; it applies to the whole app and survives a reload', async ({ page }) => {
  const errors: string[] = [];
  await startFresh(page, errors);
  const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toUpperCase());
  expect(await accent()).toBe('#0D7A69');

  await page.getByRole('button', { name: 'Switch person or folder' }).click();
  await page.getByRole('menuitem', { name: 'Pink' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'pink');
  expect(await accent()).toBe('#B0457A');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'My tasks' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'pink');
  expect(await accent()).toBe('#B0457A');
  expect(errors).toEqual([]);
});
