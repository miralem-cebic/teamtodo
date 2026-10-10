import { expect, test } from '@playwright/test';
import { readFolder, readTasks, startFresh } from './helpers';

test('Remove a person: open tasks become unassigned, the person can be restored', async ({ page }) => {
  await startFresh(page);
  const users = JSON.parse((await readFolder(page))['users.json']!).users as { id: string; name: string }[];
  const jonasId = users.find((u) => u.name === 'Jonas Weber')!.id;
  const openBefore = (await readTasks(page)).filter((t) => t.assigneeId === jonasId && !t.completedAt && !t.deletedAt);
  expect(openBefore.length).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Manage team' }).click();
  const dialog = page.getByRole('dialog', { name: 'Team' });
  const pia = dialog.getByRole('listitem').filter({ has: page.getByRole('textbox', { name: 'Name of Pia' }) });
  await expect(pia.getByRole('button', { name: 'Remove' })).toBeDisabled();

  const jonas = dialog.getByRole('listitem').filter({ has: page.getByRole('textbox', { name: 'Name of Jonas Weber' }) });
  await jonas.getByRole('button', { name: 'Remove' }).click();
  await jonas.getByRole('button', { name: `Remove and unassign ${openBefore.length}` }).click();
  await expect(dialog.getByRole('list', { name: 'Removed people' }).getByText('Jonas Weber')).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(page.getByText('Saved')).toBeVisible();
  const tasks = await readTasks(page);
  for (const t of openBefore) expect(tasks.find((x) => x.id === t.id)?.assigneeId).toBeNull();
  const stored = (JSON.parse((await readFolder(page))['users.json']!).users as { id: string; deletedAt: string | null }[]).find((u) => u.id === jonasId);
  expect(stored?.deletedAt).toBeTruthy();

  await page.getByRole('button', { name: 'Manage team' }).click();
  await page.getByRole('dialog', { name: 'Team' }).getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('dialog', { name: 'Team' }).getByRole('textbox', { name: 'Name of Jonas Weber' })).toBeVisible();
});
