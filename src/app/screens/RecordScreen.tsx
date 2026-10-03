import { useEffect, useMemo, useState } from 'react';
import { SlipFlow } from '../../patient/SlipFlow';
import { rowsOf, type Row } from '../../record/rows';
import type { VisitRecord } from '../../record/schema';
import { listRecords } from '../../store/db';
import { downloadJson, toDhis2 } from '../../store/sync';
import { patientLabel } from '../../store/tasks';
import { Button } from '../../ui/Button';
import { VaultGate } from '../PinScreen';
import { EvidenceSheet } from '../review/EvidenceSheet';
import { StatusBadge } from '../review/StatusBadge';
import { useRouter } from '../router';
import { useVault } from '../vault';

function Detail({ id }: { id: string }) {
  const vault = useVault();
  const { back } = useRouter();
  const [record, setRecord] = useState<VisitRecord | null | undefined>(undefined);
  const [tab, setTab] = useState<'record' | 'transcript' | 'slip'>('record');
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (vault.key) void listRecords(vault.key).then((all) => setRecord(all.find((r) => r.id === id) ?? null));
  }, [vault.key, id]);
  const rows = useMemo(() => (record ? rowsOf(record) : []), [record]);

  if (record === undefined) return <p className="text-ink-soft">Opening the record…</p>;
  if (record === null) return <p role="alert">That record could not be found.</p>;
  const open = openId ? rows.find((r) => r.id === openId) : undefined;
  const show = (row: Row) => (
    <li key={row.id}>
      <button type="button" onClick={() => setOpenId(row.id)} data-testid={`saved-${row.id}`} className="flex min-h-12 w-full items-start justify-between gap-3 rounded-xl border-2 border-line p-3 text-left">
        <span>
          <span className="block text-sm font-bold uppercase tracking-wide text-ink-soft">{row.label}</span>
          <span className="block text-xl font-semibold">{row.display}</span>
        </span>
        <StatusBadge status={row.status} resolved={row.resolved} />
      </button>
    </li>
  );

  return (
    <div className="space-y-4">
      <Button variant="secondary" onClick={back}>
        Back to records
      </Button>
      <div>
        <h3 data-testid="saved-title" className="text-2xl font-bold">{patientLabel(record)}</h3>
        <p className="text-ink-soft">
          {record.visitDate} · {record.sync === 'sent' ? 'Sent (mock)' : 'Waiting for signal'} · read only
        </p>
        <p data-testid="saved-consent" className="text-ink-soft">
          Consent:{' '}
          {!record.consent
            ? 'not recorded'
            : !record.consent.given
              ? 'declined, so nothing was recorded'
              : record.consent.mode === 'clip'
                ? 'given after the Hindi message'
                : 'given when asked in another language'}
        </p>
      </div>
      <div role="tablist" className="flex gap-2">
        {(['record', 'transcript', 'slip'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} data-testid={`saved-tab-${t}`} className={`min-h-12 flex-1 rounded-xl border-2 text-base font-bold ${tab === t ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-line text-ink-soft'}`}>
            {t === 'record' ? 'Record' : t === 'transcript' ? 'Transcript' : 'Slip'}
          </button>
        ))}
      </div>
      {tab === 'record' && (
        <>
          <ul className="space-y-2">{rows.map(show)}</ul>
          <div className="space-y-2 rounded-xl border border-line p-3">
            <p className="font-bold">Export for the health system</p>
            <p className="text-sm text-ink-soft">DHIS2-shaped JSON with placeholder ids. The file contains patient details: share it only with your health system.</p>
            <Button variant="secondary" icon="download" onClick={() => downloadJson(`awaaz-${record.visitDate}-${record.id.slice(0, 8)}.json`, toDhis2(record))} data-testid="export-json">
              Export this record
            </Button>
          </div>
        </>
      )}
      {tab === 'transcript' && (
        <p data-testid="saved-transcript" className="rounded-xl border border-line p-3 text-lg leading-8">
          {record.transcript.text || 'No recording was made for this visit.'}
        </p>
      )}
      {tab === 'slip' && <SlipFlow record={record} />}
      {open && <EvidenceSheet record={record} row={open} readOnly onClose={() => setOpenId(null)} />}
    </div>
  );
}

export function RecordScreen({ id }: { id: string }) {
  return (
    <section aria-label="Saved record" className="space-y-4">
      <VaultGate why="Saved records are locked with your PIN. Enter it to see this one.">
        <Detail id={id} />
      </VaultGate>
    </section>
  );
}
