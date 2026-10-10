import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFolder, readTasks, readUsers, startFresh } from './helpers';

const rowOf = (p: Page, title: string) => p.locator('[data-row]').filter({ has: p.locator(`input[value="${title}"]`) });
const panel = (p: Page) => p.getByRole('complementary', { name: 'Task details' });

/** Drag with the mouse (dnd-kit needs several movement steps) */
async function drag(page: Page, handle: Locator, target: Locator, where: 'top' | 'bottom' | 'center' = 'center') {
  await handle.hover();
  const a = (await handle.boundingBox())!;
  const b = (await target.boundingBox())!;
  const y = where === 'top' ? b.y + 4 : where === 'bottom' ? b.y + b.height - 4 : b.y + b.height / 2;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 10, { steps: 3 });
  await page.mouse.move(b.x + Math.min(60, b.width / 2), y, { steps: 12 });
  await page.mouse.move(b.x + Math.min(62, b.width / 2), y, { steps: 2 });
  await page.mouse.up();
  // dnd-kit blocks clicks for ~50 ms after release (against accidental triggers)
  await page.waitForTimeout(120);
}

test('a comment with @mention lands in the inbox of the mentioned person', async ({ page }) => {
  await startFresh(page);
  await rowOf(page, 'Write the invitation email').getByRole('button', { name: 'Open details' }).click();
  const box = panel(page).getByRole('textbox', { name: 'Comment' });
  await box.click();
  await page.keyboard.type('Please check @Jon');
  await expect(page.getByRole('listbox', { name: 'Mention person' })).toBeVisible();
  await page.keyboard.press('Enter'); // accept the suggestion
  await page.keyboard.type('thanks!');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
  await expect(panel(page).locator('.cmt').filter({ hasText: 'Please check @Jonas Weber thanks!' })).toBeVisible();
  await expect(panel(page).locator('.mention')).toHaveText('@Jonas Weber');

  const t = (await readTasks(page)).find((x) => x.title === 'Write the invitation email') as unknown as { comments: { mentions: string[] }[]; followerIds: string[] };
  const jonas = (await readUsers(page)).find((u) => u.name === 'Jonas Weber')!.id;
  expect(t.comments.at(-1)!.mentions).toEqual([jonas]);
  expect(t.followerIds).toContain(jonas);

  // as Jonas: the inbox shows the mention as unread
  await page.getByRole('button', { name: 'Switch person or folder' }).click();
  await page.getByRole('menuitem', { name: 'Switch person' }).click();
  await page.getByRole('button', { name: 'Jonas Weber' }).click();
  const inboxNav = page.getByRole('button', { name: /^Inbox, \d+ unread/ });
  await expect(inboxNav).toBeVisible();
  await inboxNav.click();
  const item = page.getByRole('button', { name: /Pia mentioned you: Write the invitation email \(unread\)/ });
  await expect(item).toBeVisible();
  await item.click();
  await expect(panel(page)).toBeVisible();
  await expect(page.getByRole('button', { name: /Pia mentioned you: Write the invitation email$/ })).toBeVisible();
});

test('add an attachment, save it as a file, remove it with undo', async ({ page }) => {
  await startFresh(page);
  await rowOf(page, 'Write the invitation email').getByRole('button', { name: 'Open details' }).click();
  await panel(page).locator('input[type="file"]').setInputFiles({ name: 'briefing.txt', mimeType: 'text/plain', buffer: Buffer.from('Hello team') });
  await expect(panel(page).locator('.att-n')).toHaveText('briefing.txt');
  const id = (await readTasks(page)).find((x) => x.title === 'Write the invitation email')!.id;
  const files = await readFolder(page);
  expect(files[`attachments/${id}/briefing.txt`]).toBeDefined();
  await expect(panel(page).getByText('attached "briefing.txt"')).toBeVisible();

  await panel(page).getByRole('button', { name: 'briefing.txt entfernen' }).click();
  await expect(panel(page).locator('.att-n')).toHaveCount(0);
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
  await expect(panel(page).locator('.att-n')).toHaveText('briefing.txt');
});

