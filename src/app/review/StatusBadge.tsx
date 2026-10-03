import type { Status } from '../../record/schema';
import { Icon } from '../../ui/Icon';

// A status is always a colour, an icon and a word, never colour alone.
export function StatusBadge({ status, resolved }: { status: Status; resolved: boolean }) {
  const [word, tone, icon] =
    status === 'ok' || resolved
      ? [resolved && status !== 'ok' ? 'Checked' : 'OK', 'bg-ok-bg text-ok', 'check' as const]
      : status === 'check'
        ? ['Check', 'bg-check-bg text-check', 'alert' as const]
        : ['Missing', 'bg-missing-bg text-missing', 'x' as const];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold ${tone}`}>
      <Icon name={icon} size={18} />
      {word}
    </span>
  );
}
