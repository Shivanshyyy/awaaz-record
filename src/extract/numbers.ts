import type { Token } from './tokens';

export interface NumberMatch {
  value: number;
  /** token indexes, inclusive */
  first: number;
  last: number;
  start: number;
  end: number;
  fromWords: boolean;
}

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

type Atom =
  | { kind: 'unit' | 'tens'; value: number; token: number }
  | { kind: 'hundred' | 'thousand' | 'and' | 'point' | 'a'; token: number };

function atomsOf(tokens: Token[]): Atom[] {
  const atoms: Atom[] = [];
  tokens.forEach((token, i) => {
    if (token.kind !== 'word') return;
    for (const part of token.lower.split('-')) {
      if (part in UNITS) atoms.push({ kind: 'unit', value: UNITS[part]!, token: i });
      else if (part in TENS) atoms.push({ kind: 'tens', value: TENS[part]!, token: i });
      else if (part === 'hundred') atoms.push({ kind: 'hundred', token: i });
      else if (part === 'thousand') atoms.push({ kind: 'thousand', token: i });
      else if (part === 'and') atoms.push({ kind: 'and', token: i });
      else if (part === 'point') atoms.push({ kind: 'point', token: i });
      else if (part === 'a') atoms.push({ kind: 'a', token: i });
      else atoms.push({ kind: 'unit', value: NaN, token: i }); // a non-number word: keeps token order intact
    }
  });
  return atoms;
}

const isNumberAtom = (a: Atom | undefined): a is Extract<Atom, { value: number }> =>
  Boolean(a && (a.kind === 'unit' || a.kind === 'tens') && !Number.isNaN(a.value));

// "fifty, one tablet" must not become 51: atoms only belong together when they sit in the same or the next token.
function following(atoms: Atom[], i: number): Atom | undefined {
  const a = atoms[i];
  const b = atoms[i + 1];
  return a && b && b.token - a.token <= 1 ? b : undefined;
}

/** twenty-one, nineteen, seven: a value from 0 to 99 starting at atom i */
function belowHundred(atoms: Atom[], i: number): { value: number; next: number } | null {
  const a = atoms[i];
  if (!isNumberAtom(a)) return null;
  if (a.kind === 'tens') {
    const b = following(atoms, i);
    if (isNumberAtom(b) && b.kind === 'unit' && b.value >= 1 && b.value <= 9) return { value: a.value + b.value, next: i + 2 };
  }
  return { value: a.value, next: i + 1 };
}

function parseWords(atoms: Atom[], i: number): { value: number; next: number } | null {
  const a = atoms[i];
  if (!a) return null;
  const second = following(atoms, i);

  // "one hundred", "a hundred", optionally followed by "(and) twenty five"
  const hundreds =
    isNumberAtom(a) && a.kind === 'unit' && a.value >= 1 && a.value <= 9 && second?.kind === 'hundred'
      ? a.value * 100
      : a.kind === 'a' && second?.kind === 'hundred'
        ? 100
        : null;
  if (hundreds !== null) {
    // atom i + 1 is "hundred"; the tens and units may follow it directly or after "and"
    const afterHundred = following(atoms, i + 1);
    let tail = -1;
    if (afterHundred?.kind === 'and') tail = following(atoms, i + 2) ? i + 3 : -1;
    else if (afterHundred) tail = i + 2;
    const rest = tail === -1 ? null : belowHundred(atoms, tail);
    return withDecimal(atoms, hundreds + (rest?.value ?? 0), rest ? rest.next : i + 2);
  }

  const small = belowHundred(atoms, i);
  if (!small) return null;
  // a bare "twenty hundred" is not a number we read
  const after = following(atoms, small.next - 1);
  if (after?.kind === 'hundred' || after?.kind === 'thousand') return null;
  return withDecimal(atoms, small.value, small.next);
}

// "point eight", "point two five": every digit word after "point" is one decimal digit.
function withDecimal(atoms: Atom[], whole: number, at: number): { value: number; next: number } {
  if (following(atoms, at - 1)?.kind !== 'point') return { value: whole, next: at };
  let digits = '';
  let k = at + 1;
  while (isNumberAtom(atoms[k]) && atoms[k]!.kind === 'unit' && (atoms[k] as { value: number }).value <= 9 && following(atoms, k - 1)) {
    digits += (atoms[k] as { value: number }).value;
    k++;
  }
  return digits ? { value: Number(`${whole}.${digits}`), next: k } : { value: whole, next: at };
}

/** Every number in the tokens, written as digits or as words. */
export function findNumbers(tokens: Token[]): NumberMatch[] {
  const atoms = atomsOf(tokens);
  const found: NumberMatch[] = [];
  const atomIndexOfToken = new Map<number, number>();
  atoms.forEach((a, idx) => {
    if (!atomIndexOfToken.has(a.token)) atomIndexOfToken.set(a.token, idx);
  });

  for (let t = 0; t < tokens.length; t++) {
    const token = tokens[t]!;
    if (token.kind === 'digits') {
      let value = Number(token.text);
      let last = t;
      // "99 point 8"
      if (tokens[t + 1]?.lower === 'point' && tokens[t + 2]?.kind === 'digits' && Number.isInteger(value)) {
        value = Number(`${token.text}.${tokens[t + 2]!.text}`);
        last = t + 2;
      }
      found.push({ value, first: t, last, start: token.start, end: tokens[last]!.end, fromWords: false });
      t = last;
      continue;
    }
    if (token.kind !== 'word') continue;
    const atomIndex = atomIndexOfToken.get(t);
    if (atomIndex === undefined) continue;
    const parsed = parseWords(atoms, atomIndex);
    if (!parsed) continue;
    const lastAtom = atoms[parsed.next - 1]!;
    // A hyphenated token such as "thirty-eight" is one token holding two atoms; the match must not stop halfway.
    const last = lastAtom.token;
    found.push({ value: parsed.value, first: t, last, start: token.start, end: tokens[last]!.end, fromWords: true });
    t = last;
  }
  return found;
}

/**
 * Indian dictation says 140 as "one forty" and 650 as "six fifty". Only call this where a three-digit
 * value is expected (blood pressure, doses): it joins a spoken 1 to 9 with the spoken 10 to 99 right after it.
 */
export function mergeShorthand(numbers: NumberMatch[]): NumberMatch[] {
  const out: NumberMatch[] = [];
  for (let i = 0; i < numbers.length; i++) {
    const a = numbers[i]!;
    const b = numbers[i + 1];
    if (
      b && a.fromWords && b.fromWords && b.first === a.last + 1 &&
      Number.isInteger(a.value) && a.value >= 1 && a.value <= 9 &&
      Number.isInteger(b.value) && b.value >= 10 && b.value <= 99
    ) {
      out.push({ value: a.value * 100 + b.value, first: a.first, last: b.last, start: a.start, end: b.end, fromWords: true });
      i++;
    } else {
      out.push(a);
    }
  }
  return out;
}
