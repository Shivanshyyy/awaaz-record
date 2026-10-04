import { useEffect, useState } from 'react';
import { rowsOf } from '../../record/rows';
import type { VisitRecord } from '../../record/schema';
import { demoRecords } from '../../demo/demo';
import { deleteRecords, listRecords, saveRecord, saveTask, setSyncState } from '../../store/db';
import { tasksFor } from '../../store/tasks';
import { today } from '../visit';
import { patientLabel } from '../../store/tasks';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { VaultGate } from '../PinScreen';
import { useRouter } from '../router';
import { useVault } from '../vault';

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

function SyncPanel({ records, onSent }: { records: VisitRecord[]; onSent(): void }) {
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const waiting = records.filter((r) => r.sync === 'pending');
  return (
    <section aria-label="Sending" data-testid="sync-panel" className="space-y-2 rounded-xl border-2 border-line p-3">
      <p data-testid="sync-count" className="text-lg font-bold">
        {waiting.length === 0 ? 'Nothing is waiting to be sent' : `${waiting.length} waiting for signal`}
      </p>
      <p className="rounded-lg bg-check-bg p-2 text-sm font-semibold text-check">
        MOCK: there is no server behind this. Pressing send only shows how it would work. Nothing leaves this phone.
      </p>
      {waiting.length > 0 && (
        <Button
          variant="secondary"
          disabled={!online || busy}
          data-testid="sync-send"
          onClick={async () => {
            setBusy(true);
            await new Promise((r) => setTimeout(r, 600));
            for (const r of waiting) await setSyncState(r.id, 'sent');
            setBusy(false);
            onSent();
          }}
        >
          {busy ? 'Sending (mock)…' : online ? 'Send waiting records (mock)' : 'No signal: records wait here until there is'}
        </Button>
      )}
    </section>
  );
}

function DemoCard({ records, onChanged }: { records: VisitRecord[]; onChanged(): void }) {
  const vault = useVault();
  const [busy, setBusy] = useState(false);
  const demo = records.filter((r) => r.synthetic);
  return (
    <section aria-label="Demo visits" data-testid="demo-card" className="space-y-2 rounded-xl border-2 border-dashed border-brand-700 p-3">
      <p className="text-lg font-bold">{demo.length ? 'Demo visits are loaded' : 'Look around without recording'}</p>
      <p className="text-base text-ink-soft">
        {demo.length
          ? 'The three SYNTHETIC visits below are made up. Open them to see the review, the slip and the Hindi instructions.'
          : 'Load three made-up visits (marked SYNTHETIC) to see records, tasks and slips. They are saved locked with your PIN like real ones, and you can remove them.'}
      </p>
      <Button
        variant="secondary"
        disabled={busy}
        data-testid={demo.length ? 'demo-remove' : 'demo-load'}
        onClick={async () => {
          setBusy(true);
          if (demo.length) await deleteRecords(demo.map((r) => r.id));
          else {
            for (const r of demoRecords(today())) {
              await saveRecord(vault.key!, r);
              for (const t of tasksFor(r)) await saveTask(vault.key!, t);
            }
          }
          setBusy(false);
          onChanged();
        }}
      >
        {demo.length ? 'Remove the demo visits' : 'Load 3 demo visits (SYNTHETIC)'}
      </Button>
    </section>
  );
}

function RecordsList() {
  const vault = useVault();
  const { go } = useRouter();
  const [records, setRecords] = useState<VisitRecord[] | null>(null);
  const [error, setError] = useState('');
  const load = () => {
    if (vault.key) listRecords(vault.key).then(setRecords, () => setError('The saved records could not be opened with this PIN.'));
  };
  useEffect(load, [vault.key]);

  if (error) return <p role="alert" className="rounded-xl border-2 border-missing bg-missing-bg p-3 font-semibold text-missing">{error}</p>;
  if (!records) return <p className="text-ink-soft">Opening the records…</p>;
  return (
    <div className="space-y-4">
      <DemoCard records={records} onChanged={load} />
      {records.length > 0 && <SyncPanel records={records} onSent={load} />}
      {records.length === 0 ? (
        <p className="rounded-xl border border-line p-4 text-ink-soft">No records yet. Confirmed visits will appear here.</p>
      ) : (
        <ul className="space-y-2">
          {records.map((r) => {
            const open = rowsOf(r).find((x) => x.id === 'complaint.terms');
            return (
              <li key={r.id}>
                <button type="button" onClick={() => go({ name: 'record', id: r.id })} data-testid={`record-${r.id}`} className="w-full rounded-xl border-2 border-line p-3 text-left">
                  <span className="flex items-start justify-between gap-2">
                    <span>
                      <span className="block text-xl font-bold">{patientLabel(r)}</span>
                      <span className="block text-base text-ink-soft">{r.visitDate} · {open?.display ?? ''}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {r.synthetic && <span className="rounded-full border-2 border-dashed border-ink px-2 text-xs font-bold uppercase">Synthetic</span>}
                      <span className={`rounded-full px-2 py-1 text-sm font-bold ${r.sync === 'sent' ? 'bg-ok-bg text-ok' : 'bg-check-bg text-check'}`}>
                        {r.sync === 'sent' ? 'Sent (mock)' : 'Waiting for signal'}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function RecordsScreen() {
  const vault = useVault();
  return (
    <section aria-labelledby="records-title" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="records-title" className="text-2xl font-bold">
          Records
        </h2>
        {vault.status === 'unlocked' && (
          <button type="button" onClick={vault.lock} data-testid="lock-now" className="flex min-h-12 items-center gap-1 rounded-xl border-2 border-line px-3 font-bold">
            <Icon name="lock" size={20} /> Lock
          </button>
        )}
      </div>
      <VaultGate why="Saved records are locked with your PIN. Enter it to see them.">
        <RecordsList />
      </VaultGate>
    </section>
  );
}
