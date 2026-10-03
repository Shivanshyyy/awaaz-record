import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

let applyUpdate: (() => void) | null = null;
const listeners = new Set<() => void>();

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      applyUpdate = () => void update(true);
      listeners.forEach((listener) => listener());
    },
  });
}

/** A function that installs the waiting version, or null when there is no update. */
export function useUpdateReady(): (() => void) | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => applyUpdate,
  );
}
