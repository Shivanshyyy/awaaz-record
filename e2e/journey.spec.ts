import { expect, test } from './test';
import jsQR from 'jsqr';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { installFakeMic } from './fake-mic';
import { giveConsent, nav, resolveEverything, setPin, shot } from './helpers';

const clip = path.resolve('eval/tts/S01.wav');
const BASE = '/awaaz-record/';
const clips = JSON.parse(readFileSync('src/patient/clips.generated.json', 'utf8')).clips as { id: string; hindi: string; english: string }[];
const byId = (id: string) => clips.find((c) => c.id === id)!;

test.skip(!existsSync(clip), 'Test audio is missing: run `npm run tts-audio` first.');
test.describe.configure({ timeout: 240_000 });

test('the whole visit works offline: consent, record, review, confirm, slip, Hindi playlist', async ({ page, context }) => {
  await installFakeMic(page, clip);
  const requests: string[] = [];
  const failures: string[] = [];
  context.on('request', (r) => requests.push(r.url()));
  page.on('requestfailed', (r) => failures.push(r.url()));

  // Online once: save the speech model on the phone.
  await page.goto(BASE);
  await page.getByTestId('offline-badge').click();
  await page.getByTestId('prepare-button').click();
  await expect(page.getByTestId('offline-ready')).toBeVisible({ timeout: 180_000 });

  // From here on there is no network at all.
  await context.setOffline(true);
  failures.length = 0;
  await page.reload();
  await expect(page.getByTestId('offline-badge')).toContainText('Ready offline');

  // 1. Consent comes first, with the English meaning of the Hindi message.
  await nav(page, 'New visit').click();
  await expect(page.getByTestId('record-button')).toHaveCount(0);
  await expect(page.getByTestId('consent-english')).toContainText(byId('consent').english);
  await page.getByTestId('consent-play').click();
  // No mp3 and no Hindi voice in this browser: the Hindi text is shown, and it says why.
  const outcome = page.getByTestId('consent-outcome');
  await expect(outcome).toContainText('Audio not available');
  await expect(outcome).toContainText(byId('consent').hindi);
  await shot(page, '30-consent');
  await giveConsent(page);

  // 2. Record through the fake microphone, then review.
  await page.getByTestId('record-button').click();
  await expect(page.getByTestId('record-timer')).toBeVisible();
  await page.waitForTimeout(12_900);
  await page.getByTestId('stop-button').click();
  await expect(page.getByTestId('summary-bar')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('audio-state')).toHaveAttribute('data-has-audio', 'true');
  await expect(page.getByTestId('confirm-button')).toBeDisabled();

  // 3. The model heard "Noor, thirty-eight" as something else and nothing flagged it: this is the check the worker
  //    makes by listening. Hear the name, correct it, then resolve what the app did flag.
  await page.getByTestId('hear-patient.name').click();
  await page.getByTestId('row-patient.name').getByRole('button', { name: /Open details/ }).click();
  await page.getByTestId('edit-text').fill('Noor');
  await page.getByTestId('sheet-save').click();
  await page.getByTestId('row-patient.ageYears').getByRole('button', { name: /Open details/ }).click();
  await page.getByTestId('edit-number').fill('38');
  await page.getByTestId('sheet-save').click();
  await resolveEverything(page);
  await page.getByTestId('confirm-button').click();
  await expect(page.getByTestId('pin-new')).toBeVisible();
  await shot(page, '31-set-pin');
  await setPin(page, '4821');
  await expect(page.getByTestId('confirmed')).toBeVisible();

  // 4. The recording is gone from memory, and nothing audio-like was ever stored.
  await expect(page.getByTestId('audio-state')).toHaveAttribute('data-has-audio', 'false');
  const stored = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open('awaaz');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const stores = Array.from(db.objectStoreNames);
    const rows: Record<string, unknown[]> = {};
    for (const name of stores) {
      rows[name] = await new Promise<unknown[]>((resolve) => {
        const req = db.transaction(name).objectStore(name).getAll();
        req.onsuccess = () => resolve(req.result);
      });
    }
    db.close();
    let biggest = 0;
    const text = JSON.stringify(rows, (_k, v) => {
      if (v instanceof Uint8Array || v instanceof ArrayBuffer || v instanceof Blob) {
        biggest = Math.max(biggest, v instanceof Blob ? v.size : v.byteLength);
        return v instanceof Uint8Array ? Array.from(v, (b) => String.fromCharCode(b)).join('') : '[binary]';
      }
      return v;
    });
    const caches = await Promise.all((await caches_().keys()).map(async (name) => ({ name, urls: (await (await caches_().open(name)).keys()).map((r) => r.url) })));
    function caches_() {
      return window.caches;
    }
    return { stores, text: text.toLowerCase(), biggest, caches };
  });
  expect(stored.stores.sort()).toEqual(['meta', 'records', 'tasks']);
  expect(stored.biggest).toBeLessThan(50_000); // a sealed record is a few KB; 11 s of audio would be hundreds of KB
  for (const secret of ['noor', 'neuroplenty', 'fever', 'paracetamol', 'complains', 'patient']) expect(stored.text, secret).not.toContain(secret);
  for (const cache of stored.caches) for (const url of cache.urls) expect(url, cache.name).not.toMatch(/\.(wav|webm|ogg|m4a)(\?|$)|^blob:/);

  // 5. The slip: first name and age only, timing icons with words, a QR that decodes to its summary.
  await expect(page.getByTestId('slip-who')).toHaveText('Noor, 38 y');
  await expect(page.getByTestId('timing-card')).toBeVisible();
  await expect(page.getByTestId('slip-med-m1')).toContainText('Paracetamol 500 mg');
  await expect(page.getByTestId('slip-med-m1')).toContainText('Afternoon');
  await expect(page.getByTestId('slip-follow-up')).toContainText('(in 3 days)');
  const pixels = await page.getByTestId('slip-qr').evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')!;
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { data: Array.from(image.data), width: canvas.width, height: canvas.height };
  });
  const decoded = jsQR(Uint8ClampedArray.from(pixels.data), pixels.width, pixels.height);
  expect(decoded, 'the QR on the slip should be readable').not.toBeNull();
  const who = await page.getByTestId('slip-who').innerText();
  expect(decoded!.data.split('\n')).toEqual(expect.arrayContaining([expect.stringMatching(/^AWAAZ SLIP \d+ Oct 2026$/), who, 'Paracetamol 500 mg 3x/day 3d']));
  await shot(page, '32-slip');

  // 6. The Hindi playlist: every line with its English meaning, then played with the text fallback.
  await expect(page.getByTestId('playlist')).toBeVisible();
  for (const id of ['intro', 'med_3x', 'fu_3', 'worse', 'keep_slip', 'outro']) {
    await expect(page.getByTestId(`clip-${id}`)).toContainText(byId(id).english);
  }
  await expect(page.getByTestId('clip-check-med_finish')).not.toBeChecked();
  await expect(page.getByTestId('clip-check-intro')).toBeDisabled();
  await page.getByTestId('clip-check-keep_slip').uncheck();
  await page.getByTestId('play-all').click();
  await expect(page.getByTestId('clip-status-outro')).toContainText('Audio not available', { timeout: 60_000 });
  await expect(page.getByTestId('clip-status-intro')).toContainText(byId('intro').hindi);
  await expect(page.getByTestId('clip-status-keep_slip')).toHaveCount(0); // unticked, so not played
  await expect(page.getByTestId('clip-status-med_finish')).toHaveCount(0);
  await shot(page, '33-playlist');

  // 7. Nothing left the phone, and nothing local failed while offline.
  const outside = requests.filter((u) => !u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).hostname !== 'localhost');
  expect(outside, `non-local requests: ${outside.join(', ')}`).toEqual([]);
  expect(failures.filter((u) => !u.endsWith('/favicon.ico'))).toEqual([]);
});
