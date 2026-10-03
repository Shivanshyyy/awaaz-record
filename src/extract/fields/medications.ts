import { emptyField, makeField, type DoseUnit, type Evidence, type Medication, type Timing } from '../../record/schema';
import { displayName, evidenceFor, flag, tokenAt, type ExtractContext, type Span } from '../context';
import { DURATION_UNITS, findCorrectionCues } from '../lexicons/cues';
import { DRUGS, findDrugs, type Drug } from '../lexicons/drugs';
import { mergeShorthand, type NumberMatch } from '../numbers';
import { editDistance, skeleton } from '../skeleton';
import { SENTENCE_END } from '../tokens';

const DOSE_UNITS: Record<string, DoseUnit> = {
  mg: 'mg', mgs: 'mg', milligram: 'mg', milligrams: 'mg', milligramme: 'mg', milligrammes: 'mg',
  g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g',
  mcg: 'mcg', microgram: 'mcg', micrograms: 'mcg',
  ml: 'ml', mls: 'ml', millilitre: 'ml', millilitres: 'ml', milliliter: 'ml', milliliters: 'ml',
  iu: 'iu', unit: 'units', units: 'units',
};
const COUNT_WORDS = new Set(['tablet', 'tablets', 'tab', 'tabs', 'capsule', 'capsules', 'cap', 'caps', 'sachet', 'sachets', 'packet', 'packets', 'spoon', 'spoons', 'teaspoon', 'teaspoons', 'tsp', 'drop', 'drops', 'puff', 'puffs']);
const NOT_A_DOSE_NEXT = new Set(['times', 'time', 'day', 'days', 'week', 'weeks', 'month', 'months', 'hour', 'hours', 'daily', 'a', 'per', 'x']);
const SECTION_CUES = new Set(['advised', 'advise', 'advice', 'counselled', 'counseled', 'referred', 'refer', 'referral', 'review', 'reviewed', 'follow', 'follow-up', 'followup', 'revisit', 'patient', 'temperature', 'temp', 'pulse', 'weight', 'bp', 'spo', 'saturation', 'complains', 'complaining']);
const CONTINUES_AFTER_STOP = new Set(['once', 'twice', 'thrice', 'daily', 'every', 'for', 'after', 'before', 'morning', 'afternoon', 'night', 'at', 'as', 'when']);
const ONGOING_WORDS = new Set(['continue', 'continuing', 'continues', 'continued', 'ongoing', 'regularly']);
// Words that end the scan for a garbled medicine name. "and", "a" and "the" do not: recognition often turns
// a drug name into a phrase that contains them ("the Tuesday and" for cetirizine).
const HEARD_STOP = new Set([
  'gave', 'give', 'gives', 'given', 'giving', 'prescribed', 'prescribe', 'started', 'start', 'starts', 'continue', 'continues', 'continued',
  'for', 'on', 'is', 'was', 'with', 'also', 'plus', 'then',
  'sorry', 'make', 'mean', 'correction', 'wait', 'scratch', 'actually', 'rather', 'mistake',
  'after', 'before', 'every', 'daily', 'once', 'twice', 'thrice', 'times', 'time', 'day', 'days', 'night', 'morning', 'afternoon',
]);
const HEARD_SKIP = new Set(['a', 'an', 'the', 'it', 'he', 'she', 'some', 'her', 'him', 'and', 'of', 'that', 'this']);
const GIVE_VERBS = new Set(['gave', 'given', 'give', 'gives', 'giving', 'prescribed', 'started']);
const MED_DETAIL = /\b(?:tablets?|tabs?|capsules?|syrup|injection|drops)\b|\d+\s*(?:mg|ml)\b|\b(?:once|twice|thrice|bd|tds|qid)\b|\btimes\s+(?:a|per)\s+day\b/i;
const NOT_A_DRUG_WORD = new Set(['one', 'two', 'three', 'four', 'five', 'six', 'half', 'each', 'every', 'this', 'that', 'same', 'new', 'another', 'extra', 'full', 'daily', 'cough', 'cold', 'fever', 'pain', 'the', 'his', 'her', 'him', 'them', 'any', 'some']);
const PRN = /\b(?:when|as|if)\s+(?:needed|required|necessary)\b|\bonly\s+if\s+(?:needed|required)\b|\bsos\b|\bprn\b|\b(?:after|with)\s+(?:every|each)\s+(?:loose\s+)?(?:stool|stools|motion|motions|vomit|vomiting|vomits)\b/i;
const AFTER_FOOD = /\bafter\s+(?:food|meals?|eating|breakfast|lunch|dinner)\b/i;
const BEFORE_FOOD = /\bbefore\s+(?:food|meals?|eating|breakfast|lunch|dinner)\b/i;
const FORM_WORDS = new Set(['tablet', 'tablets', 'tab', 'tabs', 'syrup', 'capsule', 'capsules', 'cap', 'caps', 'injection', 'inj', 'drops', 'drop', 'cream', 'ointment', 'sachet', 'sachets', 'suspension']);

