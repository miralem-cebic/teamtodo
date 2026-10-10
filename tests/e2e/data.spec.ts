import { expect, test } from '@playwright/test';
import { readFolder, readTasks, startFresh } from './helpers';

test('Data survives a reload; folder structure and schema version', async ({ page }) => {
  await startFresh(page);
  await page.keyboard.press('n');
  await page.keyboard.type('Stays after restart');
  await page.keyboard.press('Escape');
  await expect(page.getByText('Saved')).toBeVisible();

  const files = await readFolder(page);
  const top = Object.keys(files).filter((p) => !p.includes('/')).sort();
  expect(top).toEqual(['projects.json', 'users.json', 'workspace.json']);
  expect(Object.keys(files).some((p) => /^backups\/\d{4}-\d{2}-\d{2}\.json$/.test(p))).toBe(true);
  for (const [p, c] of Object.entries(files)) if (p.startsWith('tasks/')) expect(JSON.parse(c).schemaVersion).toBe(1);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'My tasks' })).toBeVisible();
  await expect(page.locator('input[value="Stays after restart"]')).toBeVisible();
  expect((await readTasks(page)).some((t) => t.title === 'Stays after restart')).toBe(true);
});

test('Create a project, create and rename a section, task without a project', async ({ page }) => {
  await startFresh(page);
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.keyboard.type('Campaign Q4');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue('Campaign Q4');
  await page.getByRole('button', { name: 'Add section' }).click();
  await expect(page.getByRole('textbox', { name: 'Section name' })).toBeFocused();
  await page.keyboard.type('Ideas');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Ideas' })).toBeVisible();

  // task in the section "Ideas"
  await page.getByRole('region', { name: 'Ideas' }).getByRole('button', { name: 'Add task' }).click();
  await page.keyboard.type('Erste Idee');
  await page.keyboard.press('Escape');
  const files = await readFolder(page);
  const projects = JSON.parse(files['projects.json']!).projects as { name: string; sections: { name: string }[] }[];
  expect(projects.find((p) => p.name === 'Campaign Q4')!.sections.map((s) => s.name)).toEqual(['Tasks', 'Ideas']);
  expect((await readTasks(page)).find((t) => t.title === 'Erste Idee')!.projectId).toBeTruthy();

  // My tasks: the new task has no project
  await page.getByRole('button', { name: /^My tasks/ }).click();
  await page.keyboard.press('n');
  await page.keyboard.type('No project');
  await page.keyboard.press('Escape');
  expect((await readTasks(page)).find((t) => t.title === 'No project')!.projectId).toBeNull();
});
