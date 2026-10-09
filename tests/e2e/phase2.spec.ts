import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFolder, readTasks, readUsers, startFresh } from './helpers';

const rowOf = (p: Page, title: string) => p.locator('[data-row]').filter({ has: p.locator(`input[value="${title}"]`) });
const panel = (p: Page) => p.getByRole('complementary', { name: 'Aufgabendetails' });

/** Ziehen mit der Maus (dnd-kit braucht mehrere Bewegungsschritte) */
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
  // dnd-kit blockiert ~50 ms lang Klicks nach dem Loslassen (gegen versehentliches Auslösen)
  await page.waitForTimeout(120);
}

test('Kommentar mit @Erwähnung landet im Eingang der erwähnten Person', async ({ page }) => {
  await startFresh(page);
  await rowOf(page, 'Einladungsmail schreiben').getByRole('button', { name: 'Details öffnen' }).click();
  const box = panel(page).getByRole('textbox', { name: 'Kommentar' });
  await box.click();
  await page.keyboard.type('Bitte prüfen @Jon');
  await expect(page.getByRole('listbox', { name: 'Person erwähnen' })).toBeVisible();
  await page.keyboard.press('Enter'); // Vorschlag übernehmen
  await page.keyboard.type('danke!');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
  await expect(panel(page).locator('.cmt').filter({ hasText: 'Bitte prüfen @Jonas Weber danke!' })).toBeVisible();
  await expect(panel(page).locator('.mention')).toHaveText('@Jonas Weber');

  const t = (await readTasks(page)).find((x) => x.title === 'Einladungsmail schreiben') as unknown as { comments: { mentions: string[] }[]; followerIds: string[] };
  const jonas = (await readUsers(page)).find((u) => u.name === 'Jonas Weber')!.id;
  expect(t.comments.at(-1)!.mentions).toEqual([jonas]);
  expect(t.followerIds).toContain(jonas);

  // als Jonas: Eingang zeigt die Erwähnung als ungelesen
  await page.getByRole('button', { name: 'Person oder Ordner wechseln' }).click();
  await page.getByRole('menuitem', { name: 'Person wechseln' }).click();
  await page.getByRole('button', { name: 'Jonas Weber' }).click();
  const inboxNav = page.getByRole('button', { name: /^Eingang, \d+ ungelesen/ });
  await expect(inboxNav).toBeVisible();
  await inboxNav.click();
  const item = page.getByRole('button', { name: /Pia hat dich erwähnt: Einladungsmail schreiben \(ungelesen\)/ });
  await expect(item).toBeVisible();
  await item.click();
  await expect(panel(page)).toBeVisible();
  await expect(page.getByRole('button', { name: /Pia hat dich erwähnt: Einladungsmail schreiben$/ })).toBeVisible();
});

test('Anhang hinzufügen, als Datei speichern, entfernen mit Rückgängig', async ({ page }) => {
  await startFresh(page);
  await rowOf(page, 'Einladungsmail schreiben').getByRole('button', { name: 'Details öffnen' }).click();
  await panel(page).locator('input[type="file"]').setInputFiles({ name: 'briefing.txt', mimeType: 'text/plain', buffer: Buffer.from('Hallo Team') });
  await expect(panel(page).locator('.att-n')).toHaveText('briefing.txt');
  const id = (await readTasks(page)).find((x) => x.title === 'Einladungsmail schreiben')!.id;
  const files = await readFolder(page);
  expect(files[`attachments/${id}/briefing.txt`]).toBeDefined();
  await expect(panel(page).getByText('hat „briefing.txt“ angehängt')).toBeVisible();

  await panel(page).getByRole('button', { name: 'briefing.txt entfernen' }).click();
  await expect(panel(page).locator('.att-n')).toHaveCount(0);
  await page.locator('.toast').getByRole('button', { name: 'Rückgängig' }).click();
  await expect(panel(page).locator('.att-n')).toHaveText('briefing.txt');
});

