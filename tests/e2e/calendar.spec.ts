import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { isoToday, startFresh } from './helpers';

test('calendar: press C, add a task on a day, see it in the grid, export the view as .ics', async ({ page }) => {
  await startFresh(page);
  await page.keyboard.press('c');
  await expect(page.locator('.cal-grid')).toBeVisible();
  await expect(page.getByRole('tab', { name: /Calendar/ })).toHaveAttribute('aria-selected', 'true');

  // a new task on the day two days from now
  const iso = isoToday(2);
  const day = page.locator(`.cal-grid [data-day="${iso}"]`);
  await day.hover();
  await day.locator('.cal-add').click();
  await page.keyboard.type('Kalendertest');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(day.locator('.cal-chip').filter({ hasText: 'Kalendertest' })).toBeVisible();

  // the calendar file contains the task as an all-day event
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Calendar export' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^teamtodo-.*\.ics$/);
  const content = readFileSync(await download.path(), 'utf8');
  expect(content).toContain('BEGIN:VCALENDAR');
  expect(content).toContain('SUMMARY:Kalendertest');
  expect(content).toContain(`DTSTART;VALUE=DATE:${iso.replace(/-/g, '')}`);
  expect(content).toMatch(/UID:[0-9a-f-]{36}@teamtodo/);
});

test('calendar: the project header shows the last due date of its open tasks', async ({ page }) => {
  await startFresh(page);
  await page.getByRole('button', { name: /^Marketing/ }).click();
  await expect(page.locator('.last-due')).toContainText('Last due:');
});
