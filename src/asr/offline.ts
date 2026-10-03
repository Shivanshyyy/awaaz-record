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

async function downloadOne(cache: Cache, file: OfflineFile, onBytes: (n: number) => void): Promise<void> {
  const res = await fetch(file.url);
  if (!res.ok || !res.body) throw new Error(`Download failed for ${file.url} (HTTP ${res.status}).`);
  const reader = res.body.getReader();
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value as Uint8Array<ArrayBuffer>);
    received += value.byteLength;
    onBytes(value.byteLength);
  }
  // A short download must never be stored as if it were complete.
  if (received !== file.bytes) throw new Error(`Incomplete download for ${file.url}: got ${received} of ${file.bytes} bytes.`);
  const headers = new Headers({
    'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
    'Content-Length': String(file.bytes),
  });
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
    for (let attempt = 1; ; attempt++) {
      try {
        await downloadOne(cache, file, (n) => {
          fileBytes += n;
          onProgress({ doneBytes: doneBytes + fileBytes, totalBytes: plan.totalBytes, file: file.url });
        });
        break;
      } catch (error) {
        fileBytes = 0;
        if (attempt >= 3) throw error;
      }
    }
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
