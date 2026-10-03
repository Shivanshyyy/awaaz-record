import { makeField, type BloodPressure, type Evidence, type Field, type Flag, type Temperature, type VisitRecord } from '../../record/schema';
import { evidenceFor, flag, type ExtractContext } from '../context';
import { findCorrectionCues } from '../lexicons/cues';
import { mergeShorthand, type NumberMatch } from '../numbers';
import { SENTENCE_END } from '../tokens';

type Vitals = VisitRecord['vitals'];
interface Candidate<T> {
  value: T;
  start: number;
  end: number;
}

const UNIT_C = new Set(['c', 'celsius', 'centigrade']);
const UNIT_F = new Set(['f', 'fahrenheit']);
const FILLER = new Set(['is', 'was', 'of', 'at', 'about', 'around', 'rate', 'level', 'reading', 'came', 'to', 'measured', 'recorded', 'noted']);

/** The first number after a cue word, allowing a few filler words but not a new sentence. */
function numberAfter(ctx: ExtractContext, cue: number, numbers: NumberMatch[], maxGap = 3): NumberMatch | undefined {
  const n = numbers.find((m) => m.first > cue);
  if (!n) return undefined;
  const between = ctx.tokens.slice(cue + 1, n.first);
  if (between.length > maxGap) return undefined;
  if (between.some((t) => SENTENCE_END.has(t.text) || (t.kind === 'word' && !FILLER.has(t.lower)))) return undefined;
  return n;
}

/** The number spoken right after a correction ("..., sorry, make that 102"), when the reading was just given. */
function correctedNumber(ctx: ExtractContext, readingEnd: number): NumberMatch | undefined {
  const cue = findCorrectionCues(ctx.text).find((c) => c.start >= readingEnd && c.start - readingEnd <= 12);
  if (!cue) return undefined;
  const merged = mergeShorthand(ctx.numbers);
  const n = merged.find((m) => m.start >= cue.end);
  return n && n.start - cue.end <= 20 ? n : undefined;
}

function cueIndexes(ctx: ExtractContext, words: string[]): number[] {
  return ctx.tokens.flatMap((t, i) => (t.kind === 'word' && words.includes(t.lower) ? [i] : []));
}

/**
 * One reading heard once is the value. The same reading heard twice with different values is either a spoken
 * correction (the later one wins, flagged) or a conflict (the first is kept, flagged): never a silent choice.
 */
function resolve<T>(
  ctx: ExtractContext,
  target: string,
  label: string,
  candidates: Candidate<T>[],
  show: (value: T) => string,
  sameValue: (a: T, b: T) => boolean,
  extraFlags: (value: T) => Flag[] = () => [],
): Field<T> {
  if (!candidates.length) return makeField<T>(null);
  const sorted = [...candidates].sort((a, b) => a.start - b.start);
  const distinct: Candidate<T>[] = [];
  for (const c of sorted) if (!distinct.some((d) => sameValue(d.value, c.value))) distinct.push(c);
  const evidence: Evidence[] = sorted.map((c) => evidenceFor(ctx, c.start, c.end));
  if (distinct.length === 1) return makeField(distinct[0]!.value, evidence.slice(0, 1), extraFlags(distinct[0]!.value));

  const a = distinct[distinct.length - 2]!;
  const b = distinct[distinct.length - 1]!;
  const cue = findCorrectionCues(ctx.text).find((c) => c.start >= a.end - 1 && c.end <= b.start + 1);
  if (cue) {
    return makeField(b.value, evidence, [
      ...extraFlags(b.value),
      flag('CORRECTION_CUE', target, `A spoken correction ("${cue.text}") was heard: ${label} ${show(a.value)} became ${show(b.value)}. Is ${show(b.value)} right?`),
    ]);
  }
  const first = distinct[0]!;
  return makeField(first.value, evidence, [
    ...extraFlags(first.value),
    flag('CONFLICT', target, `${label}: ${distinct.map((d) => show(d.value)).join(' and ')} were both heard — which is right?`),
  ]);
}