test('filter, grouping and sorting; active filters are visible and can be reset', async ({ page }) => {
  await startFresh(page);
  await page.getByRole('button', { name: /^Marketing/ }).click();
  await page.getByRole('button', { name: 'Group' }).click();
  await page.getByRole('menuitem', { name: 'Status' }).click();
  await expect(page.getByRole('heading', { name: 'In progress', level: 3 })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Section' })).toBeVisible();

  await page.getByRole('button', { name: 'Filter' }).click();
  await page.getByRole('button', { name: 'Overdue' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Filter, 1 active' })).toBeVisible();
  const titles = await page.locator('[data-row] input[data-title]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(titles).toEqual(['Customer day: finalize the agenda']);
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.getByRole('button', { name: 'Filter', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sort' }).click();
  await page.getByRole('menuitem', { name: 'Alphabetical' }).click();
  await expect(page.getByRole('button', { name: 'Alphabetical' })).toBeVisible();
});

test('list: drag a task into another section by drag and drop, Overdue rejects it', async ({ page }) => {
  await startFresh(page);
  await page.getByRole('button', { name: /^Marketing/ }).click();
  const src = rowOf(page, 'Update the add-on price list');
  const target = rowOf(page, 'Plan LinkedIn posts for the week');
  await drag(page, src.locator('.grip'), target, 'bottom');
  await expect(page.locator('.toast')).toContainText('Moved to "Do next week"');
  const region = page.getByRole('region', { name: 'Do next week' });
  await expect(region.locator('input[value="Update the add-on price list"]')).toBeVisible();
  const order = await region.locator('[data-row] input[data-title]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(order.indexOf('Update the add-on price list')).toBe(order.indexOf('Plan LinkedIn posts for the week') + 1);

  // My tasks: dragging into "Overdue" is not possible
  await page.getByRole('button', { name: /^My tasks/ }).click();
  await drag(page, rowOf(page, 'Write the invitation email').locator('.grip'), rowOf(page, 'Write homepage copy'), 'bottom');
  await expect(page.locator('.toast')).toContainText('Cannot move into "Overdue"');
  await expect(page.getByRole('region', { name: 'Today' }).locator('input[value="Write the invitation email"]')).toBeVisible();
});

test('reorder sections by drag and drop', async ({ page }) => {
  await startFresh(page);
  await page.getByRole('button', { name: /^Marketing/ }).click();
  const head = (name: string) => page.locator('.ghead').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await drag(page, head('Do later').locator('.g-grip'), head('Events'), 'top');
  await expect(page.locator('.ghead h3').first()).toHaveText('Do later');
  const projects = JSON.parse((await readFolder(page))['projects.json']!).projects as { name: string; sections: { name: string; order: number }[] }[];
  const secs = projects.find((p) => p.name === 'Marketing')!.sections.sort((a, b) => a.order - b.order);
  expect(secs[0]!.name).toBe('Do later');
});

test('board: press B, drag a card to another column, Enter chain at the column end', async ({ page }) => {
  await startFresh(page);
  await page.getByRole('button', { name: /^Marketing/ }).click();
  await page.keyboard.press('b');
  await expect(page.getByRole('list', { name: 'Board' })).toBeVisible();
  const card = page.locator('[data-card]').filter({ hasText: 'Case study with pilot customer' });
  const col = page.getByRole('listitem', { name: 'Events' });
  await drag(page, card, col.locator('.col-body'), 'bottom');
  await expect(col.locator('[data-card]').filter({ hasText: 'Case study with pilot customer' })).toBeVisible();

  await col.getByRole('button', { name: 'Add task' }).click();
  await page.keyboard.type('Karte eins');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Karte zwei');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(col.locator('[data-card]').filter({ hasText: /^Karte (eins|zwei)/ })).toHaveCount(2);
  await page.keyboard.press('l');
  await expect(page.getByRole('grid', { name: 'Tasks' })).toBeVisible();
});

test('Backup restore', async ({ page }) => {
  await startFresh(page);
  await page.getByRole('button', { name: 'Data and backups' }).click();
  const dlg = page.getByRole('dialog', { name: 'Data and backups' });
  await expect(dlg.getByText(/^Daily backup/)).toBeVisible();
  await dlg.getByRole('button', { name: 'Close' }).click();

  // change after the backup
  const id = (await readTasks(page)).find((t) => t.title === 'Write the invitation email')!.id;
  const input = page.locator(`[data-row="${id}"]`).getByRole('textbox', { name: 'Task title' });
  await input.fill('After the backup');
  await input.press('Escape');

  await page.getByRole('button', { name: 'Data and backups' }).click();
  await dlg.getByRole('button', { name: /^Daily backup .* restore$/ }).click();
  await dlg.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.locator('input[value="Write the invitation email"]')).toBeVisible();
  await expect(page.locator('input[value="After the backup"]')).toHaveCount(0);
  const files = await readFolder(page);
  expect(Object.keys(files).some((p) => p.startsWith('backups/before-restore-'))).toBe(true);
});
