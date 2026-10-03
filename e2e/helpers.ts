import { expect, type Page } from '@playwright/test';

// Screenshots are written only with `npm run e2e:shots`, so normal runs don't churn the PNGs in git.
export async function shot(page: Page, name: string) {
  if (process.env.SCREENSHOTS) await page.screenshot({ path: `docs/screens/${name}.png` });
}

export const nav = (page: Page, tab: 'Today' | 'New visit' | 'Records' | 'Tasks') =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: tab });

export async function giveConsent(page: Page) {
  await page.getByTestId('consent-agree').click();
}

export async function setPin(page: Page, pin = '4821') {
  await page.getByTestId('pin-new').fill(pin);
  await page.getByTestId('pin-again').fill(pin);
  await page.getByTestId('pin-set').click();
}

export async function unlock(page: Page, pin = '4821') {
  await page.getByTestId('pin-unlock').fill(pin);
  await page.getByTestId('pin-unlock-button').click();
  // wait for the attempt to finish: the button says "Opening…" while it works, and the panel goes away on success
  await page.waitForFunction(() => document.querySelector('[data-testid=pin-unlock-button]')?.textContent !== 'Opening…');
}

/** Answers whatever is still amber or red the way a careful worker would, so the record can be confirmed. */
export async function resolveEverything(page: Page) {
  const confirm = page.getByTestId('confirm-button');
  for (let guard = 0; guard < 25 && (await confirm.isDisabled()); guard++) {
    const open = page.locator('[data-testid^="row-"][data-status="check"], [data-testid^="row-"][data-status="missing"]').first();
    await open.getByRole('button', { name: /Open details/ }).click();
    const sheet = page.getByTestId('sheet');
    const id = (await open.getAttribute('data-testid'))!.replace('row-', '');

    if (id === 'followUp') {
      await page.getByTestId('followup-days').check();
      await page.getByTestId('edit-followup-days').fill('3');
      await page.getByTestId('sheet-save').click();
    } else if (id === 'patient.name') {
      await page.getByTestId('edit-text').fill('Noor');
      await page.getByTestId('sheet-save').click();
    } else if (id === 'complaint.terms') {
      await page.getByTestId('edit-terms').fill('fever');
      await page.getByTestId('sheet-save').click();
    } else if (id.endsWith('.name')) {
      await page.getByTestId('edit-medicine').fill('paracetamol');
      await page.getByTestId('sheet-save').click();
    } else if (id.endsWith('.dose')) {
      await page.getByTestId('edit-dose').fill('500');
      await page.getByTestId('edit-unit').selectOption('mg');
      await page.getByTestId('sheet-save').click();
    } else if (id.endsWith('.perDay')) {
      await page.getByTestId('edit-frequency').selectOption('3');
      await page.getByTestId('sheet-save').click();
    } else if (id.endsWith('.durationDays')) {
      await page.getByTestId('edit-days').fill('3');
      await page.getByTestId('sheet-save').click();
    } else if (await sheet.getByTestId('sheet-looks-right').count()) {
      await sheet.getByTestId('sheet-looks-right').click();
    } else {
      await sheet.getByTestId('sheet-na').click();
    }
    await expect(sheet).toHaveCount(0);
  }
  await expect(confirm).toBeEnabled();
}

export const CLEAN_NOTE =
  'Patient Noor Fatima, thirty-eight years. Complains of fever for three days. Gave paracetamol five hundred milligrams three times a day for three days. Review after three days.';

/** Opens New visit and reviews a pasted transcript (the developer helper), with consent taken verbally. */
export async function startFromText(page: Page, text = CLEAN_NOTE, base = '/awaaz-record/?dev=1') {
  await page.goto(base);
  await nav(page, 'New visit').click();
  await page.getByTestId('dev-paste').fill(text);
  await page.getByTestId('dev-paste-go').click();
  await expect(page.getByTestId('summary-bar')).toBeVisible();
}

/** Confirms the open record, setting a PIN if this is the first save, and waits for the saved notice. */
export async function confirmAndSave(page: Page, pin = '4821') {
  await page.getByTestId('confirm-button').click();
  if (await page.getByTestId('pin-new').isVisible()) await setPin(page, pin);
  else if (await page.getByTestId('pin-unlock').isVisible()) await unlock(page, pin);
  await expect(page.getByTestId('confirmed')).toBeVisible();
}
