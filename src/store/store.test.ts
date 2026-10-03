import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractRecord } from '../extract';
import { textToTranscript } from '../extract/transcript-from-text';
import { confirmRecord } from '../record/edit';
import { calibrateIterations, deriveKey, isValidPin, MAX_ITERATIONS, MIN_ITERATIONS, open, seal, WrongPinError } from './crypto';
import { createVault, DB_NAME, getLockout, hasPin, listRecords, listTasks, LockedOutError, LOCKOUT_MS, resetDatabase, saveRecord, saveTask, setSyncState, unlockVault } from './db';
import { dueText, patientLabel, sortTasks, tasksFor, type Task } from './tasks';

const NOTE =
  'Patient Noor Fatima, thirty-eight years. Complains of fever for three days. Gave paracetamol five hundred milligrams three times a day for three days. Referred to the district hospital today. Review after three days.';
const record = () => confirmRecord(extractRecord(textToTranscript(NOTE), { visitDate: '2026-10-04', id: 'rec-1' }));

// A second connection is how the tests look at the raw rows; each one is closed so the next test can reset the database.
const connections: Awaited<ReturnType<typeof openDB>>[] = [];
async function rawDb() {
  const connection = await openDB(DB_NAME);
  connections.push(connection);
  return connection;
}

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  connections.splice(0).forEach((c) => c.close());
});

describe('the PIN', () => {
  it('accepts only 4 to 6 digits', () => {
    for (const ok of ['1234', '12345', '123456']) expect(isValidPin(ok)).toBe(true);
    for (const bad of ['123', '1234567', 'abcd', '12 34', '']) expect(isValidPin(bad)).toBe(false);
  });

  it('is calibrated between 200k and 600k rounds', async () => {
    const n = await calibrateIterations();
    expect(n).toBeGreaterThanOrEqual(MIN_ITERATIONS);
    expect(n).toBeLessThanOrEqual(MAX_ITERATIONS);
  });
});

describe('a saved record', () => {
  it('opens with the right PIN and not with a wrong one', async () => {
    const key = await createVault('4821');
    await saveRecord(key, record());

    const reopened = await unlockVault('4821');
    const [back] = await listRecords(reopened);
    expect(back!.patient.name.value).toBe('Noor');
    expect(back!.transcript.text).toBe(NOTE);

    await expect(unlockVault('1111')).rejects.toBeInstanceOf(WrongPinError);
    // Even with the vault's own salt and rounds, a key from the wrong PIN cannot open the sealed body.
    const raw0 = await rawDb();
    const meta = await raw0.get('meta', 'vault');
    const wrongKey = await deriveKey('1111', meta.salt, meta.iterations);
    const raw = await raw0.getAll('records');
    await expect(open(wrongKey, raw[0], raw[0].id)).rejects.toBeInstanceOf(WrongPinError);
  });

  it('leaves no name, transcript or medicine in the raw rows', async () => {
    const key = await createVault('4821');
    const rec = record();
    await saveRecord(key, rec);
    for (const task of tasksFor(rec)) await saveTask(key, task);

    const raw = await rawDb();
    const rows = [...(await raw.getAll('records')), ...(await raw.getAll('tasks')), ...(await raw.getAll('meta'))];
    const dump = rows
      .map((row) => JSON.stringify(row, (_k, v) => (v instanceof Uint8Array ? String.fromCharCode(...v) : v)))
      .join('\n')
      .toLowerCase();
    for (const secret of ['noor', 'fatima', 'fever', 'paracetamol', 'district hospital', 'complains']) {
      expect(dump, secret).not.toContain(secret);
    }
    // what is stored in the clear: ids, timestamps and states only
    const stored = (await raw.getAll('records'))[0]!;
    expect(Object.keys(stored).sort()).toEqual(['createdAt', 'ct', 'id', 'iv', 'status', 'sync']);
  });

  it('cannot be moved to another record or altered without detection', async () => {
    const key = await createVault('4821');
    const sealed = await seal(key, { secret: 1 }, 'rec-1');
    await expect(open(key, sealed, 'rec-2')).rejects.toBeInstanceOf(WrongPinError);
    const tampered = { iv: sealed.iv, ct: sealed.ct.map((b, i) => (i === 3 ? b ^ 1 : b)) };
    await expect(open(key, tampered, 'rec-1')).rejects.toBeInstanceOf(WrongPinError);
    expect(await open(key, sealed, 'rec-1')).toEqual({ secret: 1 });
  });

  it('keeps the sync state outside the sealed body, and counts what is waiting', async () => {
    const key = await createVault('4821');
    await saveRecord(key, record());
    await setSyncState('rec-1', 'sent');
    const [back] = await listRecords(key);
    expect(back!.sync).toBe('sent');
  });
});

