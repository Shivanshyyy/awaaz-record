import type { Row } from '../../record/rows';
import { Button } from '../../ui/Button';
import { StatusBadge } from './StatusBadge';

interface Props {
  row: Row;
  onOpen(): void;
  onLooksRight(): void;
  /** plays the part of the recording this value came from; given only for rows worth a one-tap check */
  onHear?: () => void;
}

export function FieldRow({ row, onOpen, onLooksRight, onHear }: Props) {
  const needsLookRight = !row.resolved && row.status === 'check' && !row.empty;
  const tone = row.resolved ? 'border-line' : row.status === 'missing' ? 'border-missing' : row.status === 'check' ? 'border-check' : 'border-line';
  return (
    <li data-testid={`row-${row.id}`} data-status={row.resolved ? 'resolved' : row.status} className={`rounded-xl border-2 bg-white p-3 ${tone}`}>
      <button type="button" onClick={onOpen} className="flex min-h-12 w-full items-start justify-between gap-3 text-left" aria-label={`${row.label}: ${row.display}. Open details`}>
        <span className="min-w-0">
          <span className="block text-sm font-bold uppercase tracking-wide text-ink-soft">{row.label}</span>
          <span className={`block break-words text-xl font-semibold ${row.empty ? 'text-ink-soft' : ''}`}>{row.display}</span>
        </span>
        <StatusBadge status={row.status} resolved={row.resolved} />
      </button>
      {!row.resolved && row.flags.length > 0 && (
        <ul className="mt-2 space-y-1">
          {row.flags.map((f) => (
            <li key={`${f.code}${f.message}`} className={`text-base font-medium ${row.status === 'missing' ? 'text-missing' : 'text-check'}`}>
              {f.message}
            </li>
          ))}
        </ul>
      )}
      {onHear && (
        <div className="mt-3">
          <Button variant="secondary" icon="play" onClick={onHear} data-testid={`hear-${row.id}`}>
            Hear it
          </Button>
        </div>
      )}
      {needsLookRight && (
        <div className="mt-3">
          <Button variant="secondary" onClick={onLooksRight} data-testid={`looks-right-${row.id}`}>
            Looks right
          </Button>
        </div>
      )}
    </li>
  );
}
