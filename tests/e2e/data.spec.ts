import { expect, test } from '@playwright/test';
import { readFolder, readTasks, startFresh } from './helpers';

test('Daten überstehen Neuladen; Ordnerstruktur und Schema-Version', async ({ page }) => {
  await startFresh(page);
  await page.keyboard.press('n');
  await page.keyboard.type('Bleibt nach Neustart');
  await page.keyboard.press('Escape');
  await expect(page.getByText('Gespeichert')).toBeVisible();

  const files = await readFolder(page);
  const top = Object.keys(files).filter((p) => !p.includes('/')).sort();
  expect(top).toEqual(['projects.json', 'users.json', 'workspace.json']);
  expect(Object.keys(files).some((p) => /^backups\/\d{4}-\d{2}-\d{2}\.json$/.test(p))).toBe(true);
  for (const [p, c] of Object.entries(files)) if (p.startsWith('tasks/')) expect(JSON.parse(c).schemaVersion).toBe(1);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Meine Aufgaben' })).toBeVisible();
  await expect(page.locator('input[value="Bleibt nach Neustart"]')).toBeVisible();
  expect((await readTasks(page)).some((t) => t.title === 'Bleibt nach Neustart')).toBe(true);
});

test('Projekt anlegen, Bereich anlegen und umbenennen, Aufgabe ohne Projekt', async ({ page }) => {
  await startFresh(page);
  await page.getByRole('button', { name: 'Projekt hinzufügen' }).click();
  await page.keyboard.type('Kampagne Q4');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Projektname' })).toHaveValue('Kampagne Q4');
  await page.getByRole('button', { name: 'Bereich hinzufügen' }).click();
  await expect(page.getByRole('textbox', { name: 'Bereichsname' })).toBeFocused();
  await page.keyboard.type('Ideen');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Ideen' })).toBeVisible();

  // Aufgabe im Bereich „Ideen“
  await page.getByRole('region', { name: 'Ideen' }).getByRole('button', { name: 'Aufgabe hinzufügen' }).click();
  await page.keyboard.type('Erste Idee');
  await page.keyboard.press('Escape');
  const files = await readFolder(page);
  const projects = JSON.parse(files['projects.json']!).projects as { name: string; sections: { name: string }[] }[];
  expect(projects.find((p) => p.name === 'Kampagne Q4')!.sections.map((s) => s.name)).toEqual(['Aufgaben', 'Ideen']);
  expect((await readTasks(page)).find((t) => t.title === 'Erste Idee')!.projectId).toBeTruthy();

  // Meine Aufgaben: neue Aufgabe hat kein Projekt
  await page.getByRole('button', { name: /^Meine Aufgaben/ }).click();
  await page.keyboard.press('n');
  await page.keyboard.type('Ohne Projekt');
  await page.keyboard.press('Escape');
  expect((await readTasks(page)).find((t) => t.title === 'Ohne Projekt')!.projectId).toBeNull();
});
