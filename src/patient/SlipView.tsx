import { useEffect, useRef } from 'react';
import { hindiReviewed, type Clip } from './clips';
import { SLOT_WORD, TimingIcon } from './icons';
import { qrPixels } from './qr';
import type { Slip as SlipData } from './slip';
import { slipQrText } from './slip';

function Hindi({ clip }: { clip: Clip }) {
  return (
    <p className="mt-1">
      <span lang="hi" className="block text-lg font-semibold leading-7">
        {clip.hindi}
      </span>
      <span className="no-print block text-sm text-ink-soft">{clip.english}</span>
    </p>
  );
}

function Qr({ text }: { text: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    const { data, width, height } = qrPixels(text);
    target.width = width;
    target.height = height;
    target.getContext('2d')!.putImageData(new ImageData(data, width, height), 0, 0);
  }, [text]);
  return <canvas ref={canvas} data-testid="slip-qr" aria-label="QR code with a short summary of this slip" className="h-36 w-36 [image-rendering:pixelated]" />;
}

/** The slip as the patient gets it. Printed in black on white; every icon has its word beside it. */
export function SlipView({ slip }: { slip: SlipData }) {
  return (
    <article data-testid="slip" aria-label="Patient slip" className="slip space-y-4 rounded-xl border-2 border-ink bg-white p-4 text-ink">
      <header className="flex items-start justify-between gap-3 border-b-2 border-ink pb-2">
        <div>
          <p className="text-xl font-bold">{slip.clinicName || 'Health centre'}</p>
          <p data-testid="slip-who" className="text-lg font-semibold">{slip.who}</p>
        </div>
        <p className="text-right text-base font-semibold">{slip.date}</p>
      </header>

      {slip.medicines.length > 0 && (
        <section aria-label="Medicines" className="space-y-3">
          <h3 className="text-lg font-bold uppercase tracking-wide">Medicines</h3>
          {slip.medicines.map((m) => (
            <div key={m.id} data-testid={`slip-med-${m.id}`} className="space-y-1 border-b border-line pb-3">
              <p className="text-xl font-bold">
                {m.name} {m.dose}
              </p>
              <p className="text-lg">
                {[m.how, m.duration, m.food, m.atATime].filter(Boolean).join(' · ')}
              </p>
              {m.timing.kind === 'icons' && (
                <ul className="flex flex-wrap gap-3 py-1">
                  {m.timing.slots.map((slot) => (
                    <li key={slot} className="flex items-center gap-1 rounded-lg border-2 border-ink px-2 py-1">
                      <TimingIcon slot={slot} />
                      <span className="text-base font-bold">{SLOT_WORD[slot]}</span>
                    </li>
                  ))}
                </ul>
              )}
              {m.timing.kind === 'needed' && (
                <p className="flex w-fit items-center gap-1 rounded-lg border-2 border-ink px-2 py-1">
                  <TimingIcon slot="needed" />
                  <span className="text-base font-bold">{SLOT_WORD.needed}</span>
                </p>
              )}
              {m.timing.kind === 'text' && <p className="text-base font-semibold">{m.timing.text}</p>}
              <Hindi clip={m.hindi} />
              {m.hindiFood && <Hindi clip={m.hindiFood} />}
            </div>
          ))}
        </section>
      )}

      {slip.advice.length > 0 && (
        <section aria-label="Advice" className="space-y-2">
          <h3 className="text-lg font-bold uppercase tracking-wide">Advice</h3>
          {slip.advice.map((a) => (
            <div key={a.tag}>
              <p className="text-lg font-semibold">{a.english}</p>
              <Hindi clip={a.hindi} />
            </div>
          ))}
        </section>
      )}

      {slip.referral && (
        <section aria-label="Referral" className="space-y-1 rounded-lg border-2 border-ink p-2">
          <h3 className="text-lg font-bold uppercase tracking-wide">Go to the hospital</h3>
          <p className="text-xl font-bold">
            {slip.referral.place}
            {slip.referral.urgent ? ' — go today' : ''}
          </p>
          {slip.referral.hindi.map((c) => (
            <Hindi key={c.id} clip={c} />
          ))}
        </section>
      )}

      {slip.followUp && (
        <section aria-label="Come back" className="space-y-1">
          <h3 className="text-lg font-bold uppercase tracking-wide">Come back</h3>
          <p data-testid="slip-follow-up" className="text-xl font-bold">{slip.followUp.text}</p>
          {slip.followUp.hindi && <Hindi clip={slip.followUp.hindi} />}
        </section>
      )}

      <section aria-label="Remember" className="space-y-1 border-t border-line pt-2">
        {slip.closing.map((c) => (
          <Hindi key={c.id} clip={c} />
        ))}
      </section>

      <footer className="flex items-end justify-between gap-3 border-t-2 border-ink pt-2">
        <p className="text-sm">Scan with any phone camera to read a short summary.</p>
        <Qr text={slipQrText(slip)} />
      </footer>
      {!hindiReviewed && (
        <p className="no-print rounded-lg border-2 border-check bg-check-bg p-2 text-sm font-semibold text-check">
          The Hindi lines have not yet been checked by a Hindi speaker (see the review log in docs/HINDI_CLIPS.md).
        </p>
      )}
    </article>
  );
}
