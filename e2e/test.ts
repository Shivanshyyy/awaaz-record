import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';

// The Mac running these tests has system voices, including Hindi ones, and Chromium would speak aloud through
// the speakers. Every test starts with a silent speech engine that has no voices; a test that needs a Hindi voice
// installs its own fake one after this.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      const silent = { getVoices: () => [], speak() {}, cancel() {}, pause() {}, resume() {}, addEventListener() {}, removeEventListener() {}, speaking: false, pending: false, paused: false };
      Object.defineProperty(window, 'speechSynthesis', { value: silent, configurable: true, writable: true });
    });
    await use(page);
  },
});
