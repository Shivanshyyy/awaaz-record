import { expect, test } from './test';
import { CLEAN_NOTE, nav, setPin, shot } from './helpers';

// Writes the screenshots used in the README. Only runs with `npm run e2e:shots`.
test.skip(!process.env.SCREENSHOTS, 'screenshots are only taken with `npm run e2e:shots`');
test.describe.configure({ timeout: 90_000 });

const NOTE =
  'Patient Lakshmi, sixty years. Pain in both knees for two months. Gave diclofenac fifty milligrams twice a day after food for five days. Sorry, make that ibuprofen four hundred milligrams twice a day after food for five days.';

test('README screenshots', async ({ page }) => {
  await page.goto('/?dev=1');
  await shot(page, 'readme-1-today');

  await nav(page, 'New visit').click();
  await page.getByTestId('consent-play').click();
  await expect(page.getByTestId('consent-outcome')).toBeVisible();
  await shot(page, 'readme-2-consent');

  await page.getByTestId('dev-paste').fill(NOTE);
  await page.getByTestId('dev-paste-go').click();
  await expect(page.getByTestId('summary-bar')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'readme-3-review');

  await page.getByTestId('row-m1.name').getByRole('button', { name: /Open details/ }).click();
  await shot(page, 'readme-4-evidence');
  await page.getByTestId('sheet-close').click();

  // a clean note, saved, shows the slip and the playlist
  await page.goto('/?dev=1');
  await nav(page, 'New visit').click();
  await page.getByTestId('dev-paste').fill(CLEAN_NOTE);
  await page.getByTestId('dev-paste-go').click();
  await page.getByTestId('confirm-button').click();
  await setPin(page);
  await expect(page.getByTestId('confirmed')).toBeVisible();
  await page.getByTestId('slip').scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelector('[data-testid=slip]')?.scrollIntoView({ block: 'start' }));
  await shot(page, 'readme-5-slip');
  await page.evaluate(() => document.querySelector('[data-testid=playlist]')?.scrollIntoView({ block: 'start' }));
  await shot(page, 'readme-6-playlist');

  await nav(page, 'Records').click();
  await page.getByTestId('demo-load').click();
  await expect(page.locator('[data-testid^="record-"]')).toHaveCount(4);
  await shot(page, 'readme-7-records');
  await nav(page, 'Tasks').click();
  await expect(page.getByTestId('task-list')).toBeVisible();
  await shot(page, 'readme-8-tasks');
  await nav(page, 'Today').click();
  await expect(page.getByTestId('today-summary')).toBeVisible();
  await shot(page, 'readme-9-today-with-data');
});
