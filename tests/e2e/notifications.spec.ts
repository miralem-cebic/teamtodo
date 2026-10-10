import { expect, test } from '@playwright/test';
import { startFresh } from './helpers';

test('notifications can be switched on from the account menu; the app reports the result', async ({ page }) => {
  const errors: string[] = [];
  await startFresh(page, errors);

  await page.getByRole('button', { name: 'Switch person or folder' }).click();
  await page.getByRole('menuitem', { name: 'Notifications' }).click();
  // Headless browsers may allow or block the permission; either result is reported in a notice
  await expect(page.locator('.toast')).toContainText(/Notifications are (on|blocked)|does not support notifications/);
  expect(errors).toEqual([]);
});