type Mention =
  | { kind: 'known'; drug: Drug; start: number; end: number; segStart: number }
  | { kind: 'unknown'; start: number; end: number; segStart: number; heard: string; candidates: Drug[]; snapped: Drug | null };

interface DoseAnchor {
  n: NumberMatch;
  unit: DoseUnit;
  unitToken: number;
}

export interface MedicationResult {
  medications: Medication[];
  segments: Span[];
}

// Skeleton keys for every drug name and alias long enough to compare safely.
const SKELETONS = DRUGS.flatMap((drug) =>
  drug.aliases
    .filter((a) => a.replace(/[^a-z]/gi, '').length >= 5)
    .map((alias) => ({ drug, key: skeleton(alias) }))
    .filter((k) => k.key.length >= 4),
);

function snapCandidates(phraseKeys: string[]): Drug[] {
  const best = new Map<Drug, number>();
  for (const key of phraseKeys) {
    if (key.length < 3) continue;
    for (const lex of SKELETONS) {
      const dist = editDistance(key, lex.key);
      const allowed = lex.key.length >= 6 ? 2 : 1;
      if (dist <= allowed && dist / Math.max(key.length, lex.key.length) <= 0.34) {
        best.set(lex.drug, Math.min(best.get(lex.drug) ?? 9, dist));
      }
    }
  }
  return [...best.entries()].sort((a, b) => a[1] - b[1]).map(([drug]) => drug);
}

function doseAnchors(ctx: ExtractContext): DoseAnchor[] {
  return mergeShorthand(ctx.numbers).flatMap((n) => {
    const unit = DOSE_UNITS[ctx.tokens[n.last + 1]?.lower ?? ''];
    return unit ? [{ n, unit, unitToken: n.last + 1 }] : [];
  });
}

function sentenceBreakBetween(ctx: ExtractContext, a: number, b: number): boolean {
  return ctx.tokens.slice(Math.min(a, b), Math.max(a, b)).some((t) => SENTENCE_END.has(t.text));
}

function isNumberToken(ctx: ExtractContext, i: number): boolean {
  return ctx.numbers.some((n) => i >= n.first && i <= n.last);
}

/** Word tokens just before position `from`, stopping at punctuation, verbs, numbers, doses and forms. */
function heardBefore(ctx: ExtractContext, from: number): number[] {
  const out: number[] = [];
  for (let i = from - 1; i >= 0 && out.length < 6; i--) {
    const t = ctx.tokens[i]!;
    if (SENTENCE_END.has(t.text) || t.text === ',' || t.text === ':') break;
    if (t.kind === 'punct') continue;
    if (HEARD_STOP.has(t.lower) || DOSE_UNITS[t.lower] || FORM_WORDS.has(t.lower) || isNumberToken(ctx, i)) break;
    out.unshift(i);
  }
  return out;
}