function extractTemperature(ctx: ExtractContext): Field<Temperature> {
  const { tokens } = ctx;
  for (const cue of cueIndexes(ctx, ['temperature', 'temp'])) {
    const next = tokens[cue + 1];
    const after = tokens[cue + 2];
    if (next?.lower === 'normal' || (FILLER.has(next?.lower ?? '') && after?.lower === 'normal')) {
      const last = next?.lower === 'normal' ? cue + 1 : cue + 2;
      return makeField<Temperature>({ value: null, unit: null, qualitative: 'normal' }, [evidenceFor(ctx, tokens[cue]!.start, tokens[last]!.end)]);
    }
  }
  const cues = [
    ...cueIndexes(ctx, ['temperature', 'temp']),
    ...cueIndexes(ctx, ['fever']).filter((i) => {
      const n = numberAfter(ctx, i, ctx.numbers, 2);
      return Boolean(n && n.value >= 30 && n.value <= 115);
    }),
  ];
  const found: Candidate<Temperature>[] = [];
  for (const cue of cues) {
    const n = numberAfter(ctx, cue, ctx.numbers);
    if (!n) continue;
    let end = n.end;
    let unit: 'C' | 'F' | null = null;
    let k = n.last + 1;
    if (tokens[k]?.lower === 'degrees' || tokens[k]?.lower === 'degree' || tokens[k]?.text === '°') k++;
    const word = tokens[k]?.lower ?? '';
    if (UNIT_C.has(word)) unit = 'C';
    else if (UNIT_F.has(word)) unit = 'F';
    if (unit) end = tokens[k]!.end;
    // With no unit spoken, the range tells them apart (30-45 is Celsius, 86-113 is Fahrenheit); this raises no flag.
    if (!unit) unit = n.value >= 30 && n.value <= 45 ? 'C' : n.value >= 86 && n.value <= 113 ? 'F' : null;
    found.push({ value: { value: n.value, unit }, start: tokens[cue]!.start, end });
    const fixed = correctedNumber(ctx, end);
    if (fixed) {
      const fixedUnit = unit ?? (fixed.value >= 30 && fixed.value <= 45 ? 'C' : fixed.value >= 86 && fixed.value <= 113 ? 'F' : null);
      found.push({ value: { value: fixed.value, unit: unit ?? fixedUnit }, start: fixed.start, end: fixed.end });
    }
  }
  return resolve(
    ctx,
    'vitals.temp',
    'Temperature',
    found,
    (t) => `${t.value}${t.unit ? ` °${t.unit}` : ''}`,
    (a, b) => a.value === b.value && a.unit === b.unit,
  );
}

function extractBloodPressure(ctx: ExtractContext): Field<BloodPressure> {
  const { tokens } = ctx;
  const numbers = mergeShorthand(ctx.numbers);
  const isJoiner = (i: number) => ['over', 'by', 'slash', '/'].includes(tokens[i]?.lower ?? '');
  const pairs = numbers.flatMap((sys) => {
    if (!isJoiner(sys.last + 1)) return [];
    const dia = numbers.find((m) => m.first === sys.last + 2);
    return dia ? [{ sys, dia }] : [];
  });

  const cues = tokens.flatMap((t, i) => {
    if (t.lower === 'bp') return [i];
    if (t.lower === 'blood' && tokens[i + 1]?.lower === 'pressure') return [i];
    if (t.lower === 'b' && tokens[i + 1]?.text === '.' && tokens[i + 2]?.lower === 'p') return [i];
    return [];
  });
  const cued = pairs.filter((p) => cues.some((c) => p.sys.first > c && p.sys.first - c <= 5));
  if (cued.length) {
    const cueOf = (p: (typeof cued)[number]) => Math.max(...cues.filter((c) => p.sys.first > c && p.sys.first - c <= 5));
    const candidates = cued.map((p) => ({ value: { sys: p.sys.value, dia: p.dia.value }, start: tokens[cueOf(p)]!.start, end: p.dia.end }));
    for (const c of [...candidates]) {
      // "BP 140 over 90, sorry, 150 over 95"
      const cue = findCorrectionCues(ctx.text).find((x) => x.start >= c.end && x.start - c.end <= 12);
      const fixed = cue && pairs.find((p) => p.sys.start >= cue.end && p.sys.start - cue.end <= 20);
      if (fixed) candidates.push({ value: { sys: fixed.sys.value, dia: fixed.dia.value }, start: fixed.sys.start, end: fixed.dia.end });
    }
    return resolve(
      ctx,
      'vitals.bp',
      'Blood pressure',
      candidates,
      (v) => `${v.sys}/${v.dia}`,
      (a, b) => a.sys === b.sys && a.dia === b.dia,
    );
  }
  // The word "BP" may have been misheard; a plausible "A over B" is still worth showing, but as a question.
  const loose = pairs.find(
    (p) => p.sys.value >= 60 && p.sys.value <= 260 && p.dia.value >= 30 && p.dia.value <= 160 && tokens[p.sys.last + 1]?.lower === 'over',
  );
  if (loose) {
    const evidence = evidenceFor(ctx, loose.sys.start, loose.dia.end);
    return makeField<BloodPressure>({ sys: loose.sys.value, dia: loose.dia.value }, [evidence], [
      flag('UNCLEAR', 'vitals.bp', `"${evidence.text}" was heard without the words blood pressure — is this the blood pressure?`),
    ]);
  }
  return makeField<BloodPressure>(null);
}

