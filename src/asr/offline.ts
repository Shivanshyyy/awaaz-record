const BASE = import.meta.env.BASE_URL;
export const OFFLINE_CACHE = 'awaaz-offline-v1';

interface ManifestFile {
  path: string;
  bytes: number;
}

export interface OfflineFile {
  url: string;
  bytes: number;
}

export interface OfflinePlan {
  files: OfflineFile[];
  totalBytes: number;
}

export type OfflineStatus =
  | { state: 'checking' }
  | { state: 'ready'; totalBytes: number }
  | { state: 'not-ready'; totalBytes: number; reason: string }
  | { state: 'unavailable'; reason: string };

export interface PrepareProgress {
  doneBytes: number;
  totalBytes: number;
  file: string;
}

const MANIFESTS = [`${BASE}models/manifest.json`, `${BASE}ort/manifest.json`];

async function readManifest(url: string): Promise<{ files: OfflineFile[]; ownBytes: number }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not read ${url} (HTTP ${res.status}).`);
  const raw = await res.arrayBuffer();
  const dir = url.slice(0, url.lastIndexOf('/') + 1);
  const manifest = JSON.parse(new TextDecoder().decode(raw)) as { files: ManifestFile[] };
  return { files: manifest.files.map((f) => ({ url: `${dir}${f.path}`, bytes: f.bytes })), ownBytes: raw.byteLength };
}

// Everything the speech step needs from our own origin, including the manifests themselves.
export async function loadPlan(): Promise<OfflinePlan> {
  const manifests = await Promise.all(MANIFESTS.map(readManifest));
  const files = manifests.flatMap((m, i) => [...m.files, { url: MANIFESTS[i]!, bytes: m.ownBytes }]);
  return { files, totalBytes: files.reduce((sum, f) => sum + f.bytes, 0) };
}

async function isStored(cache: Cache, file: OfflineFile): Promise<boolean> {
  const hit = await cache.match(file.url);
  if (!hit) return false;
  const declared = hit.headers.get('content-length');
  if (declared !== null) return Number(declared) === file.bytes;
  // No declared length: only small files are worth reading back to count.
  return file.bytes < 1_000_000 && (await hit.clone().blob()).size === file.bytes;
}

export async function getOfflineStatus(): Promise<OfflineStatus> {
  if (!('caches' in self) || !('serviceWorker' in navigator)) {
    return { state: 'unavailable', reason: 'This browser cannot store files for offline use.' };
  }
  let plan: OfflinePlan;
  try {
    plan = await loadPlan();
  } catch {
    return { state: 'not-ready', totalBytes: 0, reason: 'The speech files have not been downloaded yet.' };
  }
  const cache = await caches.open(OFFLINE_CACHE);
  for (const file of plan.files) {
    if (!(await isStored(cache, file))) {
      return { state: 'not-ready', totalBytes: plan.totalBytes, reason: 'The speech files have not been downloaded yet.' };
    }
  }
  const registration = await navigator.serviceWorker.getRegistration(BASE);
  if (!registration?.active || !navigator.serviceWorker.controller) {
    return { state: 'not-ready', totalBytes: plan.totalBytes, reason: 'Reload the app once to finish setting up offline mode.' };
  }
  return { state: 'ready', totalBytes: plan.totalBytes };
}

const MAX_STALLS = 3;
const STALL_WAIT_MS = 1000;

// A dropped connection continues from the bytes already received (HTTP Range). A server that ignores Range, or
// answers with the wrong part, restarts that file from zero. Gives up after 3 attempts in a row that bring no new bytes.
export async function downloadOne(cache: Pick<Cache, 'put'>, file: OfflineFile, onBytes: (delta: number) => void, wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<void> {
  let parts: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  let contentType = 'application/octet-stream';
  const restart = () => {
    onBytes(-received);
    parts = [];
    received = 0;
  };
  for (let stalls = 0; ; ) {
    const before = received;
    try {
      const res = await fetch(file.url, received > 0 ? { headers: { Range: `bytes=${received}-` } } : undefined);
      if (!res.body || (res.status !== 200 && res.status !== 206)) throw new Error(`Download failed for ${file.url} (HTTP ${res.status}).`);
      if (res.status === 200 && received > 0) restart();
      if (res.status === 206 && !new RegExp(`^bytes ${received}-\\d+/${file.bytes}$`).test(res.headers.get('content-range') ?? '')) {
        restart();
        throw new Error(`The server sent the wrong part of ${file.url}.`);
      }
      contentType = res.headers.get('content-type') ?? contentType;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value as Uint8Array<ArrayBuffer>);
        received += value.byteLength;
        onBytes(value.byteLength);
      }
      // A short download must never be stored as if it were complete.
      if (received === file.bytes) break;
      const problem = `Incomplete download for ${file.url}: got ${received} of ${file.bytes} bytes.`;
      if (received > file.bytes) restart();
      throw new Error(problem);
    } catch (error) {
      stalls = received > before ? 0 : stalls + 1;
      if (stalls >= MAX_STALLS) throw error;
      if (stalls > 0) await wait(STALL_WAIT_MS * stalls);
    }
  }
  const headers = new Headers({ 'Content-Type': contentType, 'Content-Length': String(file.bytes) });
  await cache.put(file.url, new Response(new Blob(parts), { status: 200, headers }));
}

export function describeStorageError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'This phone is out of storage space. Free up some space and try again.';
  }
  return error instanceof Error ? error.message : 'Something went wrong while downloading.';
}

export async function prepareOffline(onProgress: (p: PrepareProgress) => void): Promise<{ persisted: boolean }> {
  // In dev there is no service worker; the files are still stored, they just aren't served offline.
  await Promise.race([navigator.serviceWorker?.ready, new Promise((resolve) => setTimeout(resolve, 4000))]);
  const plan = await loadPlan();
  const cache = await caches.open(OFFLINE_CACHE);
  let doneBytes = 0;
  for (const file of plan.files) {
    if (await isStored(cache, file)) {
      doneBytes += file.bytes;
      onProgress({ doneBytes, totalBytes: plan.totalBytes, file: file.url });
      continue;
    }
    let fileBytes = 0;
    await downloadOne(cache, file, (n) => {
      fileBytes += n;
      onProgress({ doneBytes: doneBytes + fileBytes, totalBytes: plan.totalBytes, file: file.url });
    });
    doneBytes += file.bytes;
    onProgress({ doneBytes, totalBytes: plan.totalBytes, file: file.url });
  }
  const persisted = (await navigator.storage?.persist?.()) ?? false;
  return { persisted };
}

export async function storageUsage(): Promise<{ usedBytes: number; quotaBytes: number } | null> {
  const estimate = await navigator.storage?.estimate?.();
  if (!estimate || estimate.usage === undefined || estimate.quota === undefined) return null;
  return { usedBytes: estimate.usage, quotaBytes: estimate.quota };
}