/** Turns the words heard before a dose (or a "syrup") into a medicine mention: snapped, ambiguous, or unknown. */
function mentionFromHeard(ctx: ExtractContext, collected: number[], fallbackStart: number, fallbackEnd: number): Mention {
  const suffixes = [1, 2, 3, 4, 5]
    .filter((k) => k <= collected.length)
    .map((k) => collected.slice(-k))
    .map((idx) => ({ idx, key: skeleton(idx.map((i) => ctx.tokens[i]!.text).join('')) }));
  const candidates = snapCandidates(suffixes.map((x) => x.key));
  const snapped = candidates.length === 1 ? candidates[0]! : null;
  const snappedFrom = snapped ? suffixes.filter((x) => snapCandidates([x.key])[0] === snapped).at(-1) : undefined;

  let phrase = snappedFrom?.idx ?? collected.slice(-2);
  while (phrase.length > 0 && HEARD_SKIP.has(ctx.tokens[phrase[0]!]!.lower)) phrase = phrase.slice(1);
  if (phrase.length === 0) {
    return { kind: 'unknown', start: fallbackStart, end: fallbackEnd, segStart: fallbackStart, heard: '', candidates: [], snapped: null };
  }
  const first = ctx.tokens[phrase[0]!]!;
  const last = ctx.tokens[phrase.at(-1)!]!;
  return { kind: 'unknown', start: first.start, end: last.end, segStart: first.start, heard: ctx.text.slice(first.start, last.end), candidates, snapped };
}

// A medicine the worker said but the model garbled: a dose with no known drug name near it, or a tablet/syrup
// word that follows something that sounds like a drug.
function unknownMentions(ctx: ExtractContext, known: Mention[], anchors: DoseAnchor[]): Mention[] {
  const used = new Set<DoseAnchor>();
  for (const m of known) {
    const at = tokenAt(ctx, m.end);
    const after = anchors.find((a) => !used.has(a) && a.n.first >= at && a.n.first - at <= 4 && !sentenceBreakBetween(ctx, at, a.n.first));
    if (after) {
      used.add(after);
      continue;
    }
    const mentionToken = tokenAt(ctx, m.start);
    const before = anchors.find((a) => !used.has(a) && a.unitToken < mentionToken && mentionToken - a.unitToken <= 4 && !sentenceBreakBetween(ctx, a.unitToken, mentionToken));
    if (before) used.add(before);
  }

  const out: Mention[] = [];
  for (const anchor of anchors) {
    if (used.has(anchor)) continue;
    const collected = heardBefore(ctx, anchor.n.first);
    out.push(mentionFromHeard(ctx, collected, anchor.n.start, anchor.n.end));
  }

  // "Farasetamal syrup": no dose was spoken, but a word that sounds like a drug sits before a form word.
  const taken = [...known, ...out];
  ctx.tokens.forEach((t, f) => {
    if (!FORM_WORDS.has(t.lower)) return;
    const covered = taken.some((m) => {
      const first = tokenAt(ctx, m.segStart);
      const last = tokenAt(ctx, m.end);
      return f >= first && f <= last + 4 && !sentenceBreakBetween(ctx, last, f);
    });
    if (covered) return;
    const collected = heardBefore(ctx, f).filter((i) => !NOT_A_DRUG_WORD.has(ctx.tokens[i]!.lower));
    if (!collected.length) return;
    const mention = mentionFromHeard(ctx, collected, t.start, t.end);
    if (mention.kind === 'unknown' && mention.candidates.length > 0) {
      out.push(mention);
      taken.push(mention);
    }
  });

  // "gave Ferris 8 mile 651 tablet 3 times a day": the name is unreadable, but the sentence still describes a medicine.
  ctx.tokens.forEach((t, v) => {
    if (!GIVE_VERBS.has(t.lower)) return;
    const clauseEndAt = (() => {
      let k = v + 1;
      while (k < ctx.tokens.length && k - v <= 16 && !SENTENCE_END.has(ctx.tokens[k]!.text) && !SECTION_CUES.has(ctx.tokens[k]!.lower)) k++;
      return k;
    })();
    const regionStart = ctx.tokens[v + 1]?.start;
    if (regionStart === undefined || clauseEndAt <= v + 1) return;
    const regionEnd = ctx.tokens[clauseEndAt - 1]!.end;
    const region = ctx.text.slice(regionStart, regionEnd);
    const hasMention = [...known, ...out].some((m) => m.segStart >= regionStart - 1 && m.segStart <= regionEnd);
    if (hasMention || !MED_DETAIL.test(region)) return;
    let first = v + 1;
    while (first < clauseEndAt && (HEARD_SKIP.has(ctx.tokens[first]!.lower) || ['him', 'her', 'them', 'patient'].includes(ctx.tokens[first]!.lower))) first++;
    if (first >= clauseEndAt) return;
    const words: number[] = [];
    for (let i = first; i < clauseEndAt && words.length < 3; i++) {
      if (ctx.tokens[i]!.kind !== 'word' || isNumberToken(ctx, i) || HEARD_STOP.has(ctx.tokens[i]!.lower) || FORM_WORDS.has(ctx.tokens[i]!.lower)) break;
      words.push(i);
    }
    const startTok = ctx.tokens[first]!;
    const heard = words.length ? ctx.text.slice(ctx.tokens[words[0]!]!.start, ctx.tokens[words.at(-1)!]!.end) : '';
    out.push({ kind: 'unknown', start: startTok.start, end: words.length ? ctx.tokens[words.at(-1)!]!.end : startTok.end, segStart: startTok.start, heard, candidates: [], snapped: null });
  });
  return out;
}

