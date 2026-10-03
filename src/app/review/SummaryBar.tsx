import type { Summary } from '../../record/completeness';
import { Icon } from '../../ui/Icon';

export function SummaryBar({ summary }: { summary: Summary }) {
  const open = summary.open.length;
  return (
    <div
      role="status"
      data-testid="summary-bar"
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border-2 p-3 text-lg font-bold ${
        open === 0 ? 'border-ok bg-ok-bg text-ok' : summary.missing > 0 ? 'border-missing bg-missing-bg text-missing' : 'border-check bg-check-bg text-check'
      }`}
    >
      {open === 0 ? (
        <span className="flex items-center gap-1.5">
          <Icon name="check" /> Everything is checked
        </span>
      ) : (
        <>
          <span className="flex items-center gap-1.5">
            <Icon name={summary.missing > 0 ? 'x' : 'alert'} />
            {summary.check > 0 && `${summary.check} to check`}
            {summary.check > 0 && summary.missing > 0 && ' · '}
            {summary.missing > 0 && `${summary.missing} missing`}
          </span>
        </>
      )}
    </div>
  );
}
