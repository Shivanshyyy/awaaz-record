import { findNumbers } from './numbers';
import { tokenize } from './tokens';

// How text is made comparable before counting word errors. The same rules are applied to the script and to the
// transcript, and they are written out in docs/EVALUATION.md:
//  1. lower case, 2. punctuation dropped (a decimal point inside a number stays), 3. hyphens split,
//  4. spoken numbers become digits ("thirty-eight" = "38"), 5. spelled-out letter runs are joined ("o r s" = "ors"),
//  6. "milligram(s)" = "mg".
export function normalizeForWer(text: string): string[] {
  const tokens = tokenize(text.replace(/(\w)-(\w)/g, '$1 $2'));
  const numbers = findNumbers(tokens);
  const words: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const n = numbers.find((m) => m.first === i);
    if (n) {
      words.push(String(n.value));
      i = n.last;
      continue;
    }
    const t = tokens[i]!;
    if (t.kind === 'punct') continue;
    words.push(t.lower === 'milligram' || t.lower === 'milligrams' ? 'mg' : t.lower);
  }
  // join runs of single letters: "o r s" becomes "ors"
  const joined: string[] = [];
  let previousWasLetter = false;
  for (const w of words) {
    const isLetter = w.length === 1 && /[a-z]/.test(w);
    const last = joined.at(-1);
    if (isLetter && previousWasLetter && last !== undefined) joined[joined.length - 1] = last + w;
    else joined.push(w);
    previousWasLetter = isLetter;
  }
  return joined;
}

export function wordErrors(reference: string[], hypothesis: string[]): { errors: number; words: number } {
  const row = Array.from({ length: hypothesis.length + 1 }, (_, i) => i);
  for (let i = 1; i <= reference.length; i++) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= hypothesis.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(above + 1, row[j - 1]! + 1, diagonal + (reference[i - 1] === hypothesis[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return { errors: row[hypothesis.length]!, words: reference.length };
}

export function wer(referenceText: string, hypothesisText: string): number {
  const { errors, words } = wordErrors(normalizeForWer(referenceText), normalizeForWer(hypothesisText));
  return words === 0 ? 0 : errors / words;
}