function preDoseStart(ctx: ExtractContext, start: number, anchors: DoseAnchor[]): number {
  let k = tokenAt(ctx, start) - 1;
  while (k >= 0 && FORM_WORDS.has(ctx.tokens[k]!.lower)) k--;
  const anchor = anchors.find((a) => a.unitToken === k);
  return anchor ? ctx.tokens[anchor.n.first]!.start : start;
}

function segmentEnd(ctx: ExtractContext, mention: Mention, nextStart: number, cueStarts: number[]): number {
  let end = nextStart;
  for (const c of cueStarts) if (c > mention.end && c < end) end = c;
  const from = tokenAt(ctx, mention.end);
  for (let i = from; i < ctx.tokens.length && ctx.tokens[i]!.start < end; i++) {
    const t = ctx.tokens[i]!;
    if (SECTION_CUES.has(t.lower)) return t.start;
    if (SENTENCE_END.has(t.text)) {
      const next = ctx.tokens[i + 1];
      const startsNumber = next ? ctx.numbers.some((n) => n.first === i + 1) : false;
      if (next && (startsNumber || CONTINUES_AFTER_STOP.has(next.lower))) continue;
      return t.end;
    }
  }
  return Math.min(end, ctx.text.length);
}

function parseFrequency(ctx: ExtractContext, from: number, to: number, nums: NumberMatch[]): { perDay: number; first: number; last: number } | null {
  const toks = ctx.tokens;
  for (let i = from; i < to; i++) {
    const w = toks[i]!.lower;
    if (w === 'times' || w === 'time') {
      const n = nums.find((m) => m.last === i - 1);
      const tailIdx = [i + 1, i + 2, i + 3].find((j) => j < to && ['day', 'daily'].includes(toks[j]?.lower ?? ''));
      if (n && Number.isInteger(n.value) && tailIdx !== undefined) return { perDay: n.value, first: n.first, last: tailIdx };
    }
    if (w === 'every') {
      const n = nums.find((m) => m.first === i + 1);
      if (n && ['hour', 'hours', 'hourly'].includes(toks[n.last + 1]?.lower ?? '') && n.value > 0 && n.value <= 24) {
        return { perDay: Math.floor(24 / n.value), first: i, last: n.last + 1 };
      }
    }
  }
  const words: [string[], number][] = [[['once'], 1], [['twice'], 2], [['thrice'], 3], [['bd', 'bid'], 2], [['tds', 'tid'], 3], [['qid', 'qds'], 4], [['od'], 1]];
  for (let i = from; i < to; i++) {
    const w = toks[i]!.lower;
    for (const [forms, perDay] of words) {
      if (!forms.includes(w)) continue;
      const tail = [toks[i + 1]?.lower, toks[i + 2]?.lower];
      if (w === 'once' && (tail.includes('week') || tail.includes('weekly') || tail.includes('month'))) continue;
      return { perDay, first: i, last: i };
    }
  }
  const daily = toks.slice(from, to).findIndex((t) => t.lower === 'daily');
  return daily === -1 ? null : { perDay: 1, first: from + daily, last: from + daily };
}

