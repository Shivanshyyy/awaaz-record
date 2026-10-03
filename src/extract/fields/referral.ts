import { makeField, type Field, type Referral } from '../../record/schema';
import { evidenceFor, type ExtractContext, type Span } from '../context';
import { findFacilities } from '../lexicons/facilities';
import { findUrgent } from '../lexicons/cues';
import { clauseEnd, clauseStart } from '../tokens';

const CUE_WORDS = new Set(['referred', 'refer', 'refers', 'referring', 'referral', 'transferred', 'shifted']);

function cueTokens(ctx: ExtractContext): number[] {
  const { tokens } = ctx;
  return tokens.flatMap((t, i) => {
    if (CUE_WORDS.has(t.lower)) return [i];
    const next = tokens[i + 1]?.lower;
    if (['sent', 'send', 'sending', 'taken', 'take'].includes(t.lower) && ['to', 'her', 'him', 'them'].includes(next ?? '')) return [i];
    if (['advised', 'asked', 'told'].includes(t.lower) && next === 'to' && ['go', 'visit', 'attend'].includes(tokens[i + 2]?.lower ?? '')) return [i];
    if (t.lower === 'go' && next === 'to' && ['the', 'a'].includes(tokens[i + 2]?.lower ?? '')) return [i];
    return [];
  });
}

export function extractReferral(ctx: ExtractContext): { field: Field<Referral>; span: Span | null } {
  const facilities = findFacilities(ctx.text);
  for (const cue of cueTokens(ctx)) {
    const from = clauseStart(ctx.tokens, cue);
    const to = clauseEnd(ctx.tokens, cue);
    const sentence: Span = { start: ctx.tokens[from]!.start, end: ctx.tokens[to - 1]!.end };
    const place = facilities.find((f) => f.start >= ctx.tokens[cue]!.start && f.end <= sentence.end);
    const urgent = findUrgent(ctx.text.slice(ctx.tokens[cue]!.start, sentence.end));
    const evidence = [evidenceFor(ctx, ctx.tokens[cue]!.start, place ? place.end : ctx.tokens[cue]!.end)];
    if (urgent[0]) {
      const offset = ctx.tokens[cue]!.start;
      evidence.push(evidenceFor(ctx, offset + urgent[0].start, offset + urgent[0].end));
    }
    if (!place) {
      return {
        field: makeField<Referral>({ to: null, urgent: urgent.length > 0 }, evidence),
        span: sentence,
      };
    }
    return { field: makeField<Referral>({ to: place.entry.label, urgent: urgent.length > 0 }, evidence), span: sentence };
  }
  return { field: makeField<Referral>(null), span: null };
}
