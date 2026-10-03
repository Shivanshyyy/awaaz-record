import { useMemo, useRef, useState } from 'react';
import type { VisitRecord } from '../record/schema';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { playClip, stopClips, type ClipOutcome } from './audio';
import { hindiReviewed } from './clips';
import { buildPlaylist } from './playlist';

type Played = ClipOutcome | 'playing';

const OUTCOME: Record<ClipOutcome, string> = {
  mp3: 'Played from the recording',
  speech: 'Played with this phone’s Hindi voice',
  text: 'Audio not available on this phone: the Hindi text is shown instead',
};

/** The Hindi instructions: the worker sees every line in English first, can untick some, then plays them for the patient. */
export function PlaylistPanel({ record }: { record: VisitRecord }) {
  const initial = useMemo(() => buildPlaylist(record), [record]);
  const [checked, setChecked] = useState<Record<string, boolean>>(() => Object.fromEntries(initial.map((i) => [i.clip.id, i.checked])));
  const [state, setState] = useState<Record<string, Played>>({});
  const [running, setRunning] = useState(false);
  const cancelled = useRef(false);

  const playOne = async (id: string): Promise<void> => {
    setState((s) => ({ ...s, [id]: 'playing' }));
    const outcome = await playClip(id);
    setState((s) => ({ ...s, [id]: outcome }));
    // With no audio the text stays on screen long enough to read before the next line.
    if (outcome === 'text') await new Promise((r) => setTimeout(r, 1800));
  };

  const playAll = async () => {
    cancelled.current = false;
    setRunning(true);
    setState({});
    for (const item of initial) {
      if (cancelled.current) break;
      if (checked[item.clip.id]) await playOne(item.clip.id);
    }
    setRunning(false);
  };

  const stop = () => {
    cancelled.current = true;
    stopClips();
    setRunning(false);
  };

  return (
    <section aria-label="Hindi instructions" data-testid="playlist" className="no-print space-y-3">
      <h3 className="text-xl font-bold">Hindi instructions for the patient</h3>
      <p>Read the English meaning of each line, untick any you do not want, then play them for the patient.</p>
      {!hindiReviewed && <p className="rounded-xl border-2 border-check bg-check-bg p-2 text-base font-semibold text-check">The Hindi text has not yet been checked by a Hindi speaker.</p>}
      <ul className="space-y-2">
        {initial.map((item) => {
          const id = item.clip.id;
          const status = state[id];
          return (
            <li key={id} data-testid={`clip-${id}`} className={`space-y-1 rounded-xl border-2 p-3 ${status === 'playing' ? 'border-brand-700 bg-brand-50' : 'border-line'}`}>
              <label className="flex min-h-12 items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-6 w-6 shrink-0"
                  checked={checked[id] ?? false}
                  disabled={item.locked || running}
                  onChange={(e) => setChecked((c) => ({ ...c, [id]: e.target.checked }))}
                  data-testid={`clip-check-${id}`}
                />
                <span className="min-w-0">
                  <span className="block text-lg font-semibold">{item.clip.english}</span>
                  <span className="block text-sm text-ink-soft">{item.reason}</span>
                </span>
              </label>
              {status && status !== 'playing' && (
                <div data-testid={`clip-status-${id}`} className="space-y-1">
                  <p className={`flex items-center gap-1 text-sm font-bold ${status === 'text' ? 'text-check' : 'text-ok'}`}>
                    <Icon name={status === 'text' ? 'alert' : 'check'} size={18} /> {OUTCOME[status]}
                  </p>
                  {status === 'text' && (
                    <p lang="hi" className="text-xl font-semibold leading-8">
                      {item.clip.hindi}
                    </p>
                  )}
                </div>
              )}
              {status === 'playing' && <p className="text-sm font-bold text-brand-800">Playing…</p>}
              <Button variant="secondary" icon="play" disabled={running} onClick={() => void playOne(id)} data-testid={`clip-play-${id}`}>
                Play this line
              </Button>
            </li>
          );
        })}
      </ul>
      {running ? (
        <Button variant="danger" icon="stop" onClick={stop}>
          Stop
        </Button>
      ) : (
        <Button icon="play" onClick={() => void playAll()} data-testid="play-all">
          Play the ticked lines
        </Button>
      )}
    </section>
  );
}