function parseDuration(ctx: ExtractContext, from: number, to: number, nums: NumberMatch[]): { days: number; start: number; end: number } | null {
  const toks = ctx.tokens;
  for (const n of nums) {
    const unit = DURATION_UNITS[toks[n.last + 1]?.lower ?? ''];
    if (unit === undefined || !Number.isInteger(n.value)) continue;
    const lead = [toks[n.first - 1], toks[n.first - 2]].map((t) => t?.lower);
    if (lead[0] === 'for' || lead[0] === 'x' || (lead[0] === 'next' && lead[1] === 'for') || (lead[0] === 'next' && lead[1] === 'the')) {
      const startTok = lead[0] === 'next' ? n.first - 2 : n.first - 1;
      return { days: n.value * unit, start: toks[Math.max(startTok, from)]!.start, end: toks[n.last + 1]!.end };
    }
  }
  for (let i = from; i < to - 2; i++) {
    const unit = DURATION_UNITS[toks[i + 2]?.lower ?? ''];
    if (toks[i]!.lower === 'for' && ['a', 'an'].includes(toks[i + 1]!.lower) && unit !== undefined) {
      return { days: unit, start: toks[i]!.start, end: toks[i + 2]!.end };
    }
  }
  return null;
}

function buildMedication(ctx: ExtractContext, index: number, m: Mention, segStart: number, segEnd: number): Medication {
  const from = tokenAt(ctx, segStart);
  let to = from;
  while (to < ctx.tokens.length && ctx.tokens[to]!.start < segEnd) to++;
  const segText = ctx.text.slice(segStart, segEnd);
  const nums = mergeShorthand(ctx.numbers.filter((n) => n.first >= from && n.last < to));
  const drugDefault = m.kind === 'known' ? m.drug.defaultUnit : m.snapped?.defaultUnit;
  const displayKey = m.kind === 'known' ? m.drug.name : m.snapped?.name ?? m.heard.toLowerCase();
  const shown = displayName(displayKey);
  const path = `medications[${displayKey}]`;

  const id = `m${index + 1}`;
  const med: Medication = {
    id,
    name: emptyField(),
    dose: emptyField(),
    unit: emptyField(),
    count: emptyField(),
    perDay: emptyField(),
    timing: emptyField(),
    prn: emptyField(),
    durationDays: emptyField(),
    ongoing: emptyField(),
    withFood: emptyField(),
  };

  // name
  const nameEvidence = [evidenceFor(ctx, m.start, m.end)];
  if (m.kind === 'known') {
    med.name = makeField(m.drug.name, nameEvidence);
  } else if (m.snapped) {
    med.name = makeField(m.snapped.name, nameEvidence, [
      flag('NAME_SNAPPED', `${path}.name`, `"${m.heard}" was heard — taken as ${displayName(m.snapped.name)}. Is that the medicine?`),
    ]);
  } else if (m.candidates.length > 1) {
    const names = m.candidates.slice(0, 3).map((d) => displayName(d.name));
    med.name = makeField<string>(null, nameEvidence, [
      flag('NAME_SNAPPED', `${path}.name`, `"${m.heard}" was heard — it could be ${names.join(' or ')}. Which medicine was it?`),
    ]);
  } else {
    const heardText = m.heard ? `heard "${m.heard}"` : 'no name was heard with the dose';
    med.name = makeField<string>(null, nameEvidence, [flag('UNCLEAR', `${path}.name`, `Medicine name not recognised \u2014 ${heardText}. Which medicine was it?`)]);
  }

  // dose and unit
  let dose: { value: number; unit: DoseUnit | null; start: number; end: number } | null = null;
  for (const n of nums) {
    const unit = DOSE_UNITS[ctx.tokens[n.last + 1]?.lower ?? ''];
    if (unit && n.last + 1 < to) {
      dose = { value: n.value, unit, start: n.start, end: ctx.tokens[n.last + 1]!.end };
      break;
    }
  }
  let unitInferred = false;
  if (!dose) {
    const after = tokenAt(ctx, m.end);
    for (const n of nums) {
      if (n.first < after) continue;
      const lead = ctx.tokens[n.first - 1]?.lower ?? '';
      const next = ctx.tokens[n.last + 1]?.lower ?? '';
      if (['for', 'every', 'x', 'after', 'in', 'within'].includes(lead) || NOT_A_DOSE_NEXT.has(next) || (COUNT_WORDS.has(next) && n.value < 100) || n.value < 10) continue;
      dose = { value: n.value, unit: drugDefault ?? null, start: n.start, end: n.end };
      unitInferred = Boolean(drugDefault);
      break;
    }
  }
  if (dose) {
    med.dose = makeField(dose.value, [evidenceFor(ctx, dose.start, dose.end)]);
    if (dose.unit) {
      med.unit = makeField(dose.unit, [evidenceFor(ctx, dose.start, dose.end)]);
      if (unitInferred) {
        med.unit.flags.push(flag('UNIT_INFERRED', `${path}.unit`, `Unit not heard for ${shown} — taken as ${dose.unit}. Is that right?`));
      }
    }
  }

  // number of tablets, spoons, and so on
  for (const n of nums) {
    const next = ctx.tokens[n.last + 1]?.lower ?? '';
    if (COUNT_WORDS.has(next)) {
      med.count = makeField(n.value, [evidenceFor(ctx, n.start, ctx.tokens[n.last + 1]!.end)]);
      break;
    }
  }
  const half = ctx.tokens.findIndex((t, i) => i >= from && i < to && t.lower === 'half' && COUNT_WORDS.has(ctx.tokens[i + 1]?.lower ?? ''));
  if (half !== -1 && med.count.value === null) med.count = makeField(0.5, [evidenceFor(ctx, ctx.tokens[half]!.start, ctx.tokens[half + 1]!.end)]);

  // how often
  const freq = parseFrequency(ctx, from, to, nums);
  if (freq) med.perDay = makeField(freq.perDay, [evidenceFor(ctx, ctx.tokens[freq.first]!.start, ctx.tokens[freq.last]!.end)]);

  // time of day
  const timing: Timing[] = [];
  const timingEvidence: Evidence[] = [];
  for (let i = from; i < to; i++) {
    const w = ctx.tokens[i]!.lower;
    const slot: Timing | null = ['morning', 'mornings'].includes(w) ? 'morning' : w === 'afternoon' ? 'afternoon' : ['night', 'bedtime', 'nightly', 'nocte'].includes(w) ? 'night' : null;
    if (slot) {
      if (!timing.includes(slot)) timing.push(slot);
      timingEvidence.push(evidenceFor(ctx, ctx.tokens[i]!.start, ctx.tokens[i]!.end));
    } else if (w === 'evening') {
      med.timing.flags.push(flag('UNCLEAR', `${path}.timing`, `"evening" was heard for ${shown} — morning, afternoon or night?`));
      timingEvidence.push(evidenceFor(ctx, ctx.tokens[i]!.start, ctx.tokens[i]!.end));
    }
  }
  if (timing.length || timingEvidence.length) {
    med.timing = makeField(timing.length ? timing : null, timingEvidence, med.timing.flags);
  }

  // only when needed
  const prn = PRN.exec(segText);
  if (prn) med.prn = makeField(true, [evidenceFor(ctx, segStart + prn.index, segStart + prn.index + prn[0].length)]);

  // for how long, or "continue"
  const duration = parseDuration(ctx, from, to, nums);
  if (duration) med.durationDays = makeField(duration.days, [evidenceFor(ctx, duration.start, duration.end)]);
  // "continue amlodipine": the word sits just before the medicine (same sentence) or inside its segment
  const ongoingScan: number[] = [];
  for (let i = from - 1; i >= Math.max(0, from - 3); i--) {
    if (SENTENCE_END.has(ctx.tokens[i]!.text)) break;
    ongoingScan.push(i);
  }
  for (let i = from; i < to; i++) ongoingScan.push(i);
  const ongoingAt = ongoingScan.find((i) => ONGOING_WORDS.has(ctx.tokens[i]!.lower));
  if (ongoingAt !== undefined) med.ongoing = makeField(true, [evidenceFor(ctx, ctx.tokens[ongoingAt]!.start, ctx.tokens[ongoingAt]!.end)]);

  // with food
  const after = AFTER_FOOD.exec(segText);
  const before = BEFORE_FOOD.exec(segText);
  if (after && !before) med.withFood = makeField<'after' | 'before'>('after', [evidenceFor(ctx, segStart + after.index, segStart + after.index + after[0].length)]);
  if (before && !after) med.withFood = makeField<'after' | 'before'>('before', [evidenceFor(ctx, segStart + before.index, segStart + before.index + before[0].length)]);

  return med;
}