interface Reading {
  value: number;
  spokenUnit: boolean;
}

function extractReading(
  ctx: ExtractContext,
  target: string,
  label: string,
  cues: string[],
  unitWords: string[],
  extraCues: number[] = [],
  extraFlags: (value: number, spokenUnit: boolean) => Flag[] = () => [],
): Field<number> {
  const found: (Candidate<number> & Reading)[] = [];
  for (const cue of [...cueIndexes(ctx, cues), ...extraCues].sort((a, b) => a - b)) {
    const n = numberAfter(ctx, cue, ctx.numbers);
    if (!n) continue;
    let end = n.end;
    let k = n.last + 1;
    let spokenUnit = false;
    if (unitWords.includes(ctx.tokens[k]?.lower ?? '')) {
      end = ctx.tokens[k]!.end;
      spokenUnit = true;
      k++;
    }
    if (ctx.tokens[k]?.lower === 'per' && ctx.tokens[k + 1]?.lower === 'minute') end = ctx.tokens[k + 1]!.end;
    found.push({ value: n.value, spokenUnit, start: ctx.tokens[cue]!.start, end });
    const fixed = correctedNumber(ctx, end);
    if (fixed) found.push({ value: fixed.value, spokenUnit, start: fixed.start, end: fixed.end });
  }
  const field = resolve(ctx, target, label, found, String, (a, b) => a === b);
  const first = found.sort((a, b) => a.start - b.start)[0];
  if (first && field.value !== null) field.flags.push(...extraFlags(field.value, first.spokenUnit));
  return field;
}

export function extractVitals(ctx: ExtractContext): Vitals {
  // The tokenizer splits "SpO2" into "SpO" and "2"; the "2" token acts as the cue so the next number is the reading.
  const spo2Cues = ctx.tokens.flatMap((t, i) => (t.lower === 'spo' && ctx.tokens[i + 1]?.text === '2' ? [i + 1] : []));
  return {
    temp: extractTemperature(ctx),
    bp: extractBloodPressure(ctx),
    pulse: extractReading(ctx, 'vitals.pulse', 'Pulse', ['pulse', 'hr'], ['bpm', 'beats']),
    weightKg: extractReading(ctx, 'vitals.weightKg', 'Weight', ['weight', 'weighs', 'wt'], ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms'], [], (_value, spoken) =>
      spoken ? [] : [flag('UNIT_INFERRED', 'vitals.weightKg', 'Weight unit not heard — taken as kg. Is that right?')],
    ),
    spo2: extractReading(ctx, 'vitals.spo2', 'SpO2', ['saturation', 'sats', 'sat'], ['percent', '%'], spo2Cues),
  };
}
