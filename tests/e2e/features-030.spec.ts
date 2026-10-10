import { expect, test } from '@playwright/test';
import { readFolder, startFresh } from './helpers';

const MOD = 'Control';

test('a pasted URL in the description is a link; Ctrl+K turns the selected text into one', async ({ page }) => {
  await startFresh(page);
  await page.locator('[data-row]').first().getByRole('button', { name: 'Open details' }).click();
  const panel = page.getByRole('complementary', { name: 'Task details' });

  // read mode: the link is clickable, the rest of the field is not a link
  await panel.getByRole('textbox', { name: 'Description' }).click();
  await panel.getByRole('textbox', { name: 'Description' }).fill('Siehe https://abc.de/efg bitte');
  await panel.getByRole('textbox', { name: 'Description' }).blur();
  await expect(panel.locator('.rich a')).toHaveAttribute('href', 'https://abc.de/efg');
  await expect(panel.locator('.rich a')).toHaveText('https://abc.de/efg');

  // Ctrl+K on a selection: the URL input appears, the selection becomes [label](url)
  await panel.locator('.rich').click();
  const field = panel.locator('textarea.p-desc');
  await field.fill('Lies die Doku heute');
  await field.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(9, 13));
  await page.keyboard.press(`${MOD}+K`);
  const input = panel.getByRole('textbox', { name: 'Link address' });
  await expect(input).toBeFocused();
  await input.fill('docs.example/page');
  await page.keyboard.press('Enter');
  await expect(field).toHaveValue('Lies die [Doku](https://docs.example/page) heute');
  await field.blur();
  await expect(panel.locator('.rich a', { hasText: 'Doku' })).toHaveAttribute('href', 'https://docs.example/page');
});

test('a comment with a URL shows a link in the feed', async ({ page }) => {
  await startFresh(page);
  await page.locator('[data-row]').first().getByRole('button', { name: 'Open details' }).click();
  const panel = page.getByRole('complementary', { name: 'Task details' });
  await panel.locator('textarea.c-in').fill('Bitte https://abc.de/efg prüfen');
  await panel.locator('textarea.c-in').press('Control+Enter');
  await expect(panel.locator('.cmt a')).toHaveAttribute('href', 'https://abc.de/efg');
});

test('the panel arrows go to the previous and next task of the list', async ({ page }) => {
  await startFresh(page);
  await page.getByRole('button', { name: /^Marketing/ }).click();
  const rows = page.locator('[data-row]');
  const first = await rows.nth(0).locator('[data-title]').inputValue();
  const second = await rows.nth(1).locator('[data-title]').inputValue();
  await rows.nth(1).getByRole('button', { name: 'Open details' }).click();
  const panel = page.getByRole('complementary', { name: 'Task details' });
  const title = panel.locator('.p-title');
  await expect(title).toHaveValue(second);

  await panel.getByRole('button', { name: 'Previous task in the list' }).click();
  await expect(title).toHaveValue(first);
  await expect(panel.getByRole('button', { name: 'Previous task in the list' })).toBeDisabled();

  await panel.getByRole('button', { name: 'Next task in the list' }).click();
  await panel.getByRole('button', { name: 'Next task in the list' }).click();
  await expect(title).not.toHaveValue(first);
});

test('save a project as template, then create a project from it without due dates or assignments', async ({ page }) => {
  await startFresh(page);
  await page.getByRole('button', { name: /^Marketing/ }).click();
  await page.getByRole('button', { name: 'Project options' }).click();
  await page.getByRole('menuitem', { name: 'Save as template' }).click();
  await expect(page.locator('.toast')).toContainText('Saved as template');

  await page.getByRole('button', { name: 'Templates' }).click();
  const row = page.locator('.tpl-row').filter({ has: page.getByRole('textbox', { name: 'Template name', exact: true }) });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Project name' }).fill('Marketing Juni');
  await page.getByRole('dialog').getByText('Marketing', { exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();

  await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue('Marketing Juni');
  await expect(page.locator('[data-row]').first()).toBeVisible();

  const files = await readFolder(page);
  const projects = (JSON.parse(files['projects.json']!) as { projects: { id: string; name: string; template?: boolean }[] }).projects;
  const created = projects.find((p) => p.name === 'Marketing Juni')!;
  expect(created.template).toBeFalsy();
  const tasks = Object.entries(files)
    .filter(([p]) => /^tasks\/[0-9a-f-]{36}\.json$/.test(p))
    .map(([, c]) => JSON.parse(c) as { projectId: string | null; assigneeId: string | null; dueDate: string | null })
    .filter((t) => t.projectId === created.id);
  expect(tasks.length).toBeGreaterThan(0);
  expect(tasks.every((t) => t.assigneeId === null && t.dueDate === null)).toBe(true);
});
