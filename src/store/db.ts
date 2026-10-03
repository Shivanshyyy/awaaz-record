import { openDB, deleteDB, type DBSchema, type IDBPDatabase } from 'idb';
import { checkVerifier, calibrateIterations, deriveKey, makeVerifier, open, randomBytes, seal, WrongPinError, type Sealed } from './crypto';
import type { VisitRecord } from '../record/schema';
import type { Task } from './tasks';

// What sits in IndexedDB: random ids, timestamps, sync state, and sealed (encrypted) bodies. No names, no transcripts.
export interface StoredRecord extends Sealed {
  id: string;
  createdAt: string;
  status: 'draft' | 'confirmed';
  sync: 'pending' | 'sent';
}

export interface StoredTask extends Sealed {
  id: string;
  recordId: string;
}

interface Vault {
  salt: Uint8Array;
  iterations: number;
  verifier: Sealed;
  createdAt: string;
}

export interface Lockout {
  failures: number;
  /** epoch ms; 0 when not locked out */
  until: number;
}

export interface Settings {
  clinicName: string;
}

interface AwaazDB extends DBSchema {
  meta: { key: string; value: Vault | Lockout | Settings };
  records: { key: string; value: StoredRecord; indexes: { 'by-created': string } };
  tasks: { key: string; value: StoredTask };
}

export const DB_NAME = 'awaaz';
export const MAX_FAILURES = 5;
export const LOCKOUT_MS = 60_000;

let dbPromise: Promise<IDBPDatabase<AwaazDB>> | null = null;

function db(): Promise<IDBPDatabase<AwaazDB>> {
  dbPromise ??= openDB<AwaazDB>(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore('meta');
      database.createObjectStore('records', { keyPath: 'id' }).createIndex('by-created', 'createdAt');
      database.createObjectStore('tasks', { keyPath: 'id' });
    },
  });
  return dbPromise;
}

/** Tests only: forget the connection and delete the database. */
export async function resetDatabase(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
  await deleteDB(DB_NAME);
}

// ---- the PIN ------------------------------------------------------------------------------------------------
export async function hasPin(): Promise<boolean> {
  return Boolean(await (await db()).get('meta', 'vault'));
}

export async function createVault(pin: string): Promise<CryptoKey> {
  const iterations = await calibrateIterations();
  const salt = randomBytes(16);
  const key = await deriveKey(pin, salt, iterations);
  const vault: Vault = { salt, iterations, verifier: await makeVerifier(key), createdAt: new Date().toISOString() };
  await (await db()).put('meta', vault, 'vault');
  return key;
}

export async function getLockout(): Promise<Lockout> {
  return ((await (await db()).get('meta', 'lockout')) as Lockout | undefined) ?? { failures: 0, until: 0 };
}

/** Opens the vault. Five wrong PINs in a row lock the PIN for 60 s; nothing is ever deleted. */
export async function unlockVault(pin: string, now = Date.now()): Promise<CryptoKey> {
  const database = await db();
  const lockout = await getLockout();
  if (lockout.until > now) throw new LockedOutError(lockout.until);
  const vault = (await database.get('meta', 'vault')) as Vault | undefined;
  if (!vault) throw new Error('No PIN has been set.');
  const key = await deriveKey(pin, vault.salt, vault.iterations);
  if (!(await checkVerifier(key, vault.verifier))) {
    const failures = lockout.failures + 1;
    const next: Lockout = failures >= MAX_FAILURES ? { failures: 0, until: now + LOCKOUT_MS } : { failures, until: 0 };
    await database.put('meta', next, 'lockout');
    if (next.until) throw new LockedOutError(next.until);
    throw new WrongPinError();
  }
  await database.put('meta', { failures: 0, until: 0 } satisfies Lockout, 'lockout');
  return key;
}

export class LockedOutError extends Error {
  constructor(readonly until: number) {
    super('Too many wrong PINs');
  }
}

// ---- settings -----------------------------------------------------------------------------------------------
export async function getSettings(): Promise<Settings> {
  return ((await (await db()).get('meta', 'settings')) as Settings | undefined) ?? { clinicName: '' };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await (await db()).put('meta', settings, 'settings');
}

// ---- records ------------------------------------------------------------------------------------------------
export async function saveRecord(key: CryptoKey, record: VisitRecord): Promise<void> {
  const sealed = await seal(key, record, record.id);
  await (await db()).put('records', { id: record.id, createdAt: record.createdAt, status: record.status, sync: record.sync, ...sealed });
}

export async function openRecord(key: CryptoKey, stored: StoredRecord): Promise<VisitRecord> {
  const record = await open<VisitRecord>(key, stored, stored.id);
  return { ...record, sync: stored.sync };
}

export async function listRecords(key: CryptoKey): Promise<VisitRecord[]> {
  const all = await (await db()).getAllFromIndex('records', 'by-created');
  const opened = await Promise.all(all.map((r) => openRecord(key, r)));
  return opened.reverse();
}

export async function setSyncState(id: string, sync: 'pending' | 'sent'): Promise<void> {
  const database = await db();
  const stored = await database.get('records', id);
  if (stored) await database.put('records', { ...stored, sync });
}

export async function pendingSyncCount(): Promise<number> {
  return (await (await db()).getAll('records')).filter((r) => r.sync === 'pending').length;
}

// ---- tasks --------------------------------------------------------------------------------------------------
export async function saveTask(key: CryptoKey, task: Task): Promise<void> {
  const sealed = await seal(key, task, task.id);
  await (await db()).put('tasks', { id: task.id, recordId: task.recordId, ...sealed });
}

export async function listTasks(key: CryptoKey): Promise<Task[]> {
  const all = await (await db()).getAll('tasks');
  return Promise.all(all.map((t) => open<Task>(key, t, t.id)));
}
