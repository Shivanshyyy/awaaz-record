import { expect, test } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { installDeniedMic, installFakeMic } from './fake-mic';
import { shot } from './helpers';

const clip = path.resolve('eval/tts/S01.wav');
const BASE = '/awaaz-record/';

test.skip(!existsSync(clip), 'Test audio is missing: run `npm run tts-audio` first (needs a text-to-speech voice).');

test.beforeEach(async ({ page }) => {
  // Plays the TTS-synthetic S01 clip once. A pipeline check, not an accuracy measurement.
  await installFakeMic(page, clip);
});

test('prepare online, then record and transcribe with the network off', async ({ page, context }) => {
  const requests: string[] = [];
  const failures: string[] = [];
  context.on('request', (request) => requests.push(request.url()));
  page.on('requestfailed', (request) => failures.push(request.url()));
  page.on('pageerror', (error) => console.log('page error:', error.message));

  // 1. Online, once: download the speech model into the phone's own storage.
  await page.goto(BASE);
  await page.getByTestId('offline-badge').click();
  await expect(page.getByTestId('prepare-size')).toContainText('MB');
  await shot(page, '10-prepare-offline');
  await page.getByTestId('prepare-button').click();
  await expect(page.getByTestId('offline-ready')).toBeVisible({ timeout: 180_000 });
  await shot(page, '11-ready-offline');

  // 2. Network off, fresh load.
  await context.setOffline(true);
  const offlineFrom = requests.length;
  failures.length = 0;
  await page.reload();
  await expect(page.getByTestId('offline-badge')).toContainText('Ready offline');
  // Control: a request for something that was never cached must fail, so "offline" really is offline.
  const networkReachable = await page.evaluate(async () => {
    try {
      await fetch(`/awaaz-record/__probe_${Date.now()}.txt`, { cache: 'no-store' });
      return true;
    } catch {
      return false;
    }
  });
  expect(networkReachable).toBe(false);

  // A heartbeat on the page: if transcription blocked the UI thread, this would show a long gap.
  await page.evaluate(() => {
    const w = window as unknown as { __gaps: number[] };
    w.__gaps = [];
    let last = performance.now();
    setInterval(() => {
      const now = performance.now();
      w.__gaps.push(now - last);
      last = now;
    }, 50);
  });

  // 3. Record through the fake microphone.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'New visit' }).click();
  await page.getByTestId('record-button').click();
  await expect(page.getByTestId('record-timer')).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, '12-recording');
  const clipSeconds = 11.4;
  await page.waitForTimeout((clipSeconds + 1.5) * 1000);
  const timerText = await page.getByTestId('record-timer').innerText();
  expect(timerText).toMatch(/0:1\d/);
  await page.getByTestId('stop-button').click();

  // 4. Transcribing: progress shown, then the transcript.
  await expect(page.getByTestId('working-status')).toBeVisible();
  await shot(page, '13-transcribing');
  await expect(page.getByTestId('transcript-text')).toBeVisible({ timeout: 120_000 });
  const transcript = (await page.getByTestId('transcript-text').innerText()).replace(/\s+/g, ' ').trim();
  console.log('TRANSCRIPT (TTS-synthetic S01):', transcript);
  await shot(page, '14-transcript');
  expect(transcript.split(' ').length).toBeGreaterThan(10);
  expect(transcript).toMatch(/fever/i);
  expect(transcript).toMatch(/500/);
  expect(transcript).toMatch(/review/i);

  const stats = page.getByTestId('asr-stats');
  const audioSeconds = Number(await stats.getAttribute('data-audio-seconds'));
  const ms = Number(await stats.getAttribute('data-ms'));
  const loadMs = Number(await stats.getAttribute('data-load-ms'));
  console.log(`TIMING: ${audioSeconds} s of audio transcribed in ${ms} ms (model load wait ${loadMs} ms)`);

  // 5. The UI thread stayed responsive.
  const gaps = await page.evaluate(() => (window as unknown as { __gaps: number[] }).__gaps);
  const maxGap = Math.max(...gaps);
  console.log(`UI heartbeat: ${gaps.length} ticks, longest gap ${Math.round(maxGap)} ms`);
  expect(gaps.length).toBeGreaterThan(100);
  expect(maxGap).toBeLessThan(1000);

  // 6. Nothing left the origin, ever, and nothing local failed once the network was off.
  const external = requests.filter((url) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return false;
    return new URL(url).hostname !== 'localhost';
  });
  expect(external, `non-local requests: ${external.join(', ')}`).toEqual([]);
  const offlineFailures = failures.filter((url) => !url.endsWith('/favicon.ico') && !url.includes('__probe_'));
  expect(offlineFailures, `failed while offline: ${offlineFailures.join(', ')}`).toEqual([]);
  console.log(`requests while offline: ${requests.length - offlineFrom}, all local and served from the app's own storage`);

  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    'test-results/asr-timing.json',
    JSON.stringify({ clip: 'S01 (TTS-synthetic)', audioSeconds, transcribeMs: ms, loadMs, transcript, maxUiGapMs: Math.round(maxGap) }, null, 2),
  );
});

