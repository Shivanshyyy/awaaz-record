import { expect, test } from './test';
import { nav, setPin, unlock } from './helpers';

test.describe.configure({ timeout: 60_000 });

async function openRecords(page: import('@playwright/test').Page) {
  await page.goto('/awaaz-record/');
  await nav(page, 'Records').click();
  await setPin(page);
  await expect(page.getByTestId('demo-card')).toBeVisible();
}

test('three demo visits can be loaded, each clearly marked SYNTHETIC, and removed again', async ({ page }) => {
  await openRecords(page);
  await expect(page.getByText('No records yet')).toBeVisible();
  await page.getByTestId('demo-load').click();

  const items = page.locator('[data-testid^="record-"]');
  await expect(items).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect(items.nth(i)).toContainText('Synthetic');
  await expect(page.getByTestId('sync-count')).toHaveText('3 waiting for signal');
  await expect(page.getByTestId('demo-card')).toContainText('Demo visits are loaded');

  // Tasks and Today know about them too, and say so.
  await nav(page, 'Tasks').click();
  await expect(page.getByTestId('task-list').locator('li').first()).toContainText('Synthetic');
  await expect(page.getByTestId('task-list').locator('li').first()).toContainText('Urgent referral');
  await nav(page, 'Today').click();
  await expect(page.getByTestId('today-summary')).toContainText('3');
  await expect(page.getByTestId('today-summary')).toContainText('visits recorded today');

  // Open the child's visit: it is read-only, labelled, and its slip says so on paper too.
  await nav(page, 'Records').click();
  await page.getByText('Aarav, 2 y').click();
  await expect(page.getByTestId('saved-synthetic')).toContainText('not a real patient');
  await page.getByTestId('saved-tab-slip').click();
  await expect(page.getByTestId('slip-synthetic')).toContainText('not a real patient');
  await expect(page.getByTestId('slip-med-m1')).toContainText('ORS');

  await nav(page, 'Records').click();
  await page.getByTestId('demo-remove').click();
  await expect(page.getByText('No records yet')).toBeVisible();
  await nav(page, 'Tasks').click();
  await expect(page.getByText('No follow-ups waiting')).toBeVisible();
});

test('demo records go through the same checks as real ones: nothing is left amber or red', async ({ page }) => {
  await openRecords(page);
  await page.getByTestId('demo-load').click();
  await page.getByText('Noor, 38 y').click();
  await page.getByTestId('saved-m1.dose').click();
  await expect(page.getByTestId('sheet').locator('mark')).toHaveText('five hundred milligrams');
  await page.getByTestId('sheet-close').click();
  await expect(page.locator('[data-testid^="saved-"]').filter({ hasText: /Missing|Check/ })).toHaveCount(0);
  void unlock;
});

test('on a first visit Today says nothing is saved yet, not that anything is locked', async ({ page }) => {
  await page.goto('/awaaz-record/');
  await expect(page.getByTestId('today-empty')).toContainText('Nothing is saved on this phone yet');
  await expect(page.getByTestId('today-locked')).toHaveCount(0);
  await expect(page.getByTestId('start-visit')).toBeVisible();
});

test('once a PIN exists, Today says the records are locked until it is entered', async ({ page }) => {
  await page.goto('/awaaz-record/');
  await nav(page, 'Records').click();
  await setPin(page);
  await expect(page.getByTestId('demo-card')).toBeVisible();
  await page.reload();
  await nav(page, 'Today').click();
  await expect(page.getByTestId('today-locked')).toContainText('locked');
  await expect(page.getByTestId('today-empty')).toHaveCount(0);
  await expect(page.getByTestId('start-visit')).toBeVisible();
});
