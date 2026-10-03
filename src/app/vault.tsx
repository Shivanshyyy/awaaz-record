import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { WrongPinError } from '../store/crypto';
import { createVault, getLockout, getSettings, hasPin, LockedOutError, MAX_FAILURES, saveSettings, unlockVault, type Settings } from '../store/db';

export const IDLE_LOCK_MS = 120_000;

type Status = 'loading' | 'no-pin' | 'locked' | 'unlocked';
export type UnlockResult = 'ok' | 'wrong' | 'locked-out';

interface VaultApi {
  status: Status;
  key: CryptoKey | null;
  /** epoch ms until which unlocking is paused; 0 when not paused */
  lockedUntil: number;
  triesLeft: number;
  settings: Settings;
  setPin(pin: string): Promise<void>;
  unlock(pin: string): Promise<UnlockResult>;
  lock(): void;
  saveClinicName(name: string): Promise<void>;
}

const VaultContext = createContext<VaultApi | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [failures, setFailures] = useState(0);
  const [settings, setSettings] = useState<Settings>({ clinicName: '' });
  const idle = useRef<number | null>(null);

  const refreshLockout = useCallback(async () => {
    const l = await getLockout();
    setLockedUntil(l.until);
    setFailures(l.failures);
  }, []);

  useEffect(() => {
    void (async () => {
      setStatus((await hasPin()) ? 'locked' : 'no-pin');
      setSettings(await getSettings());
      await refreshLockout();
    })();
  }, [refreshLockout]);

  const lock = useCallback(() => {
    setKey(null);
    setStatus((s) => (s === 'unlocked' ? 'locked' : s));
  }, []);

  // Two minutes without a touch locks the app again; the key only ever lives in memory.
  useEffect(() => {
    if (status !== 'unlocked') return;
    const arm = () => {
      if (idle.current !== null) window.clearTimeout(idle.current);
      idle.current = window.setTimeout(lock, IDLE_LOCK_MS);
    };
    arm();
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, arm));
      if (idle.current !== null) window.clearTimeout(idle.current);
    };
  }, [status, lock]);

  const setPin = useCallback(async (pin: string) => {
    setKey(await createVault(pin));
    setStatus('unlocked');
    setFailures(0);
  }, []);

  const unlock = useCallback(
    async (pin: string): Promise<UnlockResult> => {
      try {
        setKey(await unlockVault(pin));
        setStatus('unlocked');
        await refreshLockout();
        return 'ok';
      } catch (error) {
        await refreshLockout();
        if (error instanceof LockedOutError) return 'locked-out';
        if (error instanceof WrongPinError) return 'wrong';
        throw error;
      }
    },
    [refreshLockout],
  );

  const saveClinicName = useCallback(async (clinicName: string) => {
    const next = { clinicName: clinicName.trim() };
    await saveSettings(next);
    setSettings(next);
  }, []);

  const api = useMemo<VaultApi>(
    () => ({ status, key, lockedUntil, triesLeft: Math.max(0, MAX_FAILURES - failures), settings, setPin, unlock, lock, saveClinicName }),
    [status, key, lockedUntil, failures, settings, setPin, unlock, lock, saveClinicName],
  );
  return <VaultContext.Provider value={api}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultApi {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used inside VaultProvider');
  return ctx;
}
