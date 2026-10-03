import { makeField, type Field } from '../../record/schema';
import { evidenceFor, flag, inAny, tokenAt, type ExtractContext, type Span } from '../context';
import { DURATION_UNITS, NEGATIONS } from '../lexicons/cues';
import { findSymptoms } from '../lexicons/symptoms';
import { mergeShorthand } from '../numbers';
import { SENTENCE_END } from '../tokens';

const SKIP_BEFORE_SYMPTOM = new Set(['any', 'history', 'of', 'complaint', 'complaints', 'c/o', 'signs', 'sign', 'symptoms', 'symptom']);
const ONSET_CUES = new Set(['for', 'since', 'over', 'past', 'from', 'x']);
const SINCE_WORDS: Record<string, number> = { yesterday: 1, morning: 0, today: 0, night: 1, evening: 0, afternoon: 0 };
const CONTEXT_AFTER = new Set(['pregnant', 'pregnancy', 'old']);

function isNegated(ctx: ExtractContext, start: number): boolean {
  let seen = 0;
  for (let i = tokenAt(ctx, start) - 1; i >= 0 && seen < 5; i--) {
    const t = ctx.tokens[i]!;
    // "no fever, headache since morning": after a comma the headache is a new finding, not part of the denial
    if (SENTENCE_END.has(t.text) || t.text === ',') return false;
    if (t.kind !== 'word') continue;
    if (NEGATIONS.has(t.lower)) return true;
    if (t.lower === 'but' || t.lower === 'except') return false;
    if (!SKIP_BEFORE_SYMPTOM.has(t.lower)) seen++;
  }
  return false;
}

function extractTerms(ctx: ExtractContext, medSegments: Span[], exclude: Span[]): Field<string[]> {
  type Hit = { term: string; start: number; end: number; generic: boolean; purpose: boolean };
  const hits: Hit[] = [];
  for (const m of findSymptoms(ctx.text)) {
    if (inAny(exclude, m.start) || isNegated(ctx, m.start)) continue;
    const before = ctx.tokens[tokenAt(ctx, m.start) - 1]?.lower;
    const purpose = inAny(medSegments, m.start) && (before === 'for' || before === 'needed');
    hits.push({ term: m.entry.term, start: m.start, end: m.end, generic: Boolean(m.entry.generic), purpose });
  }
  // "for pain" inside a medicine sentence says why it was given; keep it only if nothing else was said about the complaint.
  const specific = hits.filter((h) => !h.generic);
  const mainSpecific = specific.filter((h) => !h.purpose);
  const chosen = mainSpecific.length ? mainSpecific : specific.length ? specific : hits.filter((h) => !h.purpose);
  const terms: string[] = [];
  const evidence = chosen.map((h) => evidenceFor(ctx, h.start, h.end));
  for (const h of chosen) if (!terms.includes(h.term)) terms.push(h.term);

  if (terms.length) {
    const onlyGeneric = chosen.every((h) => h.generic);
    return makeField(terms, evidence, onlyGeneric ? [flag('UNCLEAR', 'complaint.terms', `Only "${terms[0]}" was heard — what kind of ${terms[0]} or where?`)] : []);
  }
  return extractVerbatimComplaint(ctx, exclude);
}

// When the words are not in the symptom list, show them exactly as heard and ask the worker to check.
function extractVerbatimComplaint(ctx: ExtractContext, exclude: Span[]): Field<string[]> {
  const cue = /\b(?:complains?\s+of|complaining\s+of|complaint\s+of|c\/o|came\s+with|came\s+for|presenting\s+with|presents?\s+with|suffering\s+from|history\s+of)\s+([^.,;]+?)(?=\s+(?:for|since)\s+|[.,;]|$)/i;
  const m = cue.exec(ctx.text);
  if (!m || inAny(exclude, m.index)) return makeField<string[]>(null);
  const phrase = m[1]!.trim();
  const start = m.index + m[0].length - m[1]!.length;
  return makeField([phrase], [evidenceFor(ctx, start, start + phrase.length)], [
    flag('UNCLEAR', 'complaint.terms', `"${phrase}" is not in the symptom list — check the words.`),
  ]);
}

function extractDuration(ctx: ExtractContext, skip: Span[], before: number): Field<number> {
  const { tokens } = ctx;
  const numbers = mergeShorthand(ctx.numbers);
  const candidates: { days: number; start: number; end: number }[] = [];

  for (const n of numbers) {
    const lead = tokens[n.first - 1]?.lower ?? '';
    const unitWord = tokens[n.last + 1]?.lower ?? '';
    const unit = DURATION_UNITS[unitWord];
    if (unit === undefined || !ONSET_CUES.has(lead) || !Number.isInteger(n.value)) continue;
    if (CONTEXT_AFTER.has(tokens[n.last + 2]?.lower ?? '')) continue;
    candidates.push({ days: n.value * unit, start: tokens[n.first - 1]!.start, end: tokens[n.last + 1]!.end });
  }
  for (let i = 0; i < tokens.length - 1; i++) {
    const lead = tokens[i]!.lower;
    const next = tokens[i + 1]!.lower;
    const unit = DURATION_UNITS[tokens[i + 2]?.lower ?? ''];
    // "for a week", "since last month"
    if (ONSET_CUES.has(lead) && ['a', 'an', 'last', 'past', 'previous'].includes(next) && unit !== undefined) {
      candidates.push({ days: unit, start: tokens[i]!.start, end: tokens[i + 2]!.end });
    }
    // "since yesterday", "since morning"
    if (lead === 'since' && next in SINCE_WORDS) {
      const last = next === 'morning' || next === 'night' ? i + 1 : i + 1;
      candidates.push({ days: SINCE_WORDS[next]!, start: tokens[i]!.start, end: tokens[last]!.end });
    }
    if (lead === 'since' && ['last', 'this'].includes(next) && tokens[i + 2]?.lower in SINCE_WORDS) {
      candidates.push({ days: SINCE_WORDS[tokens[i + 2]!.lower]!, start: tokens[i]!.start, end: tokens[i + 2]!.end });
    }
  }
  candidates.sort((a, b) => a.start - b.start);
  const best = candidates.find((c) => !inAny(skip, c.start) && c.start < before);
  return best ? makeField(best.days, [evidenceFor(ctx, best.start, best.end)]) : makeField<number>(null);
}

export function extractComplaint(ctx: ExtractContext, medSegments: Span[], exclude: Span[]): { terms: Field<string[]>; durationDays: Field<number> } {
  // Dictation says what is wrong first and what was given after, so a duration after the first medicine is the medicine's.
  const treatmentStart = medSegments.length ? Math.min(...medSegments.map((s) => s.start)) : ctx.text.length;
  return {
    terms: extractTerms(ctx, medSegments, exclude),
    durationDays: extractDuration(ctx, [...medSegments, ...exclude], treatmentStart),
  };
}
