// Timings of the last visit, measured on this device with performance.now(). Nothing is estimated.
export interface Timings {
  transcribeMs: number | null;
  audioSeconds: number | null;
  modelLoadMs: number | null;
  extractMs: number | null;
  saveMs: number | null;
}

let timings: Timings = { transcribeMs: null, audioSeconds: null, modelLoadMs: null, extractMs: null, saveMs: null };
const listeners = new Set<() => void>();

export const getTimings = (): Timings => timings;

export function subscribeTimings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function recordTimings(patch: Partial<Timings>) {
  timings = { ...timings, ...patch };
  listeners.forEach((listener) => listener());
}

/** Runs `fn` and returns its result with how long it took in milliseconds. */
export function timed<T>(fn: () => T): { value: T; ms: number } {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
}