export function extractMedications(ctx: ExtractContext): MedicationResult {
  const anchors = doseAnchors(ctx);
  const known: Mention[] = findDrugs(ctx.text).map((m) => ({ kind: 'known', drug: m.entry, start: m.start, end: m.end, segStart: preDoseStart(ctx, m.start, anchors) }));
  const mentions = [...known, ...unknownMentions(ctx, known, anchors)].sort((a, b) => a.segStart - b.segStart);
  // "Sorry, make that" is one spoken correction, not two: cues a few characters apart are joined.
  const cues: { start: number; end: number; text: string }[] = [];
  for (const c of findCorrectionCues(ctx.text)) {
    const last = cues.at(-1);
    if (last && c.start - last.end <= 3) {
      last.end = c.end;
      last.text = ctx.text.slice(last.start, c.end);
    } else {
      cues.push({ start: c.start, end: c.end, text: c.text });
    }
  }
  const cueStarts = cues.map((c) => c.start);

  const medications: Medication[] = [];
  const segments: (Span & { index: number })[] = [];
  mentions.forEach((m, i) => {
    const nextStart = mentions[i + 1]?.segStart ?? ctx.text.length;
    const start = m.segStart;
    const end = Math.max(segmentEnd(ctx, m, nextStart, cueStarts), m.end);
    medications.push(buildMedication(ctx, i, m, start, end));
    segments.push({ start, end, index: i });
  });

  // "gave diclofenac ... sorry, make that ibuprofen": keep both and ask which one is right.
  for (const cue of cues) {
    const next = segments.find((s) => s.start >= cue.end && s.start - cue.end <= 40);
    const previous = [...segments].reverse().find((s) => s.end <= cue.start + 1);
    if (!next || !previous || next.index === previous.index) continue;
    const a = medications[previous.index]!;
    const b = medications[next.index]!;
    const nameOf = (med: Medication) => (med.name.value ? displayName(med.name.value) : 'the first medicine');
    for (const [med, other] of [[a, b], [b, a]] as const) {
      med.name.flags.push(
        flag('CORRECTION_CUE', `medications[${med.name.value ?? med.id}].name`, `A spoken correction ("${cue.text}") was heard between ${nameOf(a)} and ${nameOf(b)}. Which medicine is right? Remove the other one.`),
      );
      void other;
    }
  }
  return { medications, segments };
}
