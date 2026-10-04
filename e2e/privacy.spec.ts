import { expect, test } from './test';
import { confirmAndSave, nav, setPin, startFromText, unlock } from './helpers';

test.describe.configure({ timeout: 40_000 });

test('the first save asks for a PIN of 4 to 6 digits, typed twice', async ({ page }) => {
  await startFromText(page);
  await page.getByTestId('confirm-button').click();
  await expect(page.getByTestId('pin-set')).toBeDisabled();

  await page.getByTestId('pin-new').fill('12');
  await page.getByTestId('pin-again').fill('12');
  await expect(page.getByTestId('pin-set')).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('4 to 6 digits');

  await page.getByTestId('pin-new').fill('123456');
  await page.getByTestId('pin-again').fill('123457');
  await expect(page.getByRole('alert')).toContainText('do not match');
  await expect(page.getByTestId('pin-set')).toBeDisabled();

  // letters are not accepted in the box at all
  await page.getByTestId('pin-new').fill('48a2b1');
  await expect(page.getByTestId('pin-new')).toHaveValue('4821');

  await page.getByTestId('pin-again').fill('4821');
  await page.getByTestId('pin-set').click();
  await expect(page.getByTestId('confirmed')).toBeVisible();
});

test('"Not now" on the PIN sheet keeps the record unsaved and open', async ({ page }) => {
  await startFromText(page);
  await page.getByTestId('confirm-button').click();
  await page.getByTestId('pin-cancel').click();
  await expect(page.getByTestId('confirmed')).toHaveCount(0);
  await expect(page.getByTestId('confirm-button')).toBeEnabled();
});

test('locking hides saved records until the PIN is entered; a wrong PIN is refused', async ({ page }) => {
  await startFromText(page);
  await confirmAndSave(page);

  await nav(page, 'Records').click();
  await expect(page.getByTestId('sync-count')).toBeVisible(); // still open from saving
  await page.getByTestId('lock-now').click();
  await expect(page.getByTestId('pin-unlock')).toBeVisible();
  await expect(page.getByText('Noor')).toHaveCount(0);

  await unlock(page, '0000');
  await expect(page.getByTestId('pin-wrong')).toContainText('not right');
  await unlock(page, '4821');
  await expect(page.getByTestId('sync-count')).toContainText('1 waiting for signal');
  await expect(page.getByText('Noor, 38 y')).toBeVisible();

  // Tasks are locked with the same PIN.
  await page.getByTestId('lock-now').click();
  await nav(page, 'Tasks').click();
  await expect(page.getByTestId('pin-unlock')).toBeVisible();
});

test('five wrong PINs pause unlocking for a minute, delete nothing, and the right PIN then works', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-04T10:00:00') });
  await startFromText(page);
  await confirmAndSave(page);
  await nav(page, 'Records').click();
  await page.getByTestId('lock-now').click();

  for (let i = 0; i < 4; i++) await unlock(page, '0000');
  await expect(page.getByTestId('pin-wrong')).toContainText('1 try left');
  await unlock(page, '0000');
  await expect(page.getByTestId('pin-wait')).toContainText('Wait');
  await expect(page.getByTestId('pin-wait')).toContainText('Nothing has been deleted');
  await expect(page.getByTestId('pin-unlock-button')).toBeDisabled();

  // the wait survives a reload: it is stored, not just on screen
  await page.reload();
  await nav(page, 'Records').click();
  await expect(page.getByTestId('pin-wait')).toBeVisible();

  await page.clock.fastForward(61_000);
  await expect(page.getByTestId('pin-wait')).toHaveCount(0);
  await unlock(page, '4821');
  await expect(page.getByText('Noor, 38 y')).toBeVisible();
});

