import { makeField, type AdviceTag, type Evidence, type Field, type Flag } from '../../record/schema';
import { evidenceFor, flag, inAny, type ExtractContext, type Span } from '../context';
import { findAdviceCues } from '../lexicons/cues';
import { clauseEnd, clauseStart } from '../tokens';

const STOP_WORDS = new Set(['stop', 'avoid', 'not', 'no', "don't", 'dont', 'without', 'discontinue']);
const ADVICE_VERBS = new Set(['advised', 'advise', 'advice', 'counselled', 'counseled']);

export function extractAdvice(ctx: ExtractContext, exclude: Span[]): { tags: Field<AdviceTag[]>; other: Field<string[]> } {
  const tags: AdviceTag[] = [];
  const tagEvidence: Evidence[] = [];
  const flags: Flag[] = [];
  const matched: Span[] = [];

  for (const m of findAdviceCues(ctx.text)) {
    const before = ctx.tokens.filter((t) => t.end <= m.start).slice(-3);
    matched.push({ start: m.start, end: m.end });
    if (before.some((t) => STOP_WORDS.has(t.lower))) {
      flags.push(flag('UNCLEAR', 'advice.tags', `"${m.text}" was heard next to a stop word — was the patient told to do this or to stop it?`));
      continue;
    }
    if (!tags.includes(m.entry.tag)) tags.push(m.entry.tag);
    tagEvidence.push(evidenceFor(ctx, m.start, m.end));
  }

  // A bare "rest" ("plenty of fluids and rest") counts when it sits in a clause that is giving advice.
  const REST_LEADS = new Set(['take', 'get', 'complete', 'adequate', 'plenty', 'bed', 'need', 'needs', 'and']);
  ctx.tokens.forEach((t, i) => {
    if (t.lower !== 'rest' || ctx.tokens[i + 1]?.lower === 'of' || matched.some((m) => t.start >= m.start && t.end <= m.end)) return;
    const from = clauseStart(ctx.tokens, i);
    const to = clauseEnd(ctx.tokens, i);
    const clause = ctx.tokens.slice(from, to);
    const advising = clause.some((c) => ADVICE_VERBS.has(c.lower)) || tags.length > 0 && matched.some((m) => m.start >= ctx.tokens[from]!.start && m.end <= ctx.tokens[to - 1]!.end);
    if (!advising && !REST_LEADS.has(ctx.tokens[i - 1]?.lower ?? '')) return;
    if (!tags.includes('rest')) tags.push('rest');
    tagEvidence.push(evidenceFor(ctx, t.start, t.end));
    matched.push({ start: t.start, end: t.end });
  });

  // Other advice: the worker's own words after "advised", kept verbatim, only when no known advice sits in that sentence.
  const others: string[] = [];
  const otherEvidence: Evidence[] = [];
  const seenSentences = new Set<number>();
  ctx.tokens.forEach((t, i) => {
    if (!ADVICE_VERBS.has(t.lower)) return;
    const from = clauseStart(ctx.tokens, i);
    if (seenSentences.has(from)) return;
    seenSentences.add(from);
    const to = clauseEnd(ctx.tokens, i);
    const sentence: Span = { start: ctx.tokens[from]!.start, end: ctx.tokens[to - 1]!.end };
    if (inAny(exclude, t.start) || matched.some((s) => s.start >= sentence.start && s.end <= sentence.end)) return;
    const rest = ctx.text.slice(t.end, sentence.end);
    const lead = /^\s*(?:the\s+)?(?:mother|father|patient|family|him|her|them)?\s*(?:to\s+)?/i.exec(rest)![0];
    const body = rest.slice(lead.length).replace(/[.\s]+$/, '');
    if (body.length < 3) return;
    others.push(body);
    otherEvidence.push(evidenceFor(ctx, t.end + lead.length, t.end + lead.length + body.length));
  });

  return {
    tags: makeField<AdviceTag[]>(tags.length ? tags : null, tagEvidence, flags),
    other: makeField<string[]>(others.length ? others : null, otherEvidence),
  };
}
