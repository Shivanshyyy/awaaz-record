import { useSyncExternalStore } from 'react';
import { describeStorageError, getOfflineStatus, prepareOffline, type OfflineStatus } from '../asr/offline';

export type PrepareState =
  | { phase: 'idle' }
  | { phase: 'running'; doneBytes: number; totalBytes: number; file: string }
  | { phase: 'error'; message: string }
  | { phase: 'done'; persisted: boolean };

interface Snapshot {
  status: OfflineStatus;
  prepare: PrepareState;
}

let snapshot: Snapshot = { status: { state: 'checking' }, prepare: { phase: 'idle' } };
const listeners = new Set<() => void>();

function update(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOffline(): Snapshot {
  return useSyncExternalStore(subscribe, () => snapshot);
}

export async function refreshOfflineStatus(): Promise<void> {
  update({ status: await getOfflineStatus() });
}

export async function startPrepare(): Promise<void> {
  if (snapshot.prepare.phase === 'running') return;
  update({ prepare: { phase: 'running', doneBytes: 0, totalBytes: 0, file: '' } });
  try {
    const { persisted } = await prepareOffline((p) => update({ prepare: { phase: 'running', ...p } }));
    update({ prepare: { phase: 'done', persisted } });
  } catch (error) {
    update({ prepare: { phase: 'error', message: describeStorageError(error) } });
  }
  await refreshOfflineStatus();
}