test('Filter, Gruppierung und Sortierung, aktive Filter sichtbar und zurücksetzbar', async ({ page }) => {
  await startFresh(page);
  await page.getByRole('button', { name: /^Marketing/ }).click();
  await page.getByRole('button', { name: 'Gruppieren' }).click();
  await page.getByRole('menuitem', { name: 'Status' }).click();
  await expect(page.getByRole('heading', { name: 'In Arbeit', level: 3 })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Bereich' })).toBeVisible();

  await page.getByRole('button', { name: 'Filter' }).click();
  await page.getByRole('button', { name: 'Überfällig' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Filter, 1 aktiv' })).toBeVisible();
  const titles = await page.locator('[data-row] input[data-title]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(titles).toEqual(['Kundentag: Agenda finalisieren']);
  await page.getByRole('button', { name: 'Filter zurücksetzen' }).click();
  await expect(page.getByRole('button', { name: 'Filter', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sortieren' }).click();
  await page.getByRole('menuitem', { name: 'Alphabetisch' }).click();
  await expect(page.getByRole('button', { name: 'Alphabetisch' })).toBeVisible();
});

test('Liste: Aufgabe per Drag and Drop in anderen Bereich, Überfällig lehnt ab', async ({ page }) => {
  await startFresh(page);
  await page.getByRole('button', { name: /^Marketing/ }).click();
  const src = rowOf(page, 'Preisliste Add-ons aktualisieren');
  const target = rowOf(page, 'LinkedIn-Beiträge für KW planen');
  await drag(page, src.locator('.grip'), target, 'bottom');
  await expect(page.locator('.toast')).toContainText('Nach „Nächste Woche erledigen“ verschoben');
  const region = page.getByRole('region', { name: 'Nächste Woche erledigen' });
  await expect(region.locator('input[value="Preisliste Add-ons aktualisieren"]')).toBeVisible();
  const order = await region.locator('[data-row] input[data-title]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(order.indexOf('Preisliste Add-ons aktualisieren')).toBe(order.indexOf('LinkedIn-Beiträge für KW planen') + 1);

  // Meine Aufgaben: in „Überfällig“ ziehen geht nicht
  await page.getByRole('button', { name: /^Meine Aufgaben/ }).click();
  await drag(page, rowOf(page, 'Einladungsmail schreiben').locator('.grip'), rowOf(page, 'Startseiten-Texte schreiben'), 'bottom');
  await expect(page.locator('.toast')).toContainText('In „Überfällig“ kann nicht verschoben werden');
  await expect(page.getByRole('region', { name: 'Heute' }).locator('input[value="Einladungsmail schreiben"]')).toBeVisible();
});

test('Bereiche per Drag and Drop umsortieren', async ({ page }) => {
  await startFresh(page);
  await page.getByRole('button', { name: /^Marketing/ }).click();
  const head = (name: string) => page.locator('.ghead').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await drag(page, head('Später erledigen').locator('.g-grip'), head('Events'), 'top');
  await expect(page.locator('.ghead h3').first()).toHaveText('Später erledigen');
  const projects = JSON.parse((await readFolder(page))['projects.json']!).projects as { name: string; sections: { name: string; order: number }[] }[];
  const secs = projects.find((p) => p.name === 'Marketing')!.sections.sort((a, b) => a.order - b.order);
  expect(secs[0]!.name).toBe('Später erledigen');
});

test('Board: Taste B, Karte in andere Spalte ziehen, Enter-Kette am Spaltenende', async ({ page }) => {
  await startFresh(page);
  await page.getByRole('button', { name: /^Marketing/ }).click();
  await page.keyboard.press('b');
  await expect(page.getByRole('list', { name: 'Board' })).toBeVisible();
  const card = page.locator('[data-card]').filter({ hasText: 'Case Study mit Pilotkunde' });
  const col = page.getByRole('listitem', { name: 'Events' });
  await drag(page, card, col.locator('.col-body'), 'bottom');
  await expect(col.locator('[data-card]').filter({ hasText: 'Case Study mit Pilotkunde' })).toBeVisible();

  await col.getByRole('button', { name: 'Aufgabe hinzufügen' }).click();
  await page.keyboard.type('Karte eins');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Karte zwei');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(col.locator('[data-card]').filter({ hasText: /^Karte (eins|zwei)/ })).toHaveCount(2);
  await page.keyboard.press('l');
  await expect(page.getByRole('grid', { name: 'Aufgaben' })).toBeVisible();
});

test('Sicherung wiederherstellen', async ({ page }) => {
  await startFresh(page);
  await page.getByRole('button', { name: 'Daten und Sicherungen' }).click();
  const dlg = page.getByRole('dialog', { name: 'Daten und Sicherungen' });
  await expect(dlg.getByText(/^Tagessicherung/)).toBeVisible();
  await dlg.getByRole('button', { name: 'Schließen' }).click();

  // nach der Sicherung ändern
  const id = (await readTasks(page)).find((t) => t.title === 'Einladungsmail schreiben')!.id;
  const input = page.locator(`[data-row="${id}"]`).getByRole('textbox', { name: 'Aufgabentitel' });
  await input.fill('Nach der Sicherung');
  await input.press('Escape');

  await page.getByRole('button', { name: 'Daten und Sicherungen' }).click();
  await dlg.getByRole('button', { name: /^Tagessicherung .* wiederherstellen$/ }).click();
  await dlg.getByRole('button', { name: 'Wiederherstellen', exact: true }).click();
  await expect(page.locator('input[value="Einladungsmail schreiben"]')).toBeVisible();
  await expect(page.locator('input[value="Nach der Sicherung"]')).toHaveCount(0);
  const files = await readFolder(page);
  expect(Object.keys(files).some((p) => p.startsWith('backups/vor-wiederherstellung-'))).toBe(true);
});