test('two idle minutes lock the app again', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-04T10:00:00') });
  await startFromText(page);
  await confirmAndSave(page);
  await nav(page, 'Records').click();
  await expect(page.getByTestId('sync-count')).toBeVisible();

  await page.clock.fastForward('01:50');
  await expect(page.getByTestId('sync-count')).toBeVisible(); // not yet
  await page.clock.fastForward('00:20');
  await expect(page.getByTestId('pin-unlock')).toBeVisible();
  await unlock(page);
  await expect(page.getByTestId('sync-count')).toBeVisible();
});

test('a touch resets the idle timer', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-04T10:00:00') });
  await startFromText(page);
  await confirmAndSave(page);
  await nav(page, 'Records').click();
  await page.clock.fastForward('01:30');
  await page.mouse.click(5, 300);
  await page.clock.fastForward('01:30');
  await expect(page.getByTestId('sync-count')).toBeVisible();
});

test('if the patient declines, there is no recording and the record is filled in by hand', async ({ page }) => {
  await page.goto('/');
  await nav(page, 'New visit').click();
  await page.getByTestId('consent-decline').click();
  await expect(page.getByTestId('by-hand')).toContainText('did not agree');
  await expect(page.getByTestId('record-button')).toHaveCount(0);
  await expect(page.getByTestId('dev-upload')).toHaveCount(0);
  await expect(page.getByTestId('confirm-button')).toBeDisabled();
  await expect(page.getByTestId('row-patient.name')).toContainText('Missing');

  await page.getByTestId('row-patient.name').getByRole('button', { name: /Open details/ }).click();
  await page.getByTestId('edit-text').fill('Anita');
  await page.getByTestId('sheet-save').click();
  await page.getByTestId('row-complaint.terms').getByRole('button', { name: /Open details/ }).click();
  await page.getByTestId('edit-terms').fill('cough');
  await page.getByTestId('sheet-save').click();
  await page.getByTestId('row-followUp').getByRole('button', { name: /Open details/ }).click();
  await page.getByTestId('followup-none').check();
  await page.getByTestId('sheet-save').click();
  await page.getByTestId('row-advice.tags').getByRole('button', { name: /Open details/ }).click();
  await page.getByLabel('Rest', { exact: true }).check();
  await page.getByTestId('sheet-save').click();
  await expect(page.getByTestId('summary-bar')).toContainText('Everything is checked');

  await page.getByTestId('tab-transcript').click();
  await expect(page.getByTestId('transcript-text')).toContainText('No recording was made');
  await page.getByTestId('tab-record').click();
  await confirmAndSave(page);

  await nav(page, 'Records').click();
  await page.getByText('Anita').click();
  await expect(page.getByTestId('saved-consent')).toContainText('declined');
  await expect(page.getByTestId('audio-state')).toHaveAttribute('data-has-audio', 'false');
});

test('consent given in another language is kept on the record', async ({ page }) => {
  await page.goto('/?dev=1');
  await nav(page, 'New visit').click();
  await expect(page.getByTestId('consent-english')).toContainText('permission');
  await page.getByTestId('consent-verbal').click();
  await expect(page.getByTestId('record-button')).toBeVisible();
  await page.getByTestId('dev-paste').fill('Patient Noor, thirty-eight years. Complains of fever for three days. Gave paracetamol five hundred milligrams three times a day for three days. Review after three days.');
  await page.getByTestId('dev-paste-go').click();
  await confirmAndSave(page);
  await nav(page, 'Records').click();
  await page.getByText('Noor, 38 y').click();
  await expect(page.getByTestId('saved-consent')).toContainText('another language');
});

test('setting a PIN once is enough: a later session only asks for it', async ({ page }) => {
  await startFromText(page);
  await confirmAndSave(page);
  await page.reload();
  await startFromText(page);
  await page.getByTestId('confirm-button').click();
  await expect(page.getByTestId('pin-new')).toHaveCount(0);
  await expect(page.getByTestId('pin-unlock')).toBeVisible();
  await unlock(page);
  await expect(page.getByTestId('confirmed')).toBeVisible();
  void setPin;
});
