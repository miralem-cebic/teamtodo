import { expect, test } from '@playwright/test';
import { startFresh } from './helpers';

test('switch the interface language via the account menu and back', async ({ page }) => {
  const errors: string[] = [];
  await startFresh(page, errors);

  await page.getByRole('button', { name: 'Switch person or folder' }).click();
  await page.getByRole('menuitem', { name: 'Deutsch' }).click();
  await expect(page.getByRole('heading', { name: 'Meine Aufgaben' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navigation' })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Ansicht anpassen' }).getByRole('button', { name: 'Aufgabe hinzufügen' })).toBeVisible();

  await page.getByRole('button', { name: 'Person oder Ordner wechseln' }).click();
  await page.getByRole('menuitem', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'My tasks' })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Adjust view' }).getByRole('button', { name: 'Add task' })).toBeVisible();

  expect(errors).toEqual([]);
});
