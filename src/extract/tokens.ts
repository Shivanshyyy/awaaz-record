export interface Token {
  text: string;
  lower: string;
  start: number;
  end: number;
  kind: 'word' | 'digits' | 'punct';
}

// Words keep inner apostrophes and hyphens ("thirty-eight"); digits keep one decimal point ("38.5").
const TOKEN = /[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*|\d+(?:\.\d+)?|\S/g;

export function tokenize(text: string): Token[] {
  return [...text.matchAll(TOKEN)].map((m) => {
    const raw = m[0];
    const start = m.index!;
    const kind = /^[A-Za-z]/.test(raw) ? 'word' : /^\d/.test(raw) ? 'digits' : 'punct';
    return { text: raw, lower: raw.toLowerCase(), start, end: start + raw.length, kind };
  });
}

export const SENTENCE_END = new Set(['.', '!', '?', ';']);

/** Index of the first token of the sentence containing token i. */
export function sentenceStart(tokens: Token[], i: number): number {
  let k = i;
  while (k > 0 && !SENTENCE_END.has(tokens[k - 1]!.text)) k--;
  return k;
}

/** Index one past the last token of the sentence containing token i (includes the closing punctuation). */
export function sentenceEnd(tokens: Token[], i: number): number {
  let k = i;
  while (k < tokens.length && !SENTENCE_END.has(tokens[k]!.text)) k++;
  return Math.min(k + 1, tokens.length);
}

// Speech recognition often writes a whole note with commas and no full stops, so spans that must stay local
// (a referral, a follow-up, a piece of advice) are bounded by clauses, not sentences.
export const CLAUSE_END = new Set(['.', '!', '?', ';', ',']);

export function clauseStart(tokens: Token[], i: number): number {
  let k = i;
  while (k > 0 && !CLAUSE_END.has(tokens[k - 1]!.text)) k--;
  return k;
}

export function clauseEnd(tokens: Token[], i: number): number {
  let k = i;
  while (k < tokens.length && !CLAUSE_END.has(tokens[k]!.text)) k++;
  return Math.min(k + 1, tokens.length);
}
