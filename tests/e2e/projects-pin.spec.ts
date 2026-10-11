import { expect, test, type Locator, type Page } from '@playwright/test';
import { startFresh } from './helpers';

/** Drag with the mouse (dnd-kit needs several movement steps) */
async function drag(page: Page, handle: Locator, target: Locator, where: 'top' | 'bottom') {
  const a = (await handle.boundingBox())!;
  const b = (await target.boundingBox())!;
  const y = where === 'top' ? b.y + 4 : b.y + b.height - 4;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 10, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, y, { steps: 12 });
  await page.mouse.move(b.x + b.width / 2, y, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(120);
}

test('a project can be pinned to the top of the list and unpinned again', async ({ page }) => {
  await startFresh(page);
  // sidebar project rows: each has a colour square
  const projects = page.locator('.nav:has(.sq)');
  await expect(projects.first()).toContainText('Marketing');

  await page.getByRole('button', { name: 'Pin Trade fair 2026 to top' }).click();
  await expect(projects.first()).toContainText('Trade fair 2026');
  await expect(page.getByRole('button', { name: 'Unpin Trade fair 2026' })).toHaveAttribute('aria-pressed', 'true');
});

test('a project is dragged to a new place in the list', async ({ page }) => {
  await startFresh(page);
  const projects = page.locator('.nav:has(.sq)');
  await drag(page, projects.filter({ hasText: 'Trade fair 2026' }), projects.filter({ hasText: 'Marketing' }), 'top');
  await expect(projects.first()).toContainText('Trade fair 2026');
});

test('a project moves with Ctrl+Shift+arrow keys, and not across the pinned group', async ({ page }) => {
  await startFresh(page);
  const projects = page.locator('.nav:has(.sq)');
  await page.getByRole('button', { name: 'Pin Website relaunch to top' }).click();
  await expect(projects.first()).toContainText('Website relaunch');
  // the top project is pinned and cannot go below an unpinned one
  await projects.filter({ hasText: 'Website relaunch' }).focus();
  await page.keyboard.press('Control+Shift+ArrowDown');
  await expect(projects.first()).toContainText('Website relaunch');
});
