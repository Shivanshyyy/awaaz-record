import { expect, test } from './test';
import { confirmAndSave, resolveEverything, startFromText } from './helpers';

test('the status chip shows online or offline and the bytes the app has sent, and a real upload moves the number', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByTestId('net-state')).toContainText('Online');
  await expect(page.getByTestId('net-sent')).toContainText('0 B');

  await context.setOffline(true);
  await expect(page.getByTestId('net-state')).toContainText('Offline');
  await context.setOffline(false);

  // Control: the meter is not stuck at zero. A 2,000-byte upload to our own server is counted.
  await page.evaluate(() => fetch('/__probe', { method: 'POST', body: 'x'.repeat(2000) }).catch(() => null));
  await expect(page.getByTestId('net-sent')).toContainText('2.0 KB');
  await page.getByTestId('net-chip').click();
  await expect(page.getByTestId('net-panel')).toContainText('2000 bytes');
  await expect(page.getByTestId('net-panel')).toContainText('0 to other servers');
});

test('the details panel shows timings measured for the visit: filling the record, then encrypting and saving', async ({ page }) => {
  await startFromText(page);
  await page.getByTestId('net-chip').click();
  const timings = page.getByTestId('net-timings');
  await expect(timings).toContainText(/Filling the record: \d+(\.\d+)? (ms|s)/);
  await expect(timings).toContainText('Encrypting and saving: not measured yet');
  await page.getByTestId('net-chip').click();

  await resolveEverything(page);
  await confirmAndSave(page);
  await page.getByTestId('net-chip').click();
  await expect(page.getByTestId('net-timings')).toContainText(/Encrypting and saving: \d+(\.\d+)? (ms|s)/);
  await expect(page.getByTestId('net-sent')).toContainText('0 B');
});
