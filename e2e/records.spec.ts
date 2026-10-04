import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expect, test } from './test';
import { CLEAN_NOTE, confirmAndSave, nav, resolveEverything, startFromText, unlock } from './helpers';

test.describe.configure({ timeout: 90_000 });

const REFERRAL_NOTE =
  'Patient Sunita, twenty-six, seven months pregnant. Swelling of feet and headache since yesterday. BP one sixty over one hundred and ten. Referred to the district hospital today. Follow up in two weeks.';

/** Saves two visits in one session: Noor with a 3-day follow-up, then Sunita with an urgent referral. */
async function saveTwo(page: Page) {
  await startFromText(page, CLEAN_NOTE);
  await confirmAndSave(page);
  await page.getByTestId('next-visit').click();
  await page.getByTestId('dev-paste').fill(REFERRAL_NOTE);
  await page.getByTestId('dev-paste-go').click();
  await resolveEverything(page);
  await confirmAndSave(page);
}

test('saved records list newest first, with how many are waiting to be sent', async ({ page }) => {
  await saveTwo(page);
  await nav(page, 'Records').click();
  await expect(page.getByTestId('sync-count')).toHaveText('2 waiting for signal');
  const items = page.locator('[data-testid^="record-"]');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('Sunita, 26 y');
  await expect(items.nth(1)).toContainText('Noor, 38 y');
  await expect(items.nth(1)).toContainText('Waiting for signal');
});

test('records survive a reload but only open with the PIN', async ({ page }) => {
  await saveTwo(page);
  await page.reload();
  await nav(page, 'Records').click();
  await expect(page.getByText('Noor, 38 y')).toHaveCount(0);
  await unlock(page);
  await expect(page.getByText('Noor, 38 y')).toBeVisible();
  await expect(page.getByText('Sunita, 26 y')).toBeVisible();
});

test('"send" is a labelled mock: it waits for a signal, and it makes no network request', async ({ page, context }) => {
  const requests: string[] = [];
  await saveTwo(page);
  await nav(page, 'Records').click();
  await expect(page.getByTestId('sync-panel')).toContainText('MOCK');
  await expect(page.getByTestId('sync-panel')).toContainText('Nothing leaves this phone');

  await context.setOffline(true);
  await expect(page.getByTestId('sync-send')).toBeDisabled();
  await expect(page.getByTestId('sync-send')).toContainText('No signal');
  await context.setOffline(false);
  await expect(page.getByTestId('sync-send')).toBeEnabled();

  context.on('request', (r) => requests.push(r.url()));
  await page.getByTestId('sync-send').click();
  await expect(page.getByTestId('sync-count')).toHaveText('Nothing is waiting to be sent');
  await expect(page.getByText('Sent (mock)').first()).toBeVisible();
  expect(requests.filter((u) => !u.includes('localhost') || /\.json$|api|sync|send/i.test(u))).toEqual([]);
});

test('a saved record opens read-only, with its evidence, transcript, consent and slip', async ({ page }) => {
  await saveTwo(page);
  await nav(page, 'Records').click();
  await page.getByText('Noor, 38 y').click();

  await expect(page.getByTestId('saved-title')).toHaveText('Noor, 38 y');
  await expect(page.getByTestId('saved-consent')).toContainText('another language');
  await expect(page.getByTestId('saved-m1.dose')).toContainText('500 mg');
  await expect(page.getByTestId('confirm-button')).toHaveCount(0);

  await page.getByTestId('saved-m1.dose').click();
  await expect(page.getByTestId('sheet').locator('mark')).toHaveText('five hundred milligrams');
  await expect(page.getByTestId('sheet-save')).toHaveCount(0);
  await expect(page.getByTestId('sheet-looks-right')).toHaveCount(0);
  await page.getByTestId('sheet-close').click();

  await page.getByTestId('saved-tab-transcript').click();
  await expect(page.getByTestId('saved-transcript')).toHaveText(CLEAN_NOTE);
  await page.getByTestId('saved-tab-slip').click();
  await expect(page.getByTestId('slip-who')).toHaveText('Noor, 38 y');
  await expect(page.getByTestId('playlist')).toBeVisible();
});

