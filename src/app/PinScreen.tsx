import { useEffect, useState, type ReactNode } from 'react';
import { isValidPin } from '../store/crypto';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { useVault } from './vault';

const INPUT = 'min-h-12 w-full rounded-xl border-2 border-line bg-white px-3 text-center text-2xl tracking-[0.5em]';

function PinInput({ label, value, onChange, testId }: { label: string; value: string; onChange(v: string): void; testId: string }) {
  return (
    <label className="block space-y-1">
      <span className="block text-base font-bold text-ink-soft">{label}</span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        className={INPUT}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        data-testid={testId}
      />
    </label>
  );
}

function useCountdown(until: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (until <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [until]);
  return Math.max(0, Math.ceil((until - now) / 1000));
}

function SetPin() {
  const vault = useVault();
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const problem = pin && !isValidPin(pin) ? 'Use 4 to 6 digits.' : again && pin !== again ? 'The two PINs do not match.' : '';
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!isValidPin(pin) || pin !== again) return;
        setBusy(true);
        await vault.setPin(pin);
      }}
    >
      <p>Choose a PIN of 4 to 6 digits. Saved records are locked with it and only open with it.</p>
      <p className="rounded-xl border-2 border-check bg-check-bg p-3 font-semibold text-check">
        There is no way to get a forgotten PIN back. Write it down somewhere safe.
      </p>
      <PinInput label="New PIN" value={pin} onChange={setPin} testId="pin-new" />
      <PinInput label="Repeat the PIN" value={again} onChange={setAgain} testId="pin-again" />
      {problem && <p role="alert" className="font-semibold text-missing">{problem}</p>}
      <Button type="submit" disabled={busy || !isValidPin(pin) || pin !== again} data-testid="pin-set">
        {busy ? 'Setting the PIN…' : 'Set the PIN'}
      </Button>
    </form>
  );
}

function Unlock() {
  const vault = useVault();
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const seconds = useCountdown(vault.lockedUntil);
  const paused = seconds > 0;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!pin || paused) return;
        // The digits leave the screen the moment they are submitted.
        const attempt = pin;
        setPin('');
        setBusy(true);
        const result = await vault.unlock(attempt);
        setBusy(false);
        if (result === 'wrong') setMessage('That PIN is not right.');
        if (result === 'locked-out') setMessage('Too many wrong PINs.');
      }}
    >
      <PinInput label="PIN" value={pin} onChange={setPin} testId="pin-unlock" />
      {paused ? (
        <p role="alert" data-testid="pin-wait" className="rounded-xl border-2 border-missing bg-missing-bg p-3 font-bold text-missing">
          Too many wrong PINs. Wait {seconds} seconds. Nothing has been deleted.
        </p>
      ) : (
        message && (
          <p role="alert" data-testid="pin-wrong" className="font-semibold text-missing">
            {message} {vault.triesLeft < 5 ? `${vault.triesLeft} ${vault.triesLeft === 1 ? 'try' : 'tries'} left before a one-minute wait.` : ''}
          </p>
        )
      )}
      <Button type="submit" disabled={busy || paused || pin.length < 4} data-testid="pin-unlock-button">
        {busy ? 'Opening…' : 'Unlock'}
      </Button>
    </form>
  );
}

/** The PIN screen for whatever state the vault is in. */
export function PinPanel({ why }: { why: string }) {
  const vault = useVault();
  if (vault.status === 'loading') return <p className="text-ink-soft">Opening…</p>;
  return (
    <section aria-label="PIN" className="space-y-4 rounded-xl border-2 border-brand-700 p-4">
      <h2 className="flex items-center gap-2 text-xl font-bold">
        <Icon name="lock" /> {vault.status === 'no-pin' ? 'Set a PIN' : 'Enter your PIN'}
      </h2>
      <p className="text-ink-soft">{why}</p>
      {vault.status === 'no-pin' ? <SetPin /> : <Unlock />}
    </section>
  );
}

/** Shows its children only while the vault is open. */
export function VaultGate({ why, children }: { why: string; children: ReactNode }) {
  const vault = useVault();
  return vault.status === 'unlocked' ? <>{children}</> : <PinPanel why={why} />;
}
