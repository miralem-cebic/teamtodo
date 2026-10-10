import { expect, test, type Page } from '@playwright/test';
import { APP_URL, readTasks, startFresh } from './helpers';

// Two windows of the same browser profile share the test folder (localStorage).

const e2e = (p: Page, fn: 'flush' | 'sync') => p.evaluate((f) => (window as unknown as Record<string, Record<string, () => Promise<void>>>).__e2e![f]!(), fn);
const rowById = (p: Page, id: string) => p.locator(`[data-row="${id}"]`);

async function secondWindow(page: Page) {
  const other = await page.context().newPage();
  await other.goto(APP_URL);
  await expect(other.getByRole('heading', { name: 'My tasks' })).toBeVisible();
  return other;
}

test('two windows see each other’s changes within 10 seconds', async ({ page }) => {
  test.setTimeout(60_000);
  await startFresh(page);
  const other = await secondWindow(page);

  // window 1 creates it → window 2 sees it without reload (sync every 10 s)
  await page.keyboard.press('n');
  await page.keyboard.type('Aus Fenster eins');
  await page.keyboard.press('Escape');
  await expect(page.getByText('Saved')).toBeVisible();
  const id = (await readTasks(page)).find((t) => t.title === 'Aus Fenster eins')!.id;
  await expect(rowById(other, id)).toBeVisible({ timeout: 11_000 });

  // window 2 renames → window 1 takes it over, the row briefly lights up
  const input2 = rowById(other, id).getByRole('textbox', { name: 'Task title' });
  await input2.fill('Changed from window two');
  await input2.press('Escape');
  await expect(rowById(page, id).getByRole('textbox', { name: 'Task title' })).toHaveValue('Changed from window two', { timeout: 11_000 });

  // window 2 completes → disappears from "Open tasks" in window 1 (someone else's completion, not under our own cursor)
  await rowById(other, id).getByRole('button', { name: 'Mark as done' }).click();
  await expect(rowById(page, id)).toHaveCount(0, { timeout: 11_000 });
});

test('simultaneous changes to different fields of the same task are not lost', async ({ page }) => {
  await startFresh(page);
  const other = await secondWindow(page);
  const id = (await readTasks(page)).find((t) => t.title === 'Write the invitation email')!.id;

  // window 1: change the title and save
  const in1 = rowById(page, id).getByRole('textbox', { name: 'Task title' });
  await in1.fill('Invitation email final');
  await in1.press('Escape');
  await e2e(page, 'flush');

  // window 2 still has the old state and changes the status before it has synced
  await expect(rowById(other, id).getByRole('textbox', { name: 'Task title' })).toHaveValue('Write the invitation email');
  await rowById(other, id).getByRole('button', { name: /^Status/ }).click();
  await other.getByRole('menuitem', { name: 'Waiting' }).click();
  await e2e(other, 'flush');

  // the file contains both
  const t = (await readTasks(other)).find((x) => x.id === id) as unknown as { title: string; status: string };
  expect([t.title, t.status]).toEqual(['Invitation email final', 'waiting']);

  // and both windows show both
  await e2e(page, 'sync');
  await e2e(other, 'sync');
  for (const p of [page, other]) {
    await expect(rowById(p, id).getByRole('textbox', { name: 'Task title' })).toHaveValue('Invitation email final');
    await expect(rowById(p, id).getByRole('button', { name: 'Status: Waiting' })).toBeVisible();
  }
});
