import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from './test';

const BASE = '/';
const WASM = 'ort/ort-wasm-simd-threaded.jsep.wasm';

test.describe('a download that drops', () => {
  test.describe.configure({ timeout: 240_000 });
  // The page's own downloader is under test, so the service worker stays out of the way.
  test.use({ serviceWorkers: 'block' });

  test('a download that drops part-way continues from where it stopped, and the saved file is exact', async ({ page }) => {
    const seen: (string | null)[] = [];
    await page.route(`**/${WASM}`, async (route) => {
      const range = route.request().headers()['range'] ?? null;
      seen.push(range);
      if (seen.length > 1) return route.continue();
      const real = await route.fetch();
      const full = await real.body();
      return route.fulfill({ status: 200, headers: { ...real.headers(), 'content-length': String(Math.floor(full.length * 0.4)) }, body: full.subarray(0, Math.floor(full.length * 0.4)) });
    });

    await page.goto(BASE);
    await page.getByTestId('offline-badge').click();
    await page.getByTestId('prepare-button').click();
    await expect(page.getByRole('button', { name: 'Reload the app' })).toBeVisible({ timeout: 180_000 });

    const real = readFileSync(`dist/${WASM}`);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBeNull();
    const start = Number(/^bytes=(\d+)-$/.exec(seen[1] ?? '')?.[1]);
    expect(start).toBe(Math.floor(real.length * 0.4));

    const saved = await page.evaluate(async (url) => {
      const cache = await caches.open('awaaz-offline-v1');
      const hit = await cache.match(url);
      const bytes = new Uint8Array(await hit!.arrayBuffer());
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return { length: bytes.length, sha256: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('') };
    }, `${BASE}${WASM}`);
    expect(saved.length).toBe(real.length);
    expect(saved.sha256).toBe(createHash('sha256').update(real).digest('hex'));
  });
});

test.describe('the host and the service worker', () => {
  test('a ranged request for a model file works through both', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    const part = await page.evaluate(async (url) => {
      const res = await fetch(url, { headers: { Range: 'bytes=100-199' }, cache: 'no-store' });
      return { status: res.status, range: res.headers.get('content-range'), length: (await res.arrayBuffer()).byteLength };
    }, `${BASE}${WASM}`);
    const total = readFileSync(`dist/${WASM}`).length;
    expect(part).toEqual({ status: 206, range: `bytes 100-199/${total}`, length: 100 });
  });
});
