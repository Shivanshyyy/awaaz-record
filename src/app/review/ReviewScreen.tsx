import { useMemo, useState } from 'react';
import { summarize } from '../../record/completeness';
import { addableRows, rowsOf, type Row, type Section } from '../../record/rows';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { TranscriptView } from '../TranscriptView';
import { useVisit } from '../visit';
import { EvidenceSheet } from './EvidenceSheet';
import { FieldRow } from './FieldRow';
import { SummaryBar } from './SummaryBar';

const SECTIONS: Section[] = ['Patient', 'Complaint', 'Vitals', 'Medicines', 'Advice and referral', 'Follow-up'];

export function ReviewScreen() {
  const visit = useVisit();
  const record = visit.record!;
  const rows = useMemo(() => rowsOf(record), [record]);
  const everyRow = useMemo(() => rowsOf(record, true), [record]);
  const summary = useMemo(() => summarize(record), [record]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<'record' | 'transcript'>('record');
  const [discarding, setDiscarding] = useState(false);
  const openRow = openId ? everyRow.find((r) => r.id === openId) : undefined;
  const canConfirm = summary.open.length === 0;
  const repeated = record.transcript.warnings?.includes('repeated');

  // Names and ages are what speech recognition gets wrong most and what looks fine when wrong: one tap to hear them.
  const IDENTITY = new Set(['patient.name', 'patient.ageYears']);
  const renderRow = (row: Row) => {
    const heard = row.evidence.find((e) => e.t0 !== undefined && e.t1 !== undefined);
    return (
      <FieldRow
        key={row.id}
        row={row}
        onOpen={() => setOpenId(row.id)}
        onLooksRight={() => visit.lookRight(row.leaves.map((l) => l.path))}
        onHear={visit.hasAudio && IDENTITY.has(row.id) && heard ? () => visit.playSpan(heard.t0! - 0.2, heard.t1! + 0.2) : undefined}
      />
    );
  };

  if (record.status === 'confirmed') {
    return (
      <div data-testid="confirmed" className="space-y-4 rounded-xl border-2 border-ok bg-ok-bg p-4 text-ok">
        <p className="flex items-center gap-2 text-xl font-bold">
          <Icon name="check" /> Record confirmed
        </p>
        <p>You checked every item. Nothing was added by the app.</p>
        <Button variant="secondary" onClick={visit.reset}>
          Start another visit
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-lg">Check each item against what was said. Tap an item to see the words it came from.</p>
      <SummaryBar summary={summary} />
      {repeated && (
        <p role="alert" className="flex gap-2 rounded-xl border-2 border-check bg-check-bg p-3 font-semibold text-check">
          <Icon name="alert" /> The speech model got stuck and repeated itself, so the text was cut. Read the transcript, or record again.
        </p>
      )}

      <div role="tablist" aria-label="Review" className="flex gap-2">
        {(['record', 'transcript'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            data-testid={`tab-${t}`}
            className={`min-h-12 flex-1 rounded-xl border-2 text-lg font-bold ${tab === t ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-line text-ink-soft'}`}
          >
            {t === 'record' ? 'Record' : 'Transcript'}
          </button>
        ))}
      </div>

      {tab === 'record' ? (
        <div className="space-y-5">
          {SECTIONS.map((section) => {
            const inSection = rows.filter((r) => r.section === section);
            if (!inSection.length && section !== 'Medicines') return null;
            const groups = section === 'Medicines' ? [...new Set(inSection.map((r) => r.group))] : [undefined];
            return (
              <section key={section} aria-label={section} className="space-y-2">
                <h3 className="text-xl font-bold">{section}</h3>
                {section === 'Medicines' ? (
                  <>
                    {groups.length === 0 && <p className="text-ink-soft">No medicines were heard.</p>}
                    {groups.map((g, i) => (
                      <div key={g} className="space-y-2 rounded-2xl bg-brand-50 p-2">
                        <h4 className="px-1 text-base font-bold text-brand-800">Medicine {i + 1}</h4>
                        <ul className="space-y-2">{inSection.filter((r) => r.group === g).map(renderRow)}</ul>
                      </div>
                    ))}
                    <Button
                      variant="secondary"
                      onClick={() => setOpenId(`${visit.addMedicine()}.name`)}
                      data-testid="add-medicine"
                    >
                      Add a medicine
                    </Button>
                  </>
                ) : (
                  <ul className="space-y-2">{inSection.map(renderRow)}</ul>
                )}
              </section>
            );
          })}

          {addableRows(record).length > 0 && (
            <section aria-label="Add a detail" className="space-y-2">
              <h3 className="text-xl font-bold">Add a detail</h3>
              <div className="flex flex-wrap gap-2">
                {addableRows(record).map((a) => (
                  <button key={a.id} type="button" onClick={() => setOpenId(a.id)} data-testid={`add-${a.id}`} className="min-h-12 rounded-full border-2 border-brand-700 px-4 text-base font-bold text-brand-800">
                    + {a.label}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-line p-3">
            <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-ink-soft">Transcript</h3>
            {visit.hasAudio ? (
              <TranscriptView transcript={record.transcript} onPlayWord={(w) => visit.playSpan(w.t0 - 0.05, w.t1 + 0.1)} />
            ) : (
              <p data-testid="transcript-text" className="text-lg leading-8">
                {record.transcript.text}
              </p>
            )}
            {visit.hasAudio && <p className="text-sm text-ink-soft">Tap a word to hear it again.</p>}
          </div>
          {visit.stats && (
            <p
              data-testid="asr-stats"
              data-audio-seconds={visit.stats.audioSeconds.toFixed(2)}
              data-ms={visit.stats.ms}
              data-load-ms={visit.stats.loadMs}
              className="text-sm text-ink-soft"
            >
              Transcribed {visit.stats.audioSeconds.toFixed(1)} s of audio in {(visit.stats.ms / 1000).toFixed(1)} s on this phone
              {visit.stats.loadMs > 500 ? ` (model loading took another ${(visit.stats.loadMs / 1000).toFixed(1)} s)` : ''}.
            </p>
          )}
          {visit.hasAudio && (
            <Button variant="secondary" icon="play" onClick={visit.playAll}>
              Play recording
            </Button>
          )}
          {discarding ? (
            <div className="space-y-2 rounded-xl border-2 border-missing bg-missing-bg p-3">
              <p className="font-bold text-missing">Discard this note and the recording? This cannot be undone.</p>
              <Button variant="danger" onClick={visit.reset} data-testid="discard-yes">
                Yes, discard
              </Button>
              <Button variant="secondary" onClick={() => setDiscarding(false)}>
                No, keep it
              </Button>
            </div>
          ) : (
            <Button variant="secondary" icon="redo" onClick={() => setDiscarding(true)} data-testid="discard">
              Discard and record again
            </Button>
          )}
        </div>
      )}

      <div className="sticky bottom-16 z-10 -mx-4 space-y-2 border-t border-line bg-white p-3">
        <Button disabled={!canConfirm} onClick={visit.confirm} data-testid="confirm-button">
          Confirm record
        </Button>
        {!canConfirm && (
          <p data-testid="confirm-help" className="text-center text-base font-semibold text-ink-soft">
            Check the {summary.open.length} marked {summary.open.length === 1 ? 'item' : 'items'} first.
          </p>
        )}
      </div>

      {openRow && <EvidenceSheet record={record} row={openRow} onClose={() => setOpenId(null)} />}
    </div>
  );
}
