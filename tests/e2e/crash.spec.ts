import { expect, test, type Page } from '@playwright/test';
import { startFresh } from './helpers';

const nav = (p: Page) => p.getByRole('navigation', { name: 'Navigation' });
const crashed = (p: Page) => p.getByRole('alert').filter({ hasText: 'Something went wrong here' });
/** Test hook of the error boundary: the named boundary throws while it renders */
const injectCrash = (p: Page, where: string) => p.evaluate((w) => ((window as unknown as { __e2eCrash?: string }).__e2eCrash = w), where);

test('a crash in the main view leaves the sidebar working and can be retried', async ({ page }) => {
  // The boundary logs the component stack on purpose; what must not happen is an uncaught error
  const uncaught: string[] = [];
  page.on('pageerror', (e) => uncaught.push(e.message));
  await startFresh(page);
  await injectCrash(page, 'view');
  await nav(page).getByRole('button', { name: /^Inbox/ }).click();

  await expect(crashed(page)).toBeVisible();
  // the sidebar is still there and still navigates
  await expect(nav(page)).toBeVisible();
  await expect(nav(page).getByRole('button', { name: 'My tasks' })).toBeVisible();

  // the emergency copy of unsaved changes is written before the recovery is shown
  expect(await page.evaluate(() => localStorage.getItem('teamtodo.unsaved.v1'))).not.toBeNull();

  // retry with the fault removed: the view comes back
  await injectCrash(page, '');
  await crashed(page).getByRole('button', { name: 'Try again' }).click();
  await expect(crashed(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
  expect(uncaught).toEqual([]);
});

test('a crash in the task panel leaves the list working', async ({ page }) => {
  await startFresh(page);
  await injectCrash(page, 'panel');
  // opening a task mounts the panel, which crashes
  await page.locator('[data-row] input[data-title]').first().click();
  await page.keyboard.press('Control+o');
  await expect(crashed(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'My tasks' })).toBeVisible();
  await expect(nav(page)).toBeVisible();
  await injectCrash(page, '');
});
