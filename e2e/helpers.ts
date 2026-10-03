import type { Page } from '@playwright/test';

// Screenshots are written only with `npm run e2e:shots`, so normal runs don't churn the PNGs in git.
export async function shot(page: Page, name: string) {
  if (process.env.SCREENSHOTS) await page.screenshot({ path: `docs/screens/${name}.png` });
}
