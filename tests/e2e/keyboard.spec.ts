import { expect, test } from '@playwright/test';
import { focusedValue, isoToday, readTasks, readUsers, startFresh } from './helpers';

test('fünf Aufgaben und drei Unteraufgaben nur per Tastatur erfassen, zuweisen und terminieren', async ({ page }) => {
  const errors: string[] = [];
  await startFresh(page, errors);

  // N: neue Aufgabe oben in der ersten befüllbaren Gruppe („Heute“)
  await page.keyboard.press('n');
  for (let i = 1; i <= 5; i++) {
    await page.keyboard.type(`Tastatur ${i}`);
    if (i === 3) {
      // Person per Alt+P, Datum per Alt+D – Fokus kommt jeweils in den Titel zurück
      await page.keyboard.press('Alt+KeyP');
      await expect(page.getByRole('combobox', { name: 'Person suchen' })).toBeFocused();
      await page.keyboard.type('Jonas');
      await page.keyboard.press('Enter');
      await expect.poll(() => focusedValue(page)).toBe('Tastatur 3');
      await page.keyboard.press('Alt+KeyD');
      await expect(page.getByRole('textbox', { name: 'Datum eingeben' })).toBeFocused();
      await page.keyboard.type('morgen');
      await page.keyboard.press('Enter');
      await expect.poll(() => focusedValue(page)).toBe('Tastatur 3');
    }
    await page.keyboard.press('Enter');
  }
  // Enter in leerer Zeile beendet die Eingabe
  await page.keyboard.press('Enter');
  await expect(page.locator('input[aria-label="Aufgabentitel"][value=""]')).toHaveCount(0);

  // Unteraufgaben an „Tastatur 1“: zurück per ↑, dann Alt+S
  await page.getByRole('textbox', { name: 'Aufgabentitel' }).and(page.locator('[value="Tastatur 1"]')).focus();
  await page.keyboard.press('Alt+KeyS');
  await expect(page.getByRole('complementary', { name: 'Aufgabendetails' })).toBeVisible();
  for (let i = 1; i <= 3; i++) {
    await page.keyboard.type(`Unter ${i}`);
    await page.keyboard.press('Alt+KeyP');
    await expect(page.getByRole('combobox', { name: 'Person suchen' })).toBeFocused();
    await page.keyboard.type('Lena');
    await page.keyboard.press('Enter');
    await expect.poll(() => focusedValue(page)).toBe(`Unter ${i}`);
    await page.keyboard.press('Alt+KeyD');
    await expect(page.getByRole('textbox', { name: 'Datum eingeben' })).toBeFocused();
    await page.keyboard.type('+3');
    await page.keyboard.press('Enter');
    await expect.poll(() => focusedValue(page)).toBe(`Unter ${i}`);
    await page.keyboard.press(i < 3 ? 'Enter' : 'Escape');
  }

  const tasks = await readTasks(page);
  const users = await readUsers(page);
  const id = (name: string) => users.find((u) => u.name.startsWith(name))!.id;
  const main = [1, 2, 3, 4, 5].map((i) => tasks.find((t) => t.title === `Tastatur ${i}`));
  expect(tasks.map((t) => t.title).filter((t) => t.startsWith("Tastatur")).sort()).toEqual(["Tastatur 1", "Tastatur 2", "Tastatur 3", "Tastatur 4", "Tastatur 5"]);
  // 1–2: Gruppe „Heute“. 3: Jonas, morgen → Zeile wandert nach „Demnächst“, 4–5 entstehen dort und übernehmen dessen Datum
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

test('Esc wählt die Zeile aus, Pfeile bewegen die Auswahl, Leertaste öffnet Details', async ({ page }) => {
  await startFresh(page);
  const first = page.getByRole('textbox', { name: 'Aufgabentitel' }).first();
  await first.focus();
  await page.keyboard.press('Escape');
  const selectedId = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.row);
  expect(selectedId).toBeTruthy();
  await page.keyboard.press('ArrowDown');
  const nextId = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.row);
  expect(nextId).toBeTruthy();
  expect(nextId).not.toBe(selectedId);
  await page.keyboard.press(' ');
  await expect(page.getByRole('complementary', { name: 'Aufgabendetails' })).toBeVisible();
  await expect(page.locator(`[data-row="${nextId}"]`)).toHaveClass(/selected/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary', { name: 'Aufgabendetails' })).toHaveCount(0);
  // Fokus zurück auf der Zeile
  expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.row)).toBe(nextId);
});

test('Tastenkürzel-Übersicht mit ?', async ({ page }) => {
  await startFresh(page);
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Tastenkürzel' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Tastenkürzel' })).toHaveCount(0);
});
