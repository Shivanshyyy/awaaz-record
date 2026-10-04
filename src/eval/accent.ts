// Helpers for the accent check on the Speech Accent Archive (CC BY-NC-SA 4.0, George Mason University): many speakers
// read the same paragraph, so the reference text is the same for everyone. Pure functions, so the selection rule is tested.

export const ELICITATION =
  'Please call Stella. Ask her to bring these things with her from the store: Six spoons of fresh snow peas, five thick slabs of blue cheese, and maybe a snack for her brother Bob. We also need a small plastic snake and a big toy frog for the kids. She can scoop these things into three red bags, and we will go meet her Wednesday at the train station.';

export type AccentGroup = 'india' | 'usa';

export interface Speaker {
  speakerId: number;
  file: string;
  nativeLanguage: string;
  /** the Archive's "country" column: where the speaker was born */
  country: string;
  /** the Archive's "English residence" column: where the speaker lived when recorded */
  residence: string;
  gender: string;
  age: string;
}

export interface AccentRule {
  /** how many women and how many men are taken from each group, lowest speaker id first */
  perGender: number;
}

export const ACCENT_RULE: AccentRule = { perGender: 10 };

export const GROUP_LABELS: Record<AccentGroup, string> = {
  india: 'Born in India, mother tongue not English',
  usa: 'Native English speakers born in the USA',
};

/** One spreadsheet row, keyed by the header names of the archive's speaker_information sheet. */
export function toSpeaker(row: Record<string, string>): Speaker | null {
  const speakerId = Number(row.speakerid);
  if (!Number.isFinite(speakerId) || !row.speech_sample) return null;
  return {
    speakerId,
    file: row.speech_sample.trim(),
    nativeLanguage: (row.native_language ?? '').trim().toLowerCase(),
    country: (row.country ?? '').trim().toLowerCase(),
    residence: (row.english_residence ?? '').trim().toLowerCase(),
    gender: (row.gender ?? '').trim().toLowerCase(),
    age: (row.age ?? '').trim(),
  };
}

export function groupOf(s: Speaker): AccentGroup | null {
  if (s.country === 'india' && s.nativeLanguage !== 'english' && s.nativeLanguage !== '') return 'india';
  if (s.country === 'usa' && s.nativeLanguage === 'english') return 'usa';
  return null;
}

export interface Slot {
  group: AccentGroup;
  gender: 'female' | 'male';
  /** everyone who fits, lowest speaker id first */
  candidates: Speaker[];
}

/** The four places to fill (two groups, women and men), each with its candidates in speaker-id order. */
export function slotsOf(speakers: Speaker[]): Slot[] {
  const ordered = [...speakers].sort((a, b) => a.speakerId - b.speakerId);
  const slots: Slot[] = [];
  for (const group of ['india', 'usa'] as const) {
    for (const gender of ['female', 'male'] as const) slots.push({ group, gender, candidates: ordered.filter((s) => groupOf(s) === group && s.gender === gender) });
  }
  return slots;
}

/** The first `perGender` of each slot: fixed by speaker id before any model output was seen. */
export function selectSpeakers(speakers: Speaker[], rule: AccentRule = ACCENT_RULE): { group: AccentGroup; speaker: Speaker }[] {
  return slotsOf(speakers).flatMap((slot) => slot.candidates.slice(0, rule.perGender).map((speaker) => ({ group: slot.group, speaker })));
}
