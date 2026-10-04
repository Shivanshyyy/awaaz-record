import type { Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ffmpeg from 'ffmpeg-static';
import { expect, test } from './test';
import { confirmAndSave, shot, startFromText, withoutHindiAudio } from './helpers';

test.describe.configure({ timeout: 60_000 });

const clips = JSON.parse(readFileSync('src/patient/clips.generated.json', 'utf8')).clips as { id: string; hindi: string; english: string }[];
const byId = (id: string) => clips.find((c) => c.id === id)!;
const TWICE =
  'Patient Noor Fatima, thirty-eight years. Complains of fever for three days. Gave paracetamol five hundred milligrams twice a day after food for three days. Advised plenty of fluids. Review in one week.';

async function slipFor(page: Page, text = TWICE) {
  await startFromText(page, text);
  await confirmAndSave(page);
}

test('the worker sees how each medicine will be drawn on the slip, and can change it', async ({ page }) => {
  await slipFor(page);
  const card = page.getByTestId('timing-card');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('mapping-m1')).toHaveText('2 times a day is drawn as morning, night.');
  const med = page.getByTestId('slip-med-m1');
  await expect(med).toContainText('Morning');
  await expect(med).toContainText('Night');
  await expect(med).not.toContainText('Afternoon');

  await page.getByTestId('slot-m1-afternoon').click();
  await expect(med).toContainText('Afternoon');
  await expect(page.getByTestId('mapping-m1')).toContainText('You changed the icons');
  await page.getByTestId('slot-m1-night').click();
  await expect(med).not.toContainText('Night');
  await page.getByRole('button', { name: 'Undo my change' }).click();
  await expect(page.getByTestId('mapping-m1')).toHaveText('2 times a day is drawn as morning, night.');
  await expect(med).toContainText('Night');
  await shot(page, '34-timing-card');
});

test('the slip has a first name and age only, the medicine details, and the Hindi lines copied from the clip list', async ({ page }) => {
  await slipFor(page);
  const slip = page.getByTestId('slip');
  await expect(page.getByTestId('slip-who')).toHaveText('Noor, 38 y');
  await expect(slip).not.toContainText('Fatima');
  await expect(slip).toContainText('Paracetamol 500 mg');
  await expect(slip).toContainText('2 times a day');
  await expect(slip).toContainText('After food');
  await expect(slip).toContainText('for 3 days');
  await expect(page.getByTestId('slip-follow-up')).toContainText('(in 7 days)');
  for (const id of ['med_2x', 'med_after_food', 'adv_water', 'fu_7', 'worse', 'keep_slip']) {
    await expect(slip, id).toContainText(byId(id).hindi);
  }
  // every Hindi line on the slip comes with its English meaning for the worker, hidden when printed
  await expect(slip.getByText(byId('med_2x').english)).toBeVisible();
});

test('printing keeps only the slip: navigation, buttons and English notes are hidden', async ({ page }) => {
  await slipFor(page);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('slip')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  await expect(page.getByTestId('print-slip')).toBeHidden();
  await expect(page.getByTestId('timing-card')).toBeHidden();
  await expect(page.getByTestId('playlist')).toBeHidden();
  await expect(page.getByTestId('slip').getByText(byId('med_2x').english)).toBeHidden();
  await expect(page.getByTestId('slip').getByText(byId('med_2x').hindi)).toBeVisible();
});

test('the Hindi lines are listed with their English meaning first; only the opening and closing are fixed', async ({ page }) => {
  await slipFor(page);
  const list = page.getByTestId('playlist');
  for (const id of ['intro', 'med_2x', 'med_after_food', 'adv_water', 'fu_7', 'worse', 'keep_slip', 'outro']) {
    await expect(page.getByTestId(`clip-${id}`)).toContainText(byId(id).english);
    // the Hindi text is not shown before a line has been played
    await expect(page.getByTestId(`clip-${id}`)).not.toContainText(byId(id).hindi);
  }
  await expect(list.getByTestId('clip-check-intro')).toBeDisabled();
  await expect(list.getByTestId('clip-check-outro')).toBeDisabled();
  await expect(list.getByTestId('clip-check-med_finish')).not.toBeChecked();
  await expect(list.getByTestId('clip-check-adv_water')).toBeChecked();
  await expect(page.getByText('has not yet been checked by a Hindi speaker').first()).toBeVisible();
});