test('a blocked microphone shows plain help and a way to try again', async ({ page }) => {
  await installDeniedMic(page);
  await page.goto(BASE);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'New visit' }).click();
  await page.getByTestId('record-button').click();
  await expect(page.getByRole('alert')).toContainText('microphone is blocked');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('tapping a word plays that word from the recording', async ({ page }) => {
  await page.goto(`${BASE}?dev=1`);
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
  await page.getByTestId("dev-upload").setInputFiles(clip);
  await expect(page.getByTestId('transcript-text')).toBeVisible({ timeout: 120_000 });

  const words = page.getByTestId('transcript-text').getByRole('button');
  expect(await words.count()).toBeGreaterThan(10);
  const fever = page.getByTestId('transcript-text').getByRole('button', { name: /^fever/i });
  await fever.click();
  await expect(fever).toHaveAttribute('aria-pressed', 'true');

  const starts = await page.evaluate(() => (window as unknown as { __starts: number[][] }).__starts);
  const [, offset, duration] = starts.at(-1)!;
  expect(offset!).toBeGreaterThan(1); // "fever" is not the first word
  expect(offset!).toBeLessThan(11.4);
  expect(duration!).toBeGreaterThan(0.1);
  expect(duration!).toBeLessThan(2);
});

test('a silent recording is refused instead of being sent to the model', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const destination = context.createMediaStreamDestination();
      const silence = context.createConstantSource();
      silence.offset.value = 0;
      silence.connect(destination);
      silence.start();
      return destination.stream;
    };
  });
  await page.goto(BASE);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'New visit' }).click();
  await page.getByTestId('record-button').click();
  await page.waitForTimeout(2500);
  await page.getByTestId('stop-button').click();
  await expect(page.getByRole('alert')).toContainText('No speech was heard');
  await expect(page.getByTestId('transcript-text')).toHaveCount(0);
});

test('timing for a clip of about 15 seconds (TTS-synthetic S04)', async ({ page }) => {
  const longClip = path.resolve('eval/tts/S04.wav');
  await page.goto(`${BASE}?dev=1`);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'New visit' }).click();
  await page.getByTestId('dev-upload').setInputFiles(longClip);
  await expect(page.getByTestId('transcript-text')).toBeVisible({ timeout: 120_000 });
  // The first run also loads the model; transcribe the same clip again for the warm figure.
  const first = page.getByTestId('asr-stats');
  const coldMs = Number(await first.getAttribute('data-ms'));
  const coldLoad = Number(await first.getAttribute('data-load-ms'));
  await page.getByTestId('dev-upload').setInputFiles(longClip);
  await expect(page.getByTestId('working-status')).toBeVisible();
  await expect(page.getByTestId('transcript-text')).toBeVisible({ timeout: 120_000 });
  const audioSeconds = Number(await first.getAttribute('data-audio-seconds'));
  const warmMs = Number(await first.getAttribute('data-ms'));
  console.log(`TIMING S04: ${audioSeconds} s of audio; first run ${coldMs} ms (+${coldLoad} ms model load), second run ${warmMs} ms`);
  console.log('TRANSCRIPT (TTS-synthetic S04):', (await page.getByTestId('transcript-text').innerText()).replace(/\s+/g, ' ').trim());
  expect(warmMs).toBeGreaterThan(0);
});
