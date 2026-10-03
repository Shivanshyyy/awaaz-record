// The PIN is never stored. A key is derived from it (PBKDF2-SHA256, a random salt, 200k or more rounds) and used
// with AES-GCM to seal every record. A wrong PIN gives a different key, and AES-GCM then refuses to open anything.

export const MIN_ITERATIONS = 200_000;
export const MAX_ITERATIONS = 600_000;
const TARGET_UNLOCK_MS = 700;
const CHECK_TEXT = 'awaaz-pin-check';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface Sealed {
  iv: Uint8Array;
  ct: Uint8Array;
}

export class WrongPinError extends Error {
  constructor() {
    super('Wrong PIN');
  }
}

export const isValidPin = (pin: string): boolean => /^\d{4,6}$/.test(pin);

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function deriveKey(pin: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** How many rounds this device can do in about 0.7 s, never fewer than 200k. Measured once, when the PIN is set. */
export async function calibrateIterations(): Promise<number> {
  const probe = 20_000;
  const started = performance.now();
  await deriveKey('0000', randomBytes(16), probe);
  const perRound = Math.max((performance.now() - started) / probe, 1e-6);
  const wanted = Math.round(TARGET_UNLOCK_MS / perRound / 10_000) * 10_000;
  return Math.min(MAX_ITERATIONS, Math.max(MIN_ITERATIONS, wanted));
}

/** `context` (such as the record id) is authenticated too, so a sealed body cannot be moved to another record. */
export async function seal(key: CryptoKey, value: unknown, context: string): Promise<Sealed> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: encoder.encode(context) },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  return { iv, ct: new Uint8Array(ct) };
}

export async function open<T>(key: CryptoKey, sealed: Sealed, context: string): Promise<T> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: sealed.iv as BufferSource, additionalData: encoder.encode(context) },
      key,
      sealed.ct as BufferSource,
    );
    return JSON.parse(decoder.decode(plain)) as T;
  } catch {
    throw new WrongPinError();
  }
}

export const makeVerifier = (key: CryptoKey): Promise<Sealed> => seal(key, CHECK_TEXT, 'verifier');

export async function checkVerifier(key: CryptoKey, verifier: Sealed): Promise<boolean> {
  try {
    return (await open<string>(key, verifier, 'verifier')) === CHECK_TEXT;
  } catch {
    return false;
  }
}
