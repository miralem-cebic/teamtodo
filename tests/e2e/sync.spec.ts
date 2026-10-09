import { expect, test, type Page } from '@playwright/test';
import { APP_URL, readTasks, startFresh } from './helpers';

// Zwei Fenster desselben Browserprofils teilen sich den Testordner (localStorage).

const e2e = (p: Page, fn: 'flush' | 'sync') => p.evaluate((f) => (window as unknown as Record<string, Record<string, () => Promise<void>>>).__e2e![f]!(), fn);
const rowById = (p: Page, id: string) => p.locator(`[data-row="${id}"]`);

async function secondWindow(page: Page) {
  const other = await page.context().newPage();
  await other.goto(APP_URL);
  await expect(other.getByRole('heading', { name: 'Meine Aufgaben' })).toBeVisible();
  return other;
}

test('zwei Fenster sehen gegenseitig ihre Änderungen innerhalb von 10 Sekunden', async ({ page }) => {
  test.setTimeout(60_000);
  await startFresh(page);
  const other = await secondWindow(page);

  // Fenster 1 legt an → Fenster 2 sieht sie ohne Neuladen (Abgleich alle 10 s)
  await page.keyboard.press('n');
  await page.keyboard.type('Aus Fenster eins');
  await page.keyboard.press('Escape');
  await expect(page.getByText('Gespeichert')).toBeVisible();
  const id = (await readTasks(page)).find((t) => t.title === 'Aus Fenster eins')!.id;
  await expect(rowById(other, id)).toBeVisible({ timeout: 11_000 });

  // Fenster 2 benennt um → Fenster 1 übernimmt es, Zeile leuchtet kurz auf
  const input2 = rowById(other, id).getByRole('textbox', { name: 'Aufgabentitel' });
  await input2.fill('Von Fenster zwei geändert');
  await input2.press('Escape');
  await expect(rowById(page, id).getByRole('textbox', { name: 'Aufgabentitel' })).toHaveValue('Von Fenster zwei geändert', { timeout: 11_000 });

  // Fenster 2 erledigt → verschwindet in Fenster 1 aus „Offene Aufgaben“ (fremde Erledigung, nicht unter dem eigenen Cursor)
  await rowById(other, id).getByRole('button', { name: 'Als erledigt markieren' }).click();
  await expect(rowById(page, id)).toHaveCount(0, { timeout: 11_000 });
});

test('gleichzeitige Änderungen an unterschiedlichen Feldern derselben Aufgabe gehen nicht verloren', async ({ page }) => {
  await startFresh(page);
  const other = await secondWindow(page);
  const id = (await readTasks(page)).find((t) => t.title === 'Einladungsmail schreiben')!.id;

  // Fenster 1: Titel ändern und speichern
  const in1 = rowById(page, id).getByRole('textbox', { name: 'Aufgabentitel' });
  await in1.fill('Einladungsmail final');
  await in1.press('Escape');
  await e2e(page, 'flush');

  // Fenster 2 hat noch den alten Stand und ändert den Status, bevor es abgeglichen hat
  await expect(rowById(other, id).getByRole('textbox', { name: 'Aufgabentitel' })).toHaveValue('Einladungsmail schreiben');
  await rowById(other, id).getByRole('button', { name: /^Status/ }).click();
  await other.getByRole('menuitem', { name: 'Wartet' }).click();
  await e2e(other, 'flush');

  // in der Datei steht beides
  const t = (await readTasks(other)).find((x) => x.id === id) as unknown as { title: string; status: string };
  expect([t.title, t.status]).toEqual(['Einladungsmail final', 'waiting']);

  // und beide Fenster zeigen beides
  await e2e(page, 'sync');
  await e2e(other, 'sync');
  for (const p of [page, other]) {
    await expect(rowById(p, id).getByRole('textbox', { name: 'Aufgabentitel' })).toHaveValue('Einladungsmail final');
    await expect(rowById(p, id).getByRole('button', { name: 'Status: Wartet' })).toBeVisible();
  }
});
