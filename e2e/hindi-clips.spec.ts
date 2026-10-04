import { expect, test } from './test';
import { nav } from './helpers';

test('all 23 real Hindi clips are served with the network off, at the size the manifest says', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  const clips = await page.evaluate(async () => {
    const manifest = (await (await fetch('/audio/hi/manifest.json')).json()) as { clips: Record<string, { bytes: number }> };
    const out: { id: string; ok: boolean; bytes: number; want: number }[] = [];
    for (const [id, { bytes }] of Object.entries(manifest.clips)) {
      const response = await fetch(`/audio/hi/${id}.mp3`);
      out.push({ id, ok: response.ok, bytes: (await response.arrayBuffer()).byteLength, want: bytes });
    }
    return out;
  });
  expect(clips).toHaveLength(23);
  for (const c of clips) expect(c, c.id).toMatchObject({ ok: true, bytes: c.want });
});

test('the real consent clip plays from the recording, not from the text fallback', async ({ page }) => {
  await page.goto('/');
  await nav(page, 'New visit').click();
  await page.getByTestId('consent-play').click();
  // consent.mp3 is about 16 seconds long, so the result appears when it has played to the end
  await expect(page.getByTestId('consent-outcome')).toContainText('Played from the recording', { timeout: 60_000 });
  await expect(page.getByTestId('consent-outcome')).not.toContainText('Audio not available');
});
