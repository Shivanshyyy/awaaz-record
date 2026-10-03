import { makeField, type Field, type FollowUp } from '../../record/schema';
import { evidenceFor, flag, type ExtractContext, type Span } from '../context';
import { DURATION_UNITS, WEEKDAYS } from '../lexicons/cues';
import { mergeShorthand } from '../numbers';
import { clauseEnd, clauseStart } from '../tokens';

const CUE_WORDS = new Set(['review', 'reviewed', 'revisit', 'recheck', 're-check', 'follow-up', 'followup']);
const NONE = /\bno\s+(?:need\s+(?:to|for)\s+)?(?:follow[- ]?up|review|revisit|come back|return)|\b(?:follow[- ]?up|review|revisit)\s+(?:is\s+)?not\s+(?:needed|required|necessary)/i;
const IF_WORSE = /\bif\b[^.;!?]*\b(?:not\s+(?:better|improv\w*|relieved|settl\w*)|no\s+(?:better|improvement|relief)|worse|worsen\w*|persists?|persisting|does\s?n[o']?t\s+(?:improve|settle)|get(?:s)?\s+worse)/i;

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// A weekday is always the NEXT one after the visit; the same weekday as today means a week later.
function nextWeekday(visitDate: string, weekday: string): string {
  const target = WEEKDAYS.indexOf(weekday);
  const today = new Date(`${visitDate}T00:00:00Z`).getUTCDay();
  const delta = (target - today + 7) % 7 || 7;
  return addDays(visitDate, delta);
}

function cueTokens(ctx: ExtractContext): number[] {
  const { tokens } = ctx;
  return tokens.flatMap((t, i) => {
    if (CUE_WORDS.has(t.lower)) return [i];
    if (t.lower === 'follow' && (tokens[i + 1]?.lower === 'up' || tokens[i + 1]?.text === '-')) return [i];
    if (t.lower === 'come' && tokens[i + 1]?.lower === 'back') return [i];
    if (t.lower === 'return' || t.lower === 'returns') return [i];
    if (t.lower === 'see' && ['again', 'me', 'you'].includes(tokens[i + 1]?.lower ?? '')) return [i];
    if (t.lower === 'next' && tokens[i + 1]?.lower === 'visit') return [i];
    return [];
  });
}

function parseSentence(ctx: ExtractContext, cue: number, from: number, to: number): { value: FollowUp; start: number; end: number } | null {
  const { tokens, text } = ctx;
  const sentence = text.slice(tokens[from]!.start, tokens[to - 1]!.end);

  if (NONE.test(sentence)) return { value: { kind: 'none' }, start: tokens[from]!.start, end: tokens[to - 1]!.end };
  if (IF_WORSE.test(sentence)) return { value: { kind: 'if_worse' }, start: tokens[from]!.start, end: tokens[to - 1]!.end };

  const numbers = mergeShorthand(ctx.numbers.filter((n) => n.first >= cue && n.last < to));
  for (const n of numbers) {
    const word = tokens[n.last + 1]?.lower ?? '';
    const unit = DURATION_UNITS[word];
    const lead = tokens[n.first - 1]?.lower ?? '';
    if (unit !== undefined && ['after', 'in', 'within', 'by', 'next', 'for'].includes(lead) && Number.isInteger(n.value)) {
      return { value: { kind: 'days', days: n.value * unit }, start: tokens[cue]!.start, end: tokens[n.last + 1]!.end };
    }
  }
  // "after a week", "in a month", "next week"
  for (let i = cue; i < to - 1; i++) {
    const lead = tokens[i]!.lower;
    const next = tokens[i + 1]!.lower;
    const unit = DURATION_UNITS[next];
    if (['a', 'an', 'next', 'one'].includes(lead) && unit !== undefined && ['after', 'in', 'within', 'next'].includes(tokens[i - 1]?.lower ?? (lead === 'next' ? 'next' : ''))) {
      return { value: { kind: 'days', days: unit }, start: tokens[cue]!.start, end: tokens[i + 1]!.end };
    }
    if (lead === 'next' && unit !== undefined) {
      return { value: { kind: 'days', days: unit }, start: tokens[cue]!.start, end: tokens[i + 1]!.end };
    }
  }
  for (let i = cue; i < to; i++) {
    if (tokens[i]!.lower === 'tomorrow') return { value: { kind: 'days', days: 1 }, start: tokens[cue]!.start, end: tokens[i]!.end };
    if (WEEKDAYS.includes(tokens[i]!.lower)) {
      return { value: { kind: 'date', date: nextWeekday(ctx.visitDate, tokens[i]!.lower) }, start: tokens[cue]!.start, end: tokens[i]!.end };
    }
  }
  return null;
}

export function extractFollowUp(ctx: ExtractContext): { field: Field<FollowUp>; span: Span | null } {
  const cues = cueTokens(ctx);
  let firstUnclear: { start: number; end: number; from: number; to: number } | null = null;

  for (const cue of cues) {
    let from = clauseStart(ctx.tokens, cue);
    const to = clauseEnd(ctx.tokens, cue);
    // "If not better, come back": the condition sits in the clause just before the cue
    if (from > 0) {
      const before = clauseStart(ctx.tokens, from - 1);
      if (ctx.tokens[before]?.lower === 'if') from = before;
    }
    const parsed = parseSentence(ctx, cue, from, to);
    if (parsed) {
      const sentenceSpan = { start: ctx.tokens[from]!.start, end: ctx.tokens[to - 1]!.end };
      return { field: makeField(parsed.value, [evidenceFor(ctx, parsed.start, parsed.end)]), span: sentenceSpan };
    }
    firstUnclear ??= { start: ctx.tokens[cue]!.start, end: ctx.tokens[to - 1]!.end, from, to };
  }

  if (firstUnclear) {
    const evidence = evidenceFor(ctx, firstUnclear.start, firstUnclear.end);
    const heard = evidence.text.replace(/[.\s]+$/, '');
    return {
      field: makeField<FollowUp>(null, [evidence], [flag('UNCLEAR', 'followUp', `Follow-up was mentioned ("${heard}") but no clear time was heard — when should the patient come back?`)]),
      span: { start: ctx.tokens[firstUnclear.from]!.start, end: ctx.tokens[firstUnclear.to - 1]!.end },
    };
  }
  return { field: makeField<FollowUp>(null), span: null };
}
