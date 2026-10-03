import { expect, test } from './test';
import { shot } from './helpers';

const TABS = [
  { label: 'Today', heading: 'Today', shot: '00-today' },
  { label: 'New visit', heading: 'New visit', shot: '01-new-visit' },
  { label: 'Records', heading: 'Records', shot: '02-records' },
  { label: 'Tasks', heading: 'Tasks', shot: '03-tasks' },
];

test('shell fits 360 px, has four 48 px tabs, and every tab opens', async ({ page }) => {
  await page.goto('/awaaz-record/');
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
  await page.goto('/awaaz-record/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Awaaz Record', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
});
