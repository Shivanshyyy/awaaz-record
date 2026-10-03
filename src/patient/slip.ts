import { displayName } from '../extract/context';
import { addDays, niceDate } from '../record/rows';
import type { AdviceTag, Medication, Timing, VisitRecord } from '../record/schema';
import { patientLabel } from '../store/tasks';
import { clip, type Clip } from './clips';

export type SlipTiming = { kind: 'icons'; slots: Timing[] } | { kind: 'needed' } | { kind: 'text'; text: string };

const ORDER: Timing[] = ['morning', 'afternoon', 'night'];
const sortSlots = (slots: Timing[]) => [...new Set(slots)].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));

/**
 * How a medicine is drawn on the slip. Once a day shows an icon only if a time of day was said. Twice is morning
 * and night, three times is morning, afternoon and night, unless the worker said the times. The worker sees this
 * mapping before printing and can change it.
 */
export function timingFor(med: Medication): SlipTiming {
  if (med.prn.value === true) return { kind: 'needed' };
  const n = med.perDay.value;
  const said = sortSlots(med.timing.value ?? []);
  if (n === null) return { kind: 'text', text: 'Ask the health worker' };
  if (n === 1) return said.length ? { kind: 'icons', slots: said } : { kind: 'text', text: 'Once a day' };
  if (said.length === n) return { kind: 'icons', slots: said };
  if (n === 2) return { kind: 'icons', slots: ['morning', 'night'] };
  if (n === 3) return { kind: 'icons', slots: ['morning', 'afternoon', 'night'] };
  return { kind: 'text', text: `${n} times a day` };
}

/** Why the slip draws these icons, in words for the health worker. */
export function mappingNote(med: Medication, timing: SlipTiming): string {
  const n = med.perDay.value;
  if (timing.kind === 'needed') return 'Only when needed: shown with the "when needed" icon.';
  if (timing.kind === 'text') return n === 1 ? 'Once a day, no time of day was said: no icon.' : `${timing.text}: no icons for this.`;
  const said = sortSlots(med.timing.value ?? []);
  if (said.length && said.length === n) return `You said ${said.join(', ')}: shown as said.`;
  return `${n} times a day is drawn as ${timing.slots.join(', ')}.`;
}

/** The Hindi line for how often one medicine is taken (the same rule as the playlist, for a single medicine). */
export function medicineClipFor(med: Medication): Clip {
  const n = med.perDay.value;
  if (med.prn.value === true || n === null || n < 1 || n > 3) return clip('med_multi');
  if (n === 1) return clip(med.timing.value?.length === 1 && med.timing.value[0] === 'night' ? 'med_1x_night' : 'med_1x');
  return clip(n === 2 ? 'med_2x' : 'med_3x');
}

export interface SlipMedicine {
  id: string;
  name: string;
  dose: string;
  atATime: string | null;
  how: string;
  duration: string;
  food: string | null;
  timing: SlipTiming;
  hindi: Clip;
  hindiFood: Clip | null;
}

export interface Slip {
  clinicName: string;
  date: string;
  who: string;
  medicines: SlipMedicine[];
  advice: { tag: AdviceTag; english: string; hindi: Clip }[];
  referral: { place: string; urgent: boolean; hindi: Clip[] } | null;
  followUp: { text: string; hindi: Clip | null } | null;
  closing: Clip[];
}

const ADVICE: Record<AdviceTag, { english: string; clip: string }> = {
  fluids: { english: 'Drink plenty of water and fluids', clip: 'adv_water' },
  rest: { english: 'Rest well', clip: 'adv_rest' },
  breastfeeding: { english: 'Keep breastfeeding the baby', clip: 'adv_breastfeed' },
};
const FOLLOW_CLIPS: Record<number, string> = { 3: 'fu_3', 5: 'fu_5', 7: 'fu_7', 14: 'fu_14', 30: 'fu_30' };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function longDate(iso: string): string {
  return `${Number(iso.slice(8))} ${niceDate(iso).split(' ')[2]} ${iso.slice(0, 4)}`;
}

/** Everything printed on the slip. Only a first name and the age: never a surname, a phone number or an address. */
export function buildSlip(record: VisitRecord, clinicName: string, overrides: Record<string, SlipTiming> = {}): Slip {
  const medicines = record.medications.map<SlipMedicine>((med) => {
    const dose = med.dose.value !== null ? `${med.dose.value} ${med.unit.value ?? ''}`.trim() : '';
    const n = med.perDay.value;
    return {
      id: med.id,
      name: med.name.value ? displayName(med.name.value) : 'Medicine',
      dose,
      atATime: med.count.value !== null ? `${med.count.value} at a time` : null,
      how: med.prn.value === true ? 'Only when needed' : n !== null ? `${plural(n, 'time')} a day` : '',
      duration: med.ongoing.value === true ? 'Keep taking it' : med.durationDays.value !== null ? `for ${plural(med.durationDays.value, 'day')}` : '',
      food: med.withFood.value === 'after' ? 'After food' : med.withFood.value === 'before' ? 'Before food' : null,
      timing: overrides[med.id] ?? timingFor(med),
      hindi: medicineClipFor(med),
      hindiFood: med.withFood.value === 'after' ? clip('med_after_food') : null,
    };
  });

  const follow = record.followUp.value;
  let followUp: Slip['followUp'] = null;
  if (follow?.kind === 'days') {
    const id = FOLLOW_CLIPS[follow.days];
    followUp = { text: `${niceDate(addDays(record.visitDate, follow.days))} (in ${plural(follow.days, 'day')})`, hindi: clip(id ?? 'fu_slip') };
  } else if (follow?.kind === 'date') {
    followUp = { text: niceDate(follow.date), hindi: clip('fu_slip') };
  } else if (follow?.kind === 'if_worse') {
    followUp = { text: 'Only if you are not better', hindi: null };
  }

  const referral = record.referral.value;
  return {
    clinicName,
    date: longDate(record.visitDate),
    who: patientLabel(record),
    medicines,
    advice: (record.advice.tags.value ?? []).map((tag) => ({ tag, english: ADVICE[tag].english, hindi: clip(ADVICE[tag].clip) })),
    referral: referral ? { place: referral.to ? displayName(referral.to) : 'Hospital', urgent: referral.urgent, hindi: referral.urgent ? [clip('ref_go'), clip('ref_today')] : [clip('ref_go')] } : null,
    followUp,
    closing: [clip('worse'), clip('keep_slip')],
  };
}

/** A short plain-text summary any phone camera can read. English only; no surname, phone number or address. */
export function slipQrText(slip: Slip): string {
  const lines = [`AWAAZ SLIP ${slip.date}`, ...(slip.clinicName ? [slip.clinicName] : []), slip.who];
  const meds = slip.medicines.slice(0, 4).map((m) => {
    const how = m.how === 'Only when needed' ? 'when needed' : m.how.replace(' times a day', 'x/day').replace(' time a day', 'x/day');
    return [m.name, m.dose, how, m.duration.replace('for ', '').replace(' days', 'd').replace(' day', 'd')].filter(Boolean).join(' ');
  });
  lines.push(...meds);
  if (slip.medicines.length > 4) lines.push(`+${slip.medicines.length - 4} more`);
  if (slip.advice.length) lines.push(`Advice: ${slip.advice.map((a) => a.tag).join(', ')}`);
  if (slip.referral) lines.push(`Go to: ${slip.referral.place}${slip.referral.urgent ? ' today' : ''}`);
  if (slip.followUp) lines.push(`Return: ${slip.followUp.text}`);
  return lines.join('\n');
}
