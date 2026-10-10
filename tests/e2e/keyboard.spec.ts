import { expect, test } from '@playwright/test';
import { focusedValue, isoToday, readTasks, readUsers, startFresh } from './helpers';

test('enter five tasks and three subtasks, assign and schedule them using only the keyboard', async ({ page }) => {
  const errors: string[] = [];
  await startFresh(page, errors);

  // N: new task at the top of the first group that can be filled ("Today")
  await page.keyboard.press('n');
  for (let i = 1; i <= 5; i++) {
    await page.keyboard.type(`Keyboard ${i}`);
    if (i === 3) {
      // person via Alt+P, date via Alt+D – focus returns to the title each time
      await page.keyboard.press('Alt+KeyP');
      await expect(page.getByRole('combobox', { name: 'Search person' })).toBeFocused();
      await page.keyboard.type('Jonas');
      await page.keyboard.press('Enter');
      await expect.poll(() => focusedValue(page)).toBe('Keyboard 3');
      await page.keyboard.press('Alt+KeyD');
      await expect(page.getByRole('textbox', { name: 'Enter date' })).toBeFocused();
      await page.keyboard.type('morgen');
      await page.keyboard.press('Enter');
      await expect.poll(() => focusedValue(page)).toBe('Keyboard 3');
    }
    await page.keyboard.press('Enter');
  }
  // Enter in an empty row ends the input
  await page.keyboard.press('Enter');
  await expect(page.locator('input[aria-label="Task title"][value=""]')).toHaveCount(0);

  // subtasks of "Keyboard 1": back via ↑, then Alt+S
  await page.getByRole('textbox', { name: 'Task title' }).and(page.locator('[value="Keyboard 1"]')).focus();
  await page.keyboard.press('Alt+KeyS');
  await expect(page.getByRole('complementary', { name: 'Task details' })).toBeVisible();
  for (let i = 1; i <= 3; i++) {
    await page.keyboard.type(`Unter ${i}`);
    await page.keyboard.press('Alt+KeyP');
    await expect(page.getByRole('combobox', { name: 'Search person' })).toBeFocused();
    await page.keyboard.type('Lena');
    await page.keyboard.press('Enter');
    await expect.poll(() => focusedValue(page)).toBe(`Unter ${i}`);
    await page.keyboard.press('Alt+KeyD');
    await expect(page.getByRole('textbox', { name: 'Enter date' })).toBeFocused();
    await page.keyboard.type('+3');
    await page.keyboard.press('Enter');
    await expect.poll(() => focusedValue(page)).toBe(`Unter ${i}`);
    await page.keyboard.press(i < 3 ? 'Enter' : 'Escape');
  }

  const tasks = await readTasks(page);
  const users = await readUsers(page);
  const id = (name: string) => users.find((u) => u.name.startsWith(name))!.id;
  const main = [1, 2, 3, 4, 5].map((i) => tasks.find((t) => t.title === `Keyboard ${i}`));
  expect(tasks.map((t) => t.title).filter((t) => t.startsWith("Keyboard")).sort()).toEqual(["Keyboard 1", "Keyboard 2", "Keyboard 3", "Keyboard 4", "Keyboard 5"]);
  // 1–2: group "Today". 3: Jonas, tomorrow → row moves to "Upcoming", 4–5 are created there and take over its date
  for (const [i, t] of main.entries()) {
    expect(t!.assigneeId).toBe(id(i === 2 ? 'Jonas' : 'Pia'));
    expect(t!.dueDate).toBe(i < 2 ? isoToday() : isoToday(1));
  }
  const subs = tasks.filter((t) => t.parentId === main[0]!.id);
  expect(subs.map((s) => s.title).sort()).toEqual(['Unter 1', 'Unter 2', 'Unter 3']);
  for (const s of subs) {
    expect(s.assigneeId).toBe(id('Lena'));
    expect(s.dueDate).toBe(isoToday(3));
  }
  expect(tasks.some((t) => t.title === '')).toBe(false);
  expect(errors).toEqual([]);
});

test('Esc selects the row, arrows move the selection, Space opens details', async ({ page }) => {
  await startFresh(page);
  const first = page.getByRole('textbox', { name: 'Task title' }).first();
  await first.focus();
  await page.keyboard.press('Escape');
  const selectedId = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.row);
  expect(selectedId).toBeTruthy();
  await page.keyboard.press('ArrowDown');
  const nextId = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.row);
  expect(nextId).toBeTruthy();
  expect(nextId).not.toBe(selectedId);
  await page.keyboard.press(' ');
  await expect(page.getByRole('complementary', { name: 'Task details' })).toBeVisible();
  await expect(page.locator(`[data-row="${nextId}"]`)).toHaveClass(/selected/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary', { name: 'Task details' })).toHaveCount(0);
  // focus back on the row
  expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.row)).toBe(nextId);
});

test('keyboard shortcuts overview with ?', async ({ page }) => {
  await startFresh(page);
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);
});
