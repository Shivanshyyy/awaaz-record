// Source: hand-compiled by the builder: the small set of cue words the extractor reads. Wording only.
import { buildMatcher } from '../lexicon';

export const NEGATIONS = new Set(['no', 'not', 'without', 'denies', 'denied', 'nil', 'never', 'absent']);

export const CORRECTION_CUES = ['sorry', 'make that', 'i mean', 'correction', 'no wait', 'wait no', 'scratch that', 'rather', 'actually', 'my mistake', 'i meant'];
export const findCorrectionCues = buildMatcher(CORRECTION_CUES, (c) => [c]);

export const URGENT_WORDS = ['today', 'immediately', 'urgent', 'urgently', 'right away', 'at once', 'emergency', 'now', 'asap', 'without delay'];
export const findUrgent = buildMatcher(URGENT_WORDS, (w) => [w]);

export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export const DURATION_UNITS: Record<string, number> = {
  day: 1, days: 1, week: 7, weeks: 7, month: 30, months: 30, year: 365, years: 365,
};

export type AdviceCue = { tag: 'fluids' | 'rest' | 'breastfeeding'; aliases: string[] };
export const ADVICE_CUES: AdviceCue[] = [
  { tag: 'fluids', aliases: ['fluids', 'fluid', 'plenty of water', 'more water', 'drink water', 'drink plenty of water', 'drinking water', 'lots of water', 'adequate water', 'increase water', 'hydration', 'more fluids'] },
  { tag: 'rest', aliases: ['bed rest', 'take rest', 'get rest', 'plenty of rest', 'adequate rest', 'adequate sleep', 'rest well', 'complete rest', 'advised rest', 'rest at home'] },
  { tag: 'breastfeeding', aliases: ['breastfeeding', 'breast feeding', 'breast milk', 'breastfeed', 'breast feed'] },
];
export const findAdviceCues = buildMatcher(ADVICE_CUES, (c) => c.aliases);
