import { useState, useSyncExternalStore } from 'react';
import { Icon } from '../ui/Icon';
import { getNetCounts, subscribeNet } from '../net/netmeter';
import { getTimings, subscribeTimings } from './timings';

const subscribeOnline = (listener: () => void) => {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
};

export function formatSent(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const seconds = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`);

export function NetworkChip() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine);
  const net = useSyncExternalStore(subscribeNet, getNetCounts);
  const t = useSyncExternalStore(subscribeTimings, getTimings);
  const [open, setOpen] = useState(false);

  const speech =
    t.transcribeMs === null || t.audioSeconds === null
      ? 'not measured yet'
      : `${seconds(t.transcribeMs)} for ${t.audioSeconds.toFixed(1)} s of audio (${(t.transcribeMs / 1000 / t.audioSeconds).toFixed(2)} times real time)${t.modelLoadMs ? `, plus ${seconds(t.modelLoadMs)} to load the model` : ''}`;
  const none = 'not measured yet';

  return (
    <div className="no-print border-b border-line bg-white" data-testid="net-strip">
      <button
        type="button"
        data-testid="net-chip"
        aria-expanded={open}
        aria-controls="net-panel"
        onClick={() => setOpen((v) => !v)}
        className="mx-auto flex min-h-12 w-full max-w-xl items-center gap-2 px-4 text-sm font-semibold text-ink"
      >
        <span data-testid="net-state" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${online ? 'bg-brand-100 text-brand-800' : 'bg-check-bg text-check'}`}>
          <Icon name={online ? 'wifi' : 'wifi-off'} size={18} />
          {online ? 'Online' : 'Offline'}
        </span>
        <span data-testid="net-sent" className="text-ink-soft">
          <strong className="text-ink">{formatSent(net.bytesSent)}</strong> sent by this app
        </span>
        <span className="ml-auto text-xs text-ink-soft">{open ? 'Hide' : 'Details'}</span>
      </button>
      {open && (
        <div id="net-panel" data-testid="net-panel" className="mx-auto max-w-xl space-y-2 px-4 pb-3 text-sm text-ink-soft">
          <p>
            <strong className="text-ink">Sent by this app since it opened:</strong> {net.bytesSent} bytes in {net.requests} {net.requests === 1 ? 'request' : 'requests'}; {net.otherServers} to other servers. This counts what the app uploads (request bodies and query strings, in the page and the speech worker), measured on this phone. It does not count the browser’s own page loads or protocol headers.
          </p>
          <p>
            <strong className="text-ink">Last visit, measured on this phone:</strong>
          </p>
          <ul className="list-disc space-y-0.5 pl-6" data-testid="net-timings">
            <li>Speech to text: {speech}</li>
            <li>Filling the record: {t.extractMs === null ? none : seconds(t.extractMs)}</li>
            <li>Encrypting and saving: {t.saveMs === null ? none : seconds(t.saveMs)}</li>
          </ul>
        </div>
      )}
    </div>
  );
}
