import { expect, test } from './test';
import { shot } from './helpers';

const TABS = [
  { label: 'Today', heading: 'Today', shot: '00-today' },
  { label: 'New visit', heading: 'New visit', shot: '01-new-visit' },
  { label: 'Records', heading: 'Records', shot: '02-records' },
  { label: 'Tasks', heading: 'Tasks', shot: '03-tasks' },
];

test('shell fits 360 px, has four 48 px tabs, and every tab opens', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Awaaz Record', level: 1 })).toBeVisible();

  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const tab of TABS) {
    const button = nav.getByRole('button', { name: tab.label });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(48);
    expect(box!.width).toBeGreaterThanOrEqual(48);

    await button.click();
    await expect(page.getByRole('heading', { name: tab.heading, level: 2 })).toBeVisible();
    await expect(button).toHaveAttribute('aria-current', 'page');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(page, tab.shot);
  }
});

test('app shell loads again with the network off', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Awaaz Record', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
});

test('the app can be installed: a manifest with name, scope, standalone display and real icons, and a service worker', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifestUrl = new URL(href!, page.url());
  const manifest = await (await request.get(manifestUrl.toString())).json();
  expect(manifest).toMatchObject({ name: 'Awaaz Record', start_url: '/', scope: '/', display: 'standalone' });
  const icons = manifest.icons as { src: string; sizes: string }[];
  expect(icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const icon of icons) expect((await request.get(new URL(icon.src, manifestUrl).toString())).ok(), icon.src).toBe(true);
  expect(await page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).active))).toBe(true);
});
