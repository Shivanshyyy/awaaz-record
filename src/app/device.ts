import { hindiVoice } from '../patient/audio';
import { formatMB, formatSize } from '../ui/format';

// A plain-words check of whether this phone and browser can run the app. Pure rules over a snapshot, so they can be tested.

export interface DeviceEnv {
  secureContext: boolean;
  hasMic: boolean;
  hasMediaRecorder: boolean;
  hasAudioContext: boolean;
  hasWasm: boolean;
  hasWorker: boolean;
  hasServiceWorker: boolean;
  hasCaches: boolean;
  hasIndexedDb: boolean;
  hasCrypto: boolean;
  /** quota minus usage, or null when the browser will not say */
  freeBytes: number | null;
  persisted: boolean | null;
  /** a Hindi voice for speech, or null when unknown */
  hindiVoice: boolean | null;
}

export interface DeviceCheck {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
}

export function evaluateDevice(env: DeviceEnv, neededBytes: number): DeviceCheck[] {
  const rows: DeviceCheck[] = [];
  const add = (id: string, label: string, ok: boolean, good: string, bad: string, level: 'fail' | 'warn' = 'fail') =>
    rows.push({ id, label, status: ok ? 'ok' : level, detail: ok ? good : bad });

  add('secure', 'Secure connection', env.secureContext, 'The page is on a secure connection.', 'This page is not on a secure (https) connection, so the microphone and offline mode will not work.');
  add('mic', 'Microphone and recording', env.hasMic && env.hasMediaRecorder, 'This browser can record audio.', 'This browser cannot record audio. Use Chrome on an Android phone.');
  add('audio', 'Playing and reading audio', env.hasAudioContext, 'Audio can be read and played back.', 'This browser cannot read or play audio the way the app needs.');
  add('wasm', 'Running the speech model', env.hasWasm && env.hasWorker, 'WebAssembly and background workers are available.', 'WebAssembly or background workers are missing, so the speech model cannot run here.');
  add('offline', 'Working with no internet', env.hasServiceWorker && env.hasCaches, 'The app can save its files to work offline.', 'This browser cannot keep files for offline use.');
  add('vault', 'Locked storage for records', env.hasIndexedDb && env.hasCrypto, 'Records can be saved and locked with a PIN.', 'This browser cannot save locked records.');

  if (env.freeBytes === null) {
    rows.push({ id: 'space', label: 'Free space', status: 'warn', detail: `The browser will not say how much space is free. The speech files need ${formatMB(neededBytes)}.` });
  } else if (env.freeBytes < neededBytes) {
    rows.push({ id: 'space', label: 'Free space', status: 'fail', detail: `About ${formatSize(env.freeBytes)} is free but the speech files need ${formatMB(neededBytes)}. Free some space first.` });
  } else if (env.freeBytes < neededBytes + 100e6) {
    rows.push({ id: 'space', label: 'Free space', status: 'warn', detail: `About ${formatSize(env.freeBytes)} is free; the speech files need ${formatMB(neededBytes)}. It will fit, but there is little room left for records.` });
  } else {
    rows.push({ id: 'space', label: 'Free space', status: 'ok', detail: `About ${formatSize(env.freeBytes)} is free; the speech files need ${formatMB(neededBytes)}.` });
  }

  if (env.persisted !== null) {
    add('persist', 'Keeping files safe', env.persisted, 'The browser will not clear the saved files by itself.', 'The browser may clear the saved files if the phone runs low on space. Installing the app to the home screen helps.', 'warn');
  }
  if (env.hindiVoice !== null) {
    add('hindi', 'Hindi voice', env.hindiVoice, 'This phone has a Hindi voice for the patient instructions.', 'No Hindi voice on this phone. The Hindi lines will show as text unless audio files are added.', 'warn');
  }
  return rows;
}

export async function readDeviceEnv(): Promise<DeviceEnv> {
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  return {
    secureContext: window.isSecureContext,
    hasMic: Boolean(navigator.mediaDevices?.getUserMedia),
    hasMediaRecorder: typeof MediaRecorder !== 'undefined',
    hasAudioContext: typeof AudioContext !== 'undefined' && typeof OfflineAudioContext !== 'undefined',
    hasWasm: typeof WebAssembly === 'object',
    hasWorker: typeof Worker !== 'undefined',
    hasServiceWorker: 'serviceWorker' in navigator,
    hasCaches: 'caches' in self,
    hasIndexedDb: typeof indexedDB !== 'undefined',
    hasCrypto: Boolean(globalThis.crypto?.subtle),
    freeBytes: estimate?.quota !== undefined && estimate.usage !== undefined ? estimate.quota - estimate.usage : null,
    persisted: (await navigator.storage?.persisted?.().catch(() => undefined)) ?? null,
    hindiVoice: typeof speechSynthesis === 'undefined' ? null : (await hindiVoice()) !== null,
  };
}
