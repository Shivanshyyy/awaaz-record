import type { Page } from '@playwright/test';
import { expect, test } from './test';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { installFakeMic } from './fake-mic';
import { setPin, shot } from './helpers';

const BASE = '/?dev=1';

test.describe.configure({ timeout: 60_000 });

// Lakshmi's note without a follow-up: one red item (follow-up) and two amber ones (the spoken correction hits both medicines).
const NOTE =
  'Patient Lakshmi, sixty years. Pain in both knees for two months. Gave diclofenac fifty milligrams twice a day after food for five days. Sorry, make that ibuprofen four hundred milligrams twice a day after food for five days.';

async function openReview(page: Page, text = NOTE) {
  await page.goto(BASE);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'New visit' }).click();
  await page.getByTestId('dev-paste').fill(text);
  await page.getByTestId('dev-paste-go').click();
  await expect(page.getByTestId('summary-bar')).toBeVisible();
}

test('Confirm stays disabled until every amber and red item is resolved', async ({ page }) => {
  await openReview(page);
  const confirm = page.getByTestId('confirm-button');
  const summary = page.getByTestId('summary-bar');

  await expect(summary).toContainText('2 to check');
  await expect(summary).toContainText('1 missing');
  await expect(confirm).toBeDisabled();
  await expect(page.getByTestId('confirm-help')).toContainText('3 marked items');
  await shot(page, '20-review-open-items');

  // The correction question: remove the medicine that was replaced.
  await page.getByTestId('row-m1.name').getByRole('button', { name: /Open details/ }).click();
  await expect(page.getByTestId('sheet')).toContainText('spoken correction');
  await shot(page, '21-evidence-sheet');
  await page.getByTestId('sheet-remove-medicine').click();
  await expect(summary).toContainText('1 to check');
  await expect(confirm).toBeDisabled();

  // Accept the other one.
  await page.getByTestId('looks-right-m2.name').click(); // ids are stable: the remaining medicine is still m2
  await expect(summary).not.toContainText('to check');
  await expect(summary).toContainText('1 missing');
  await expect(confirm).toBeDisabled();

  // "Looks right" is not offered for something that was not heard at all.
  await expect(page.getByTestId('looks-right-followUp')).toHaveCount(0);

  // Answer the follow-up.
  await page.getByTestId('row-followUp').getByRole('button', { name: /Open details/ }).click();
  await page.getByTestId('followup-days').check();
  await page.getByTestId('edit-followup-days').fill('14');
  await page.getByTestId('sheet-save').click();
  await expect(summary).toContainText('Everything is checked');
  await expect(confirm).toBeEnabled();
  await expect(page.getByTestId('row-followUp')).toContainText('In 14 days');
  await shot(page, '22-review-all-checked');

  await confirm.click();
  await setPin(page); // the first save asks for a PIN
  await expect(page.getByTestId('confirmed')).toBeVisible();
});

test('a clean note is ready to confirm straight away', async ({ page }) => {
  await openReview(page, 'Patient Noor, thirty-eight years. Complains of fever for three days. Gave paracetamol five hundred milligrams three times a day for three days. Review after three days.');
  await expect(page.getByTestId('summary-bar')).toContainText('Everything is checked');
  await expect(page.getByTestId('confirm-button')).toBeEnabled();
});

test('an item the worker marks "Not applicable" stops blocking, and a typed answer clears the question', async ({ page }) => {
  await openReview(page, 'Patient Ravi, four years. Loose motions since two days. Gave ORS after every loose stool. Review in three days.');
  await expect(page.getByTestId('summary-bar')).toContainText('1 to check');
  await expect(page.getByTestId('row-m1.dose')).toContainText('Dose not heard for ORS');
  await page.getByTestId('row-m1.dose').getByRole('button', { name: /Open details/ }).click();
  await page.getByTestId('sheet-na').click();
  await expect(page.getByTestId('summary-bar')).toContainText('Everything is checked');
  await expect(page.getByTestId('row-m1.dose')).toContainText('Not applicable');
});

