import { useEffect, useMemo, useState } from 'react';
import { summarize } from '../../record/completeness';
import { addableRows, rowsOf, type Row, type Section } from '../../record/rows';
import { SlipFlow } from '../../patient/SlipFlow';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { PinPanel } from '../PinScreen';
import { useVault } from '../vault';
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
  const vault = useVault();
  const [pinOpen, setPinOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const openRow = openId ? everyRow.find((r) => r.id === openId) : undefined;
  const canConfirm = summary.open.length === 0;
  const repeated = record.transcript.warnings?.includes('repeated');
  const byHand = record.consent?.given === false;

  const save = async (key: CryptoKey) => {
    setSaving(true);
    setSaveError('');
    try {
      await visit.confirmAndSave(key);
    } catch (error) {
      setSaveError(
        error instanceof DOMException && error.name === 'QuotaExceededError'
          ? 'This phone is out of storage space, so the record was not saved. Free some space and tap Confirm again. Nothing has been lost.'
          : `The record could not be saved: ${error instanceof Error ? error.message : 'unknown problem'}. Nothing has been lost; try Confirm again.`,
      );
    } finally {
      setSaving(false);
    }
  };

  const onConfirm = () => {
    if (vault.status === 'unlocked' && vault.key) void save(vault.key);
    else setPinOpen(true);
  };

  // After the PIN is entered in the sheet, carry on with the save the worker asked for.
  useEffect(() => {
    if (pinOpen && vault.status === 'unlocked' && vault.key) {
      setPinOpen(false);
      void save(vault.key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinOpen, vault.status, vault.key]);

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

  if (record.status === 'confirmed') return <SlipFlow record={record} justSaved onDone={visit.reset} />;

  return (
    <div className="space-y-4">
      {byHand ? (
        <p data-testid="by-hand" className="rounded-xl border-2 border-check bg-check-bg p-3 text-lg font-semibold text-check">
          The patient did not agree to a recording, so nothing was recorded. Fill in the record by hand.
        </p>
      ) : (
        <p className="text-lg">Check each item against what was said. Tap an item to see the words it came from.</p>
      )}
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
            {byHand ? (
              <p data-testid="transcript-text" className="text-lg text-ink-soft">No recording was made, so there is no transcript.</p>
            ) : visit.hasAudio ? (
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
              <Button variant="danger" onClick={visit.rerecord} data-testid="discard-yes">
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
        <Button disabled={!canConfirm || saving} onClick={onConfirm} data-testid="confirm-button">
          {saving ? 'Saving…' : 'Confirm record'}
        </Button>
        {saveError && (
          <p role="alert" data-testid="save-error" className="rounded-xl border-2 border-missing bg-missing-bg p-3 font-semibold text-missing">
            {saveError}
          </p>
        )}
        {!canConfirm && (
          <p data-testid="confirm-help" className="text-center text-base font-semibold text-ink-soft">
            Check the {summary.open.length} marked {summary.open.length === 1 ? 'item' : 'items'} first.
          </p>
        )}
      </div>

      {pinOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/50" role="dialog" aria-modal="true" aria-label="PIN">
          <div className="mx-auto max-h-[90dvh] w-full max-w-xl space-y-3 overflow-y-auto rounded-t-2xl bg-white p-4 pb-8">
            <PinPanel why="Records are saved locked with your PIN. Enter it to save this one." />
            <Button variant="secondary" onClick={() => setPinOpen(false)} data-testid="pin-cancel">
              Not now
            </Button>
          </div>
        </div>
      )}
      {openRow && <EvidenceSheet record={record} row={openRow} onClose={() => setOpenId(null)} />}
    </div>
  );
}
