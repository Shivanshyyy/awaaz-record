import { useEffect, useState } from 'react';
import { storageUsage } from '../../asr/offline';
import { evaluateDevice, readDeviceEnv, type DeviceCheck } from '../device';
import { Button } from '../../ui/Button';
import { formatMB } from '../../ui/format';
import { Icon } from '../../ui/Icon';
import { startPrepare, useOffline } from '../offline-store';

function PhoneCheck({ neededBytes }: { neededBytes: number }) {
  const [rows, setRows] = useState<DeviceCheck[] | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section aria-label="Check this phone" className="space-y-2 rounded-xl border border-line p-3">
      <h3 className="text-lg font-bold">Will this phone work?</h3>
      <Button
        variant="secondary"
        disabled={busy}
        data-testid="phone-check"
        onClick={async () => {
          setBusy(true);
          setRows(evaluateDevice(await readDeviceEnv(), neededBytes));
          setBusy(false);
        }}
      >
        Check this phone
      </Button>
      {rows && (
        <ul data-testid="phone-check-results" className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} data-status={r.status} className="rounded-lg border border-line p-2">
              <p className={`flex items-center gap-1 font-bold ${r.status === 'ok' ? 'text-ok' : r.status === 'warn' ? 'text-check' : 'text-missing'}`}>
                <Icon name={r.status === 'ok' ? 'check' : r.status === 'warn' ? 'alert' : 'x'} size={18} />
                {r.label}: {r.status === 'ok' ? 'OK' : r.status === 'warn' ? 'Check' : 'Will not work'}
              </p>
              <p className="text-base text-ink-soft">{r.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PrepareScreen() {
  const { status, prepare } = useOffline();
  const [used, setUsed] = useState<number | null>(null);
  const running = prepare.phase === 'running';
  const totalBytes = status.state === 'ready' || status.state === 'not-ready' ? status.totalBytes : 0;

  useEffect(() => {
    if (status.state === 'ready') void storageUsage().then((u) => setUsed(u?.usedBytes ?? null));
  }, [status.state]);

  return (
    <section aria-labelledby="prepare-title" className="space-y-4">
      <h2 id="prepare-title" className="text-2xl font-bold">
        Offline mode
      </h2>

      {status.state === 'ready' ? (
        <div data-testid="offline-ready" className="space-y-2 rounded-xl border-2 border-ok bg-ok-bg p-4 text-ok">
          <p className="flex items-center gap-2 text-xl font-bold">
            <Icon name="check" /> Ready offline
          </p>
          <p>
            The speech model is saved on this phone ({formatMB(status.totalBytes)}). Recording and transcribing work without internet.
          </p>
          {prepare.phase === 'done' && (
            <p>Protected from automatic clean-up: {prepare.persisted ? 'yes' : 'no (the browser may remove it if storage runs low)'}.</p>
          )}
          {used !== null && <p>Storage used by this app: {formatMB(used)}.</p>}
        </div>
      ) : (
        <>
          <p>
            The app saves its speech model on this phone once. After that, recording and transcribing work with no internet at all.
          </p>
          {totalBytes > 0 && (
            <p data-testid="prepare-size" className="font-semibold">
              One-time download: {formatMB(totalBytes)}. Use Wi-Fi if you can.
            </p>
          )}
          {status.state === 'not-ready' && status.reason && <p className="text-ink-soft">{status.reason}</p>}
          {status.state === 'unavailable' && (
            <p className="rounded-xl border-2 border-missing bg-missing-bg p-3 text-missing">{status.reason}</p>
          )}
          {running && (
            <div className="space-y-1" role="status">
              <div
                role="progressbar"
                aria-label="Download progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={prepare.totalBytes ? Math.round((prepare.doneBytes / prepare.totalBytes) * 100) : 0}
                className="h-4 w-full overflow-hidden rounded-full bg-line"
              >
                <div
                  className="h-full bg-brand-600"
                  style={{ width: `${prepare.totalBytes ? (prepare.doneBytes / prepare.totalBytes) * 100 : 0}%` }}
                />
              </div>
              <p className="text-sm text-ink-soft">
                {formatMB(prepare.doneBytes)} of {formatMB(prepare.totalBytes)}
              </p>
            </div>
          )}
          {prepare.phase === 'error' && (
            <p className="flex gap-2 rounded-xl border-2 border-missing bg-missing-bg p-3 text-missing">
              <Icon name="x" /> {prepare.message}
            </p>
          )}
          {status.state !== 'unavailable' && (
            <Button icon="download" disabled={running} onClick={() => void startPrepare()} data-testid="prepare-button">
              {prepare.phase === 'error' ? 'Try again' : running ? 'Downloading…' : 'Download now'}
            </Button>
          )}
          {prepare.phase === 'done' && status.state === 'not-ready' && (
            <Button variant="secondary" icon="redo" onClick={() => location.reload()}>
              Reload the app
            </Button>
          )}
        </>
      )}
      <PhoneCheck neededBytes={totalBytes || 66.1e6} />
    </section>
  );
}
