import { useEffect, useState } from 'react';
import { Button } from '../../ui/Button';
import { formatClock } from '../../ui/format';
import { Icon } from '../../ui/Icon';
import { MAX_RECORD_SECONDS } from '../../audio/recorder';
import { useOffline } from '../offline-store';
import { useRouter } from '../router';
import { ReviewScreen } from '../review/ReviewScreen';
import { useVisit } from '../visit';

function useElapsed(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return;
    const startedAt = performance.now();
    setSeconds(0);
    const timer = window.setInterval(() => setSeconds(Math.floor((performance.now() - startedAt) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [active]);
  return seconds;
}

function LevelMeter({ level }: { level: number }) {
  const percent = Math.round(level * 100);
  return (
    <div
      role="meter"
      aria-label="Microphone level"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-4 w-full overflow-hidden rounded-full bg-line"
    >
      <div className="h-full bg-brand-600" style={{ width: `${percent}%` }} />
    </div>
  );
}

function OfflineNotice() {
  const { status } = useOffline();
  const { go } = useRouter();
  if (status.state === 'ready' || status.state === 'checking') return null;
  return (
    <div className="space-y-2 rounded-xl border-2 border-check bg-check-bg p-3 text-check">
      <p className="flex items-center gap-2 font-bold">
        <Icon name="alert" /> Offline mode is not set up
      </p>
      <p>Recording works while you have signal. To work with no internet, download the speech model once.</p>
      <Button variant="secondary" onClick={() => go({ name: 'prepare' })}>
        Set up offline mode
      </Button>
    </div>
  );
}

function PasteTranscript() {
  const visit = useVisit();
  const [text, setText] = useState('');
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-line p-3 text-sm text-ink-soft">
      <label className="block">
        Developer helper: review a pasted transcript (no audio)
        <textarea
          data-testid="dev-paste"
          className="mt-2 block w-full rounded-lg border border-line p-2 text-base text-ink"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <Button variant="secondary" data-testid="dev-paste-go" disabled={!text.trim()} onClick={() => visit.reviewText(text)}>
        Review this text
      </Button>
    </div>
  );
}

export function NewVisitScreen() {
  const visit = useVisit();
  const working = visit.stage === 'decoding' || visit.stage === 'transcribing';
  const waited = useElapsed(working);
  const devHelper = import.meta.env.DEV || new URLSearchParams(location.search).has('dev');

  return (
    <section aria-labelledby="new-title" className="space-y-4">
      <h2 id="new-title" className="text-2xl font-bold">
        New visit
      </h2>
      <OfflineNotice />

      {visit.stage === 'idle' && (
        <>
          <p>Speak a short visit note in English, about 20 to 60 seconds: patient, complaint, readings, medicines, follow-up.</p>
          <Button icon="mic" onClick={() => void visit.start()} data-testid="record-button">
            Start recording
          </Button>
        </>
      )}

      {visit.stage === 'recording' && (
        <div className="space-y-4">
          <p data-testid="record-timer" className="text-center text-4xl font-bold tabular-nums">
            {formatClock(visit.recordSeconds)} <span className="text-xl font-semibold text-ink-soft">/ {formatClock(MAX_RECORD_SECONDS)}</span>
          </p>
          <LevelMeter level={visit.level} />
          <Button variant="danger" icon="stop" onClick={() => void visit.stop()} data-testid="stop-button">
            Stop
          </Button>
          <Button variant="secondary" onClick={visit.cancel}>
            Cancel
          </Button>
        </div>
      )}

      {working && (
        <div role="status" data-testid="working-status" className="space-y-2 rounded-xl border-2 border-brand-700 bg-brand-50 p-4">
          <p className="flex items-center gap-3 text-lg font-bold text-brand-800">
            <span aria-hidden="true" className="inline-block h-5 w-5 animate-spin rounded-full border-4 border-brand-700 border-t-transparent" />
            {visit.stage === 'decoding' ? 'Reading the recording…' : 'Transcribing on this phone…'}
          </p>
          <p data-testid="working-seconds" className="tabular-nums text-ink-soft">
            {waited} s
          </p>
        </div>
      )}

      {visit.stage === 'error' && (
        <div className="space-y-3">
          <p role="alert" className="flex gap-2 rounded-xl border-2 border-missing bg-missing-bg p-3 text-missing">
            <Icon name="x" /> {visit.error}
          </p>
          <Button icon="redo" onClick={() => void visit.start()}>
            Try again
          </Button>
        </div>
      )}

      {visit.stage === 'done' && visit.record && <ReviewScreen />}

      {devHelper && visit.stage !== 'recording' && visit.stage !== 'done' && !working && <PasteTranscript />}
      {devHelper && visit.stage !== 'recording' && visit.stage !== 'done' && !working && (
        <label className="block rounded-xl border border-dashed border-line p-3 text-sm text-ink-soft">
          Developer helper: transcribe an audio file
          <input
            type="file"
            accept="audio/*"
            data-testid="dev-upload"
            className="mt-2 block w-full"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void visit.transcribeFile(file);
              e.target.value = '';
            }}
          />
        </label>
      )}
    </section>
  );
}
