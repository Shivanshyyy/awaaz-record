import { describe, expect, it } from 'vitest';
import { evaluateDevice, type DeviceEnv } from './device';

const good: DeviceEnv = {
  secureContext: true, hasMic: true, hasMediaRecorder: true, hasAudioContext: true, hasWasm: true, hasWorker: true,
  hasServiceWorker: true, hasCaches: true, hasIndexedDb: true, hasCrypto: true, freeBytes: 2e9, persisted: true, hindiVoice: true,
};
const NEED = 66.1e6;
const statuses = (env: DeviceEnv) => Object.fromEntries(evaluateDevice(env, NEED).map((r) => [r.id, r.status]));

describe('device check', () => {
  it('passes a capable phone', () => {
    expect(Object.values(statuses(good)).every((s) => s === 'ok')).toBe(true);
  });

  it('fails what the app cannot work without, and says so in plain words', () => {
    const rows = evaluateDevice({ ...good, secureContext: false, hasMediaRecorder: false, hasWasm: false, hasServiceWorker: false, hasIndexedDb: false }, NEED);
    const bad = rows.filter((r) => r.status === 'fail').map((r) => r.id);
    expect(bad).toEqual(['secure', 'mic', 'wasm', 'offline', 'vault']);
    expect(rows.find((r) => r.id === 'mic')!.detail).toMatch(/Chrome on an Android phone/);
  });

  it('judges free space against the download, with a warning when it is tight', () => {
    expect(statuses({ ...good, freeBytes: 50e6 }).space).toBe('fail');
    expect(statuses({ ...good, freeBytes: 120e6 }).space).toBe('warn');
    expect(statuses({ ...good, freeBytes: null }).space).toBe('warn');
    expect(evaluateDevice({ ...good, freeBytes: 50e6 }, NEED).find((r) => r.id === 'space')!.detail).toContain('66.1 MB');
  });

  it('only warns about a missing Hindi voice or unprotected storage; the app still works', () => {
    const s = statuses({ ...good, hindiVoice: false, persisted: false });
    expect(s.hindi).toBe('warn');
    expect(s.persist).toBe('warn');
    expect(Object.values(s).includes('fail')).toBe(false);
  });

  it('leaves out checks the browser cannot answer', () => {
    const ids = evaluateDevice({ ...good, persisted: null, hindiVoice: null }, NEED).map((r) => r.id);
    expect(ids).not.toContain('persist');
    expect(ids).not.toContain('hindi');
  });
});
