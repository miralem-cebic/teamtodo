import { expect, test } from '@playwright/test';
import { startFresh } from './helpers';

test('a pinned project moves to the top of the project list and can be moved back', async ({ page }) => {
  await startFresh(page);
  // sidebar project buttons: they show a colour square
  const projects = page.locator('.nav:has(.sq)');
  await expect(projects.first()).toContainText('Marketing');

  await page.getByRole('button', { name: 'Pin Trade fair 2026 to top' }).click();
  await expect(projects.first()).toContainText('Trade fair 2026');
  await expect(page.getByRole('button', { name: 'Unpin Trade fair 2026' })).toHaveAttribute('aria-pressed', 'true');

  // the top project cannot go up any further; the unpinned ones stay below
  await expect(page.getByRole('button', { name: 'Move Trade fair 2026 up' })).toBeDisabled();

  await page.getByRole('button', { name: 'Unpin Trade fair 2026' }).click();
  await expect(projects.first()).toContainText('Trade fair 2026');
  await page.getByRole('button', { name: 'Move Trade fair 2026 down' }).click();
  await expect(projects.first()).toContainText('Marketing');
});