test('with no audio files and no Hindi voice, each ticked line shows its Hindi text and says audio is not available', async ({ page }) => {
  await withoutHindiAudio(page);
  await slipFor(page);
  await page.getByTestId('clip-check-adv_water').uncheck();
  await page.getByTestId('clip-check-med_finish').check();
  await page.getByTestId('play-all').click();
  await expect(page.getByTestId('clip-status-outro')).toBeVisible({ timeout: 30_000 });
  for (const id of ['intro', 'med_2x', 'med_finish', 'fu_7', 'worse', 'keep_slip', 'outro']) {
    await expect(page.getByTestId(`clip-status-${id}`)).toContainText('Audio not available');
    await expect(page.getByTestId(`clip-status-${id}`)).toContainText(byId(id).hindi);
  }
  await expect(page.getByTestId('clip-status-adv_water')).toHaveCount(0);
});

test('a Hindi voice on the phone is used when there is no mp3, and only ever speaks the Hindi text', async ({ page }) => {
  await withoutHindiAudio(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __spoken: { text: string; lang: string }[]; SpeechSynthesisUtterance: unknown };
    w.__spoken = [];
    const voice = { lang: 'hi-IN', name: 'Test Hindi voice', default: false, localService: true, voiceURI: 'test-hi' };
    const english = { lang: 'en-US', name: 'Test English voice', default: true, localService: true, voiceURI: 'test-en' };
    w.SpeechSynthesisUtterance = class {
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      voice: unknown = null;
      lang = '';
      rate = 1;
      constructor(public text: string) {}
    };
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [english, voice],
        addEventListener() {},
        removeEventListener() {},
        cancel() {},
        speak(u: { text: string; lang: string; onend: (() => void) | null }) {
          w.__spoken.push({ text: u.text, lang: u.lang });
          setTimeout(() => u.onend?.(), 5);
        },
      },
    });
  });
  await slipFor(page);
  await page.getByTestId('play-all').click();
  await expect(page.getByTestId('clip-status-outro')).toContainText('Hindi voice', { timeout: 30_000 });
  const spoken = await page.evaluate(() => (window as unknown as { __spoken: { text: string; lang: string }[] }).__spoken);
  expect(spoken.map((s) => s.text)).toEqual(['intro', 'med_2x', 'med_after_food', 'adv_water', 'fu_7', 'worse', 'keep_slip', 'outro'].map((id) => byId(id).hindi));
  expect(spoken.every((s) => s.lang === 'hi-IN')).toBe(true);
});

test.describe('with an mp3 file', () => {
  // The service worker would answer the clip list from its own cache, so the test serves the files over the network instead.
  test.use({ serviceWorkers: 'block' });

test('an mp3 file for a line is played in preference to a voice', async ({ page }) => {
  const mp3 = execFileSync(ffmpeg as string, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.4', '-codec:a', 'libmp3lame', '-b:a', '32k', '-f', 'mp3', 'pipe:1']);
  await page.route('**/audio/hi/manifest.json', (route) => route.fulfill({ json: { clips: { intro: { bytes: mp3.length } } } }));
  await page.route('**/audio/hi/intro.mp3', (route) => route.fulfill({ body: mp3, contentType: 'audio/mpeg' }));
  await slipFor(page);
  await page.getByTestId('clip-play-intro').click();
  await expect(page.getByTestId('clip-status-intro')).toContainText('Played from the recording', { timeout: 15_000 });
  await expect(page.getByTestId('clip-status-intro')).not.toContainText(byId('intro').hindi);
  // a line without a file still falls back
  await page.getByTestId('clip-play-outro').click();
  await expect(page.getByTestId('clip-status-outro')).toContainText('Audio not available');
});
});

test('a medicine only when needed has the "when needed" icon, and four a day has plain words', async ({ page }) => {
  await slipFor(page, 'Patient Ravi, 40. Cough for 2 days. Gave paracetamol 500 mg when needed. Gave amoxicillin 250 mg four times a day for 5 days. Review in 5 days.');
  await expect(page.getByTestId('slip-med-m1')).toContainText('When needed');
  await expect(page.getByTestId('slip-med-m2')).toContainText('4 times a day');
  await expect(page.getByTestId('mapping-m1')).toContainText('"when needed" icon');
  await expect(page.getByTestId('slip-med-m1')).toContainText(byId('med_multi').hindi);
});

test('the clinic name is a setting printed on the slip', async ({ page }) => {
  await slipFor(page);
  await expect(page.getByTestId('slip')).toContainText('Health centre');
  await page.getByTestId('clinic-name').fill('Sunrise PHC');
  await page.getByTestId('clinic-save').click();
  await expect(page.getByTestId('slip')).toContainText('Sunrise PHC');
  await page.reload();
  await slipFor(page);
  await expect(page.getByTestId('slip')).toContainText('Sunrise PHC');
});