test('a value typed outside the sanity range is flagged again', async ({ page }) => {
  await openReview(page, 'Patient Noor, thirty-eight years. Complains of fever for three days. Gave paracetamol five hundred milligrams three times a day for three days. Review after three days.');
  await page.getByTestId('row-patient.ageYears').getByRole('button', { name: /Open details/ }).click();
  await page.getByTestId('edit-number').fill('380');
  await page.getByTestId('sheet-save').click();
  await expect(page.getByTestId('row-patient.ageYears')).toContainText('outside 0–120');
  await expect(page.getByTestId('confirm-button')).toBeDisabled();
});

test('the evidence sheet marks the words a value came from', async ({ page }) => {
  await openReview(page, 'Patient Noor, thirty-eight years. Complains of fever for three days. Gave paracetamol five hundred milligrams three times a day for three days. Review after three days.');
  await page.getByTestId('row-m1.dose').getByRole('button', { name: /Open details/ }).click();
  await expect(page.getByTestId('sheet').locator('mark')).toHaveText('five hundred milligrams');
  await expect(page.getByTestId('sheet')).toContainText('no recording to play');
});

test('every status shows a word and an icon, not colour alone', async ({ page }) => {
  await openReview(page);
  const row = page.getByTestId('row-followUp');
  await expect(row).toContainText('Missing');
  await expect(row.locator('svg')).not.toHaveCount(0);
  await expect(page.getByTestId('row-m2.name')).toContainText('Check');
  await expect(page.getByTestId('row-patient.name')).toContainText('OK');
});

const clip = path.resolve('eval/tts/S03.wav');
test.describe('with audio', () => {
  test.skip(!existsSync(clip), 'Run `npm run tts-audio` first.');

  test('an item from a real recording can play the words it came from', async ({ page }) => {
    await installFakeMic(page, clip);
    await page.goto(BASE);
    await page.evaluate(() => {
      const w = window as unknown as { __starts: number[][] };
      w.__starts = [];
      const original = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when?: number, offset?: number, duration?: number) {
        w.__starts.push([when ?? 0, offset ?? 0, duration ?? -1]);
        return original.call(this, when, offset, duration);
      };
    });
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'New visit' }).click();
    await page.getByTestId('dev-upload').setInputFiles(clip);
    await expect(page.getByTestId('summary-bar')).toBeVisible({ timeout: 120_000 });

    await page.getByTestId('row-complaint.terms').getByRole('button', { name: /Open details/ }).click();
    const play = page.getByTestId('play-evidence').first();
    await expect(play).toBeVisible();
    await play.click();
    const starts = await page.evaluate(() => (window as unknown as { __starts: number[][] }).__starts);
    const [, offset, duration] = starts.at(-1)!;
    expect(offset!).toBeGreaterThan(0);
    expect(duration!).toBeGreaterThan(0.2);
    expect(offset! + duration!).toBeLessThan(13);
    await shot(page, '23-review-from-recording');
  });
});

test.describe('with audio, name and age', () => {
  const s01 = path.resolve('eval/tts/S01.wav');
  test.skip(!existsSync(s01), 'Run `npm run tts-audio` first.');

  test('the name and age rows have a one-tap "Hear it" that plays just those words', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => {
      const w = window as unknown as { __starts: number[][] };
      w.__starts = [];
      const original = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when?: number, offset?: number, duration?: number) {
        w.__starts.push([when ?? 0, offset ?? 0, duration ?? -1]);
        return original.call(this, when, offset, duration);
      };
    });
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'New visit' }).click();
    await page.getByTestId('dev-upload').setInputFiles(s01);
    await expect(page.getByTestId('summary-bar')).toBeVisible({ timeout: 120_000 });

    await page.getByTestId('hear-patient.name').click();
    const starts = await page.evaluate(() => (window as unknown as { __starts: number[][] }).__starts);
    const [, offset, duration] = starts.at(-1)!;
    expect(offset!).toBeGreaterThanOrEqual(0);
    expect(offset!).toBeLessThan(3); // the name is among the first words
    expect(duration!).toBeLessThan(2.5);
    await expect(page.getByTestId('hear-patient.ageYears')).toBeVisible();
  });
});
