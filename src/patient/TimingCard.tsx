import type { Medication, Timing } from '../record/schema';
import { SLOT_WORD, TimingIcon } from './icons';
import { mappingNote, timingFor, type SlipTiming } from './slip';

const SLOTS: Timing[] = ['morning', 'afternoon', 'night'];

interface Props {
  medications: Medication[];
  overrides: Record<string, SlipTiming>;
  onChange(id: string, timing: SlipTiming | null): void;
}

/** Shows the worker how each medicine will be drawn on the slip, and lets them change it before printing. */
export function TimingCard({ medications, overrides, onChange }: Props) {
  if (!medications.length) return null;
  return (
    <section aria-label="Check the timing icons" data-testid="timing-card" className="no-print space-y-3 rounded-xl border-2 border-brand-700 bg-brand-50 p-3">
      <h3 className="text-xl font-bold">Check the timing icons</h3>
      <p>This is how the slip will show each medicine. Make sure it matches what you told the patient.</p>
      <ul className="space-y-3">
        {medications.map((med) => {
          const timing = overrides[med.id] ?? timingFor(med);
          const chosen = timing.kind === 'icons' ? timing.slots : [];
          return (
            <li key={med.id} className="space-y-2 rounded-xl bg-white p-3">
              <p className="text-lg font-bold">{med.name.value ? med.name.value[0]!.toUpperCase() + med.name.value.slice(1) : 'Medicine'}</p>
              <p className="text-base text-ink-soft" data-testid={`mapping-${med.id}`}>
                {overrides[med.id] ? 'You changed the icons for this medicine.' : mappingNote(med, timing)}
              </p>
              {timing.kind !== 'needed' && (
                <div className="flex flex-wrap gap-2" role="group" aria-label={`Times of day for ${med.name.value ?? 'this medicine'}`}>
                  {SLOTS.map((slot) => {
                    const on = chosen.includes(slot);
                    return (
                      <button
                        key={slot}
                        type="button"
                        aria-pressed={on}
                        data-testid={`slot-${med.id}-${slot}`}
                        onClick={() => {
                          const next = on ? chosen.filter((s) => s !== slot) : [...chosen, slot].sort((a, b) => SLOTS.indexOf(a) - SLOTS.indexOf(b));
                          onChange(med.id, next.length ? { kind: 'icons', slots: next } : { kind: 'text', text: 'No time of day' });
                        }}
                        className={`flex min-h-12 items-center gap-1 rounded-xl border-2 px-3 text-base font-bold ${on ? 'border-brand-700 bg-brand-100 text-brand-800' : 'border-line text-ink-soft'}`}
                      >
                        <TimingIcon slot={slot} size={28} />
                        {SLOT_WORD[slot]}
                      </button>
                    );
                  })}
                  {overrides[med.id] && (
                    <button type="button" onClick={() => onChange(med.id, null)} className="min-h-12 rounded-xl border-2 border-line px-3 text-base font-bold text-ink-soft">
                      Undo my change
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
