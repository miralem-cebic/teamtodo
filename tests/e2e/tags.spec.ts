import { expect, test } from '@playwright/test';
import { readTasks, startFresh } from './helpers';

test('a tag added in the task panel is saved and can be used as a filter', async ({ page }) => {
  await startFresh(page);
  const row = page.locator('[data-row]').filter({ has: page.locator('input[value="Write the invitation email"]') });
  await row.getByRole('button', { name: 'Open details' }).click();
  const panel = page.getByRole('complementary', { name: 'Task details' });

  await panel.getByRole('textbox', { name: 'Add tag' }).fill('Kunde');
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('button', { name: 'Remove tag Kunde' })).toBeVisible();

  const saved = (await readTasks(page)).find((t) => t.title === 'Write the invitation email') as unknown as { tags?: string[] };
  expect(saved.tags).toEqual(['Kunde']);

  // the tag is offered in the filter and narrows the list
  await page.getByRole('button', { name: /filter/i }).first().click();
  await page.getByRole('group', { name: 'Tags' }).getByRole('button', { name: 'Kunde' }).click();
  await expect(page.locator('[data-row]').filter({ has: page.locator('input[value="Write the invitation email"]') })).toBeVisible();
  await expect(page.locator('[data-row]').filter({ has: page.locator('input[value="Prepare the speaker list"]') })).toHaveCount(0);
});
