import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './test';
import { CLEAN_NOTE, confirmAndSave, nav, setPin, startFromText, withoutHindiAudio } from './helpers';

test.describe.configure({ timeout: 90_000 });

// WCAG 2 A and AA rules: colour contrast, accessible names, roles, labels, landmarks.
async function scan(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const report = results.violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n   ${v.nodes.slice(0, 3).map((n) => n.html.slice(0, 140)).join('\n   ')}`).join('\n');
  expect(results.violations, `${what}\n${report}`).toEqual([]);
}

test('the main screens have no accessibility violations', async ({ page }) => {
  await page.goto('/');
  await scan(page, 'Today (locked)');
  await nav(page, 'New visit').click();
  await scan(page, 'New visit: consent');
  await page.getByTestId('offline-badge').click();
  await scan(page, 'Offline mode');
  await nav(page, 'Records').click();
  await scan(page, 'Records: set a PIN');
  await nav(page, 'Tasks').click();
  await scan(page, 'Tasks: locked');
});

test('the visit flow, the review, the sheets and the slip have no violations', async ({ page }) => {
  await startFromText(page, CLEAN_NOTE.replace('Review after three days.', ''));
  await scan(page, 'Review with open items');
  await page.getByTestId('row-followUp').getByRole('button', { name: /Open details/ }).click();
  await scan(page, 'Evidence sheet with the follow-up editor');
  await page.getByTestId('followup-days').check();
  await scan(page, 'Follow-up editor, days chosen');
  await page.getByTestId('edit-followup-days').fill('3');
  await page.getByTestId('sheet-save').click();
  await page.getByTestId('tab-transcript').click();
  await scan(page, 'Transcript tab');
  await page.getByTestId('tab-record').click();
  await confirmAndSave(page);
  await scan(page, 'Slip, timing card and playlist');
  await page.getByTestId('play-all').click();
  await expect(page.getByTestId('clip-status-outro')).toBeVisible({ timeout: 30_000 });
  await scan(page, 'Playlist after playing (Hindi text shown)');
});

test('records, a saved record and tasks with demo visits have no violations', async ({ page }) => {
  await page.goto('/');
  await nav(page, 'Records').click();
  await setPin(page);
  await page.getByTestId('demo-load').click();
  await scan(page, 'Records list with demo visits');
  await page.getByText('Sunita, 26 y').click();
  await scan(page, 'Saved record');
  await page.getByTestId('saved-tab-slip').click();
  await scan(page, 'Saved record: slip');
  await nav(page, 'Tasks').click();
  await scan(page, 'Tasks list');
  await nav(page, 'Today').click();
  await scan(page, 'Today (summary)');
});

test('the consent step with the Hindi text shown, and the manual form, have no violations', async ({ page }) => {
  await withoutHindiAudio(page);
  await page.goto('/');
  await nav(page, 'New visit').click();
  await page.getByTestId('consent-play').click();
  await expect(page.getByTestId('consent-outcome')).toBeVisible();
  await scan(page, 'Consent with Hindi text');
  await page.getByTestId('consent-decline').click();
  await scan(page, 'Manual form');
});

test('the About screen has no violations and shows the generated results', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('about-link').click();
  await expect(page.getByTestId('about-results')).toContainText('128 of 128');
  await expect(page.getByTestId('about-results')).toContainText('Real human recordings');
  const generated = JSON.parse(readFileSync('src/eval/summary.generated.json', 'utf8'));
  if (generated.primock57) await expect(page.getByTestId('about-primock')).toContainText(`${generated.primock57.wordErrors} of ${generated.primock57.words} words were wrong`);
  else await expect(page.getByTestId('about-primock')).toHaveCount(0);
  if (generated.accent) {
    const [india, usa] = [generated.accent.find((g: { group: string }) => g.group === 'india'), generated.accent.find((g: { group: string }) => g.group === 'usa')];
    await expect(page.getByTestId('about-accent')).toContainText(`${(india.wer * 100).toFixed(1)}% of words wrong`);
    await expect(page.getByTestId('about-accent')).toContainText(`against ${(usa.wer * 100).toFixed(1)}%`);
  } else await expect(page.getByTestId('about-accent')).toHaveCount(0);
  await expect(page.getByText('never diagnoses')).toBeVisible();
  await expect(page.getByTestId('about-version')).toContainText(/Version ([0-9a-f]{7}(-dirty)?|unknown), built \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/);
  await scan(page, 'About, evidence and limits');
});

test('canary: the scanner really does catch low contrast and an unlabelled button', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', '<p style="color:#cccccc;background:#ffffff;font-size:16px">faint text</p><button><svg width="10" height="10"></svg></button>');
  });
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const ids = results.violations.map((v) => v.id);
  expect(ids).toContain('color-contrast');
  expect(ids).toContain('button-name');
});

test('"Check this phone" lists what the phone can do in plain words, without violations', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('offline-badge').click();
  await page.getByTestId('phone-check').click();
  const results = page.getByTestId('phone-check-results');
  await expect(results).toContainText('Microphone and recording: OK');
  await expect(results).toContainText('Running the speech model: OK');
  await expect(results).toContainText('Working with no internet: OK');
  await expect(results).toContainText('Locked storage for records: OK');
  await expect(results).toContainText('Free space');
  // the test browser has no Hindi voice (the speech engine is silent), so the check says so as a warning, not a failure
  await expect(results.locator('li[data-status="warn"]').filter({ hasText: 'Hindi voice' })).toHaveCount(1);
  await expect(results.locator('li[data-status="fail"]')).toHaveCount(0);
  await scan(page, 'Offline mode with the phone check');
});
