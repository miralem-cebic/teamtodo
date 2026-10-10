import { expect, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const APP_URL = pathToFileURL(resolve('dist/index.html')).href + '?e2e';

export interface TaskFile {
  id: string;
  title: string;
  parentId: string | null;
  projectId: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  completedAt: string | null;
  deletedAt: string | null;
}

/** Fresh start: choose a folder, set up with sample data, sign in as "Pia". */
export async function startFresh(page: Page, errors: string[] = []) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(APP_URL);
  await page.getByRole('button', { name: 'Choose data folder' }).click();
  await page.getByRole('button', { name: 'Set up' }).click();
  await page.getByRole('button', { name: 'Pia' }).click();
  await expect(page.getByRole('heading', { name: 'My tasks' })).toBeVisible();
}

/** Wait for pending writes and read the test folder (localStorage) as path → content */
export async function readFolder(page: Page): Promise<Record<string, string>> {
  await page.evaluate(() => (window as unknown as { __e2e: { flush: () => Promise<void> } }).__e2e.flush());
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    for (const k of Object.keys(localStorage)) {
      const m = /^teamtodo\.e2e:f:(.+)$/.exec(k);
      if (m) out[m[1]!] = (JSON.parse(localStorage.getItem(k)!) as { c: string }).c;
    }
    return out;
  });
}

export async function readTasks(page: Page): Promise<TaskFile[]> {
  const files = await readFolder(page);
  return Object.entries(files)
    .filter(([p]) => /^tasks\/[0-9a-f-]{36}\.json$/.test(p))
    .map(([, c]) => JSON.parse(c) as TaskFile);
}

export async function readUsers(page: Page): Promise<{ id: string; name: string }[]> {
  return (JSON.parse((await readFolder(page))['users.json']!) as { users: { id: string; name: string }[] }).users;
}

export function isoToday(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const focusedValue = (page: Page) => page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.value ?? null);