describe('lockout', () => {
  it('locks for 60 s after five wrong PINs, never deletes anything, and then lets the right PIN in', async () => {
    const key = await createVault('4821');
    await saveRecord(key, record());
    const t0 = 1_000_000;

    for (let i = 0; i < 4; i++) await expect(unlockVault('0000', t0 + i)).rejects.toBeInstanceOf(WrongPinError);
    await expect(unlockVault('0000', t0 + 5)).rejects.toBeInstanceOf(LockedOutError);
    expect((await getLockout()).until).toBe(t0 + 5 + LOCKOUT_MS);

    // during the lockout even the right PIN is refused
    await expect(unlockVault('4821', t0 + 30_000)).rejects.toBeInstanceOf(LockedOutError);
    // after it, the right PIN works and every record is still there
    const reopened = await unlockVault('4821', t0 + 5 + LOCKOUT_MS + 1);
    expect(await listRecords(reopened)).toHaveLength(1);
    expect((await getLockout()).failures).toBe(0);
  });

  it('starts counting again after a correct PIN', async () => {
    await createVault('4821');
    for (let i = 0; i < 3; i++) await expect(unlockVault('0000')).rejects.toBeInstanceOf(WrongPinError);
    await unlockVault('4821');
    for (let i = 0; i < 4; i++) await expect(unlockVault('0000')).rejects.toBeInstanceOf(WrongPinError);
    expect((await getLockout()).until).toBe(0);
  });

  it('knows whether a PIN has been set', async () => {
    expect(await hasPin()).toBe(false);
    await createVault('4821');
    expect(await hasPin()).toBe(true);
  });
});

describe('tasks', () => {
  const today = '2026-10-06';
  const task = (over: Partial<Task>): Task => ({ id: 'x', recordId: 'r', kind: 'follow-up', patient: 'A, 30 y', title: 't', dueDate: null, urgent: false, done: false, ...over });

  it('turns the follow-up and the urgent referral into tasks, with a first name and age only', () => {
    const tasks = tasksFor(record());
    expect(tasks.map((t) => [t.kind, t.dueDate, t.urgent])).toEqual([['follow-up', '2026-10-07', false], ['referral', '2026-10-04', true]]);
    expect(tasks.every((t) => t.patient === 'Noor, 38 y')).toBe(true);
    expect(patientLabel(record())).toBe('Noor, 38 y');
  });

  it('makes no task when the follow-up is "if not better" or "none"', () => {
    const none = confirmRecord(extractRecord(textToTranscript('Patient Ravi, 40. Cough for 2 days. Gave cetirizine 10 mg once at night for 5 days. No follow-up needed.'), { visitDate: '2026-10-04', id: 'r2' }));
    expect(tasksFor(none)).toEqual([]);
  });

  it('sorts urgent referrals, then overdue, then by due date, then undated', () => {
    const sorted = sortTasks(
      [
        task({ id: 'later', dueDate: '2026-10-12' }),
        task({ id: 'undated' }),
        task({ id: 'overdue', dueDate: '2026-10-05' }),
        task({ id: 'soon', dueDate: '2026-10-07' }),
        task({ id: 'urgent', kind: 'referral', urgent: true, dueDate: '2026-10-06' }),
      ],
      today,
    );
    expect(sorted.map((t) => t.id)).toEqual(['urgent', 'overdue', 'soon', 'later', 'undated']);
  });

  it('describes how late or soon a task is', () => {
    expect(dueText(task({ dueDate: '2026-10-06' }), today)).toBe('Due today');
    expect(dueText(task({ dueDate: '2026-10-05' }), today)).toBe('Overdue by 1 day');
    expect(dueText(task({ dueDate: '2026-10-03' }), today)).toBe('Overdue by 3 days');
    expect(dueText(task({ dueDate: '2026-10-09' }), today)).toBe('Due in 3 days');
    expect(dueText(task({}), today)).toBe('No date given');
  });

  it('stores tasks sealed too', async () => {
    const key = await createVault('4821');
    for (const t of tasksFor(record())) await saveTask(key, t);
    expect(await listTasks(key)).toHaveLength(2);
  });
});
