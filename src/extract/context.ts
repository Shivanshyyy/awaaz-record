import type { Transcript } from '../asr/transcript';
import type { Evidence, Flag, FlagCode } from '../record/schema';
import { findNumbers, type NumberMatch } from './numbers';
import { tokenize, type Token } from './tokens';

export interface Span {
  start: number;
  end: number;
}

export interface ExtractContext {
  transcript: Transcript;
  text: string;
  tokens: Token[];
  numbers: NumberMatch[];
  /** YYYY-MM-DD */
  visitDate: string;
}

export function makeContext(transcript: Transcript, visitDate: string): ExtractContext {
  const tokens = tokenize(transcript.text);
  return { transcript, text: transcript.text, tokens, numbers: findNumbers(tokens), visitDate };
}

/** An evidence span with the audio times of the words it covers, when the transcript has them. */
export function evidenceFor(ctx: ExtractContext, start: number, end: number): Evidence {
  const timed = ctx.transcript.words.filter((w) => w.end > start && w.start < end && w.t1 > w.t0);
  const evidence: Evidence = { text: ctx.text.slice(start, end), start, end };
  if (timed.length) {
    evidence.t0 = Math.min(...timed.map((w) => w.t0));
    evidence.t1 = Math.max(...timed.map((w) => w.t1));
  }
  return evidence;
}

export function evidenceOfTokens(ctx: ExtractContext, first: number, last: number): Evidence {
  return evidenceFor(ctx, ctx.tokens[first]!.start, ctx.tokens[last]!.end);
}

export function flag(code: FlagCode, target: string, message: string): Flag {
  return { code, target, message };
}

export function inAny(spans: Span[], position: number): boolean {
  return spans.some((s) => position >= s.start && position < s.end);
}

export function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Index of the first token that ends after the character position. */
export function tokenAt(ctx: ExtractContext, position: number): number {
  const i = ctx.tokens.findIndex((t) => t.end > position);
  return i === -1 ? ctx.tokens.length : i;
}

export function titleCase(word: string): string {
  const mixed = word !== word.toLowerCase() && word !== word.toUpperCase();
  return mixed ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function displayName(name: string): string {
  return name.length <= 3 ? name.toUpperCase() : name.charAt(0).toUpperCase() + name.slice(1);
}
