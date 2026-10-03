import { useEffect, useRef } from 'react';
import type { Row } from '../../record/rows';
import type { VisitRecord } from '../../record/schema';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { useVisit } from '../visit';
import { RowEditor } from './Editors';
import { HighlightedText } from './HighlightedText';
import { StatusBadge } from './StatusBadge';

interface Props {
  record: VisitRecord;
  row: Row;
  onClose(): void;
  /** a saved record: look, but do not change */
  readOnly?: boolean;
}

// The bottom sheet for one detail: what was heard, the words it came from (with a play button for that part of
// the recording), the question for the worker, and the ways to answer it.
export function EvidenceSheet({ record, row, onClose, readOnly = false }: Props) {
  const visit = useVisit();
  const sheet = useRef<HTMLDivElement>(null);
  const hasValue = !row.empty;

  useEffect(() => {
    sheet.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = (edits: Parameters<typeof visit.edit>[0]) => {
    visit.edit(edits);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/50" onClick={onClose}>
      <div
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-label={row.label}
        tabIndex={-1}
        data-testid="sheet"
        onClick={(e) => e.stopPropagation()}
        className="mx-auto max-h-[88dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-t-2xl bg-white p-4 pb-8 outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase tracking-wide text-ink-soft">{row.label}</p>
            <p className="break-words text-2xl font-bold">{row.display}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" data-testid="sheet-close" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-line">
            <Icon name="x" />
          </button>
        </div>
        <StatusBadge status={row.status} resolved={row.resolved} />

        {row.flags.length > 0 && (
          <ul className="space-y-2">
            {row.flags.map((f) => (
              <li key={`${f.code}${f.message}`} className={`rounded-xl border-2 p-3 text-lg font-semibold ${row.status === 'missing' ? 'border-missing bg-missing-bg text-missing' : 'border-check bg-check-bg text-check'}`}>
                {f.message}
              </li>
            ))}
          </ul>
        )}

        <section aria-label="Where this came from" className="space-y-2">
          <h3 className="text-base font-bold text-ink-soft">What was said</h3>
          {row.evidence.length > 0 ? (
            <>
              <HighlightedText text={record.transcript.text} spans={row.evidence} />
              {row.evidence.map((e, i) =>
                visit.hasAudio && e.t0 !== undefined && e.t1 !== undefined ? (
                  <Button key={i} variant="secondary" icon="play" onClick={() => visit.playSpan(e.t0! - 0.2, e.t1! + 0.2)} data-testid="play-evidence">
                    Play: {e.text.length > 28 ? `${e.text.slice(0, 28)}…` : e.text}
                  </Button>
                ) : null,
              )}
              {!visit.hasAudio && <p className="text-base text-ink-soft">There is no recording to play for this note.</p>}
            </>
          ) : (
            <p className="text-lg text-ink-soft">Nothing was heard for this in the recording.</p>
          )}
        </section>

        {!readOnly && (
          <section aria-label="Change this" className="space-y-3">
            <h3 className="text-base font-bold text-ink-soft">{hasValue ? 'Change it' : 'Add it'}</h3>
            <RowEditor record={record} row={row} onSave={save} />
          </section>
        )}

        {!readOnly && !row.resolved && row.status === 'check' && hasValue && (
          <Button
            variant="secondary"
            data-testid="sheet-looks-right"
            onClick={() => {
              visit.lookRight(row.leaves.map((l) => l.path));
              onClose();
            }}
          >
            Looks right
          </Button>
        )}
        {!readOnly && row.canNa && !row.resolved && (
          <Button
            variant="secondary"
            data-testid="sheet-na"
            onClick={() => {
              visit.notApplicable(row.leaves.map((l) => l.path));
              onClose();
            }}
          >
            Not applicable
          </Button>
        )}
        {!readOnly && row.editor === 'medName' && row.group && (
          <Button
            variant="secondary"
            data-testid="sheet-remove-medicine"
            onClick={() => {
              visit.removeMedicine(row.group!);
              onClose();
            }}
          >
            Remove this medicine
          </Button>
        )}
      </div>
    </div>
  );
}
