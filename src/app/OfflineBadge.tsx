import { Icon } from '../ui/Icon';
import { useOffline } from './offline-store';
import { useRouter } from './router';

export function OfflineBadge() {
  const { status, prepare } = useOffline();
  const { go } = useRouter();

  let label = 'Checking…';
  let tone = 'bg-white text-ink-soft';
  let icon: 'check' | 'alert' | 'download' | null = null;

  if (prepare.phase === 'running') {
    const percent = prepare.totalBytes ? Math.round((prepare.doneBytes / prepare.totalBytes) * 100) : 0;
    label = `Downloading ${percent}%`;
    tone = 'bg-brand-100 text-brand-800';
    icon = 'download';
  } else if (status.state === 'ready') {
    label = 'Ready offline';
    tone = 'bg-ok-bg text-ok';
    icon = 'check';
  } else if (status.state === 'not-ready' || status.state === 'unavailable') {
    label = 'Set up offline';
    tone = 'bg-check-bg text-check';
    icon = 'alert';
  }

  return (
    <button
      type="button"
      data-testid="offline-badge"
      onClick={() => go({ name: 'prepare' })}
      className={`ml-auto inline-flex min-h-12 items-center gap-1.5 rounded-full px-3 text-sm font-bold ${tone}`}
    >
      {icon && <Icon name={icon} size={20} />}
      <span>{label}</span>
    </button>
  );
}
