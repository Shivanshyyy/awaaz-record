import type { VisitRecord } from '../record/schema';
import { clip, type Clip } from './clips';

export interface PlaylistItem {
  clip: Clip;
  /** why this clip is in the list, in English, for the health worker */
  reason: string;
  checked: boolean;
  /** cannot be unticked (opening and closing) */
  locked: boolean;
}

const FOLLOW_UP_CLIPS: Record<number, string> = { 3: 'fu_3', 5: 'fu_5', 7: 'fu_7', 14: 'fu_14', 30: 'fu_30' };

/** Which clip says how often the medicines are taken, following the order in docs/HINDI_CLIPS.md. */
export function medicineClip(record: VisitRecord): { id: string; reason: string } | null {
  const meds = record.medications;
  if (!meds.length) return null;
  const perDay = meds.map((m) => m.perDay.value);
  const sameFrequency = perDay.every((n) => n !== null && n === perDay[0]);
  const anyNeeded = meds.some((m) => m.prn.value === true);
  const n = perDay[0];
  if (sameFrequency && !anyNeeded && n !== null && n !== undefined && n >= 1 && n <= 3) {
    if (n === 1) {
      const allNight = meds.every((m) => m.timing.value?.length === 1 && m.timing.value[0] === 'night');
      return allNight ? { id: 'med_1x_night', reason: 'Medicines taken once a day, at night' } : { id: 'med_1x', reason: 'Medicines taken once a day' };
    }
    return { id: n === 2 ? 'med_2x' : 'med_3x', reason: `Medicines taken ${n} times a day` };
  }
  return { id: 'med_multi', reason: 'Medicines with different timings, or only when needed' };
}

/** The Hindi instructions for a confirmed record, in the fixed order from docs/HINDI_CLIPS.md. */
export function buildPlaylist(record: VisitRecord): PlaylistItem[] {
  const items: PlaylistItem[] = [];
  const add = (id: string, reason: string, opts: { checked?: boolean; locked?: boolean } = {}) =>
    items.push({ clip: clip(id), reason, checked: opts.checked ?? true, locked: opts.locked ?? false });

  add('intro', 'Always played first', { locked: true });

  const timing = medicineClip(record);
  if (timing) add(timing.id, timing.reason);
  if (record.medications.some((m) => m.withFood.value === 'after')) add('med_after_food', 'A medicine is taken after food');
  if (record.medications.length) add('med_finish', 'Optional: finish the full course (you choose)', { checked: false });

  const tags = record.advice.tags.value ?? [];
  if (tags.includes('fluids')) add('adv_water', 'Advice: plenty of fluids');
  if (tags.includes('rest')) add('adv_rest', 'Advice: rest');
  if (tags.includes('breastfeeding')) add('adv_breastfeed', 'Advice: keep breastfeeding');

  const referral = record.referral.value;
  if (referral) {
    add('ref_go', 'The patient is referred');
    if (referral.urgent) add('ref_today', 'The referral is urgent');
  }

  const follow = record.followUp.value;
  if (follow?.kind === 'days') {
    const id = FOLLOW_UP_CLIPS[follow.days];
    add(id ?? 'fu_slip', id ? `Come back in ${follow.days} days` : `Come back in ${follow.days} days (the date is on the slip)`);
  } else if (follow?.kind === 'date') {
    add('fu_slip', 'Come back on a date (written on the slip)');
  }

  add('worse', 'Come back right away if worse');
  add('keep_slip', 'Keep the slip safe');
  add('outro', 'Always played last', { locked: true });
  return items;
}