test('export gives DHIS2-shaped JSON with placeholder ids, a first name and age only, and a warning', async ({ page }) => {
  await saveTwo(page);
  await nav(page, 'Records').click();
  await page.getByText('Noor, 38 y').click();
  const download = page.waitForEvent('download');
  await page.getByTestId('export-json').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^awaaz-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}\.json$/);
  const text = readFileSync((await file.path())!, 'utf8');
  const json = JSON.parse(text);

  expect(json.note).toContain('placeholder');
  expect(json.note).toContain('patient details');
  expect(json.events).toHaveLength(2); // the visit and one medicine
  const [visit, medicine] = json.events;
  expect(visit.note).toBe('Noor, 38 y');
  expect(visit.eventDate).toBe(visit.eventDate.slice(0, 10));
  for (const e of json.events) {
    expect(e.program).toMatch(/^PLACEHOLDER_/);
    expect(e.orgUnit).toMatch(/^PLACEHOLDER_/);
    for (const v of e.dataValues) expect(v.dataElement).toMatch(/^PLACEHOLDER_/);
  }
  const values = Object.fromEntries(visit.dataValues.map((v: { dataElement: string; value: unknown }) => [v.dataElement, v.value]));
  expect(values.PLACEHOLDER_AGE_YEARS).toBe(38);
  expect(values.PLACEHOLDER_COMPLAINT).toBe('fever');
  expect(values.PLACEHOLDER_FOLLOW_UP_DAYS).toBe(3);
  const med = Object.fromEntries(medicine.dataValues.map((v: { dataElement: string; value: unknown }) => [v.dataElement, v.value]));
  expect(med).toMatchObject({ PLACEHOLDER_MEDICINE_NAME: 'Paracetamol', PLACEHOLDER_DOSE: 500, PLACEHOLDER_DOSE_UNIT: 'mg', PLACEHOLDER_TIMES_PER_DAY: 3, PLACEHOLDER_DURATION_DAYS: 3 });
  expect(text).not.toContain('Fatima');
});

test('tasks: the urgent referral comes first, then follow-ups by date; "done" removes one', async ({ page }) => {
  await saveTwo(page);
  await nav(page, 'Tasks').click();
  const tasks = page.getByTestId('task-list').locator('li');
  await expect(tasks).toHaveCount(3);
  await expect(tasks.nth(0)).toContainText('Urgent referral');
  await expect(tasks.nth(0)).toContainText('Sunita, 26 y');
  await expect(tasks.nth(0)).toContainText('Due today');
  await expect(tasks.nth(1)).toContainText('Noor, 38 y');
  await expect(tasks.nth(1)).toContainText('Due in 3 days');
  await expect(tasks.nth(2)).toContainText('Sunita, 26 y');
  await expect(tasks.nth(2)).toContainText('Due in 14 days');

  await page.getByTestId('task-done-referral').click();
  await expect(tasks).toHaveCount(2);
  await expect(page.getByText('1 done')).toBeVisible();
});

test('a follow-up that has passed is shown as overdue, ahead of the ones still to come', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-04T10:00:00') });
  await saveTwo(page);
  await page.clock.fastForward(5 * 24 * 3600 * 1000); // five days later
  await nav(page, 'Tasks').click();
  await unlock(page); // the app locked itself while nobody was using it
  const tasks = page.getByTestId('task-list').locator('li');
  await expect(tasks.nth(0)).toContainText('Urgent referral');
  await expect(tasks.nth(0)).toContainText('Overdue by 5 days');
  await expect(tasks.nth(1)).toContainText('Noor, 38 y');
  await expect(tasks.nth(1)).toContainText('Overdue by 2 days');
  await expect(tasks.nth(2)).toContainText('Due in 9 days');
});

test('with nothing saved, records and tasks say so after the PIN is set', async ({ page }) => {
  await page.goto('/');
  await nav(page, 'Records').click();
  await expect(page.getByTestId('pin-new')).toBeVisible();
  await page.getByTestId('pin-new').fill('4821');
  await page.getByTestId('pin-again').fill('4821');
  await page.getByTestId('pin-set').click();
  await expect(page.getByText('No records yet')).toBeVisible();
  await nav(page, 'Tasks').click();
  await expect(page.getByText('No follow-ups waiting')).toBeVisible();
});
