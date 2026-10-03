import type { Field, Flag, VisitRecord } from '../record/schema';

// Implements the "matching" rules written in eval/scripts.json. Used by the Vitest cases and by `npm run eval`.

export interface ExpectedMedication {
  name: string;
  dose?: number;
  unit?: string;
  perDay?: number;
  timing?: string[];
  prn?: boolean;
  durationDays?: number;
  ongoing?: boolean;
  withFood?: string;
}

export interface Expect {
  patient: { name: string; ageYears: number };
  complaint: { keywords: string[]; mustNotContain?: string[]; durationDays: number | null };
  vitals: {
    temp?: { value?: number; unit?: string; qualitative?: string };
    bp?: { sys: number; dia: number };
    pulse?: number;
    weightKg?: number;
  };
  medications: ExpectedMedication[];
  mayAlsoContain?: { name: string; requireFlag: string }[];
  advice: { tags: string[] };
  referral: { to: string; urgent: boolean } | null;
  followUp: { kind: string; days?: number; date?: string } | null;
  flags: { code: string; target: string }[];
}

export interface ScriptCase {
  id: string;
  tests: string;
  noisyVariant: boolean;
  text: string;
  expect: Expect;
}

export interface Check {
  area: string;
  ok: boolean;
  detail: string;
  /** a wrong value that nothing flagged: it looks fine to the worker */
  silent?: boolean;
}

export interface ScriptScore {
  id: string;
  checks: Check[];
  flagChecks: Check[];
  extraFlags: Flag[];
}

export function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(above + 1, row[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length]!;
}

export function allFlags(record: VisitRecord): Flag[] {
  const fields = [
    record.patient.name,
    record.patient.ageYears,
    record.complaint.terms,
    record.complaint.durationDays,
    record.vitals.temp,
    record.vitals.bp,
    record.vitals.pulse,
    record.vitals.weightKg,
    record.vitals.spo2,
    record.advice.tags,
    record.advice.other,
    record.referral,
    record.followUp,
    ...record.medications.flatMap((m) => [m.name, m.dose, m.unit, m.count, m.perDay, m.timing, m.prn, m.durationDays, m.ongoing, m.withFood]),
  ];
  return fields.flatMap((f) => f.flags);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (list: string[]) => [...list].sort();

export function scoreScript(script: ScriptCase, record: VisitRecord): ScriptScore {
  const { expect } = script;
  const checks: Check[] = [];
  // `fields` are the record fields the check looks at; a wrong value is "silent" when none of them asks the worker anything.
  const add = (area: string, ok: boolean, detail: string, ...fields: Field<any>[]) =>
    checks.push({ area, ok, detail, ...(ok ? {} : { silent: fields.every((f) => f.status === 'ok') }) });
  const allMedFields = record.medications.flatMap((m) => [m.name, m.dose, m.unit, m.perDay, m.timing, m.prn, m.durationDays, m.ongoing, m.withFood]);

  const name = record.patient.name.value ?? '';
  add('patient.name', levenshtein(name.toLowerCase(), expect.patient.name.toLowerCase()) <= 2, `got "${name}", want "${expect.patient.name}"`, record.patient.name);
  add('patient.ageYears', record.patient.ageYears.value === expect.patient.ageYears, `got ${record.patient.ageYears.value}, want ${expect.patient.ageYears}`, record.patient.ageYears);

  const terms = record.complaint.terms.value ?? [];
  const haystack = [...terms, ...record.complaint.terms.evidence.map((e) => e.text)].join(' ').toLowerCase();
  const missingKeywords = expect.complaint.keywords.filter((k) => !haystack.includes(k.toLowerCase()));
  add('complaint.keywords', missingKeywords.length === 0, `terms ${JSON.stringify(terms)}, missing ${JSON.stringify(missingKeywords)}`, record.complaint.terms);
  if (expect.complaint.mustNotContain) {
    const present = expect.complaint.mustNotContain.filter((w) => terms.some((t) => t.toLowerCase().includes(w.toLowerCase())));
    add('complaint.mustNotContain', present.length === 0, `forbidden words found: ${JSON.stringify(present)}`, record.complaint.terms);
  }
  add('complaint.durationDays', record.complaint.durationDays.value === expect.complaint.durationDays, `got ${record.complaint.durationDays.value}, want ${expect.complaint.durationDays}`, record.complaint.durationDays);

  const { vitals } = expect;
  if (vitals.temp) {
    const got = record.vitals.temp.value;
    const want = vitals.temp;
    const ok = want.qualitative
      ? got?.qualitative === want.qualitative
      : got?.value === want.value && got?.unit === want.unit;
    add('vitals.temp', ok, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`, record.vitals.temp);
  }
  if (vitals.bp) add('vitals.bp', same(record.vitals.bp.value, vitals.bp), `got ${JSON.stringify(record.vitals.bp.value)}, want ${JSON.stringify(vitals.bp)}`, record.vitals.bp);
  if (vitals.pulse !== undefined) add('vitals.pulse', record.vitals.pulse.value === vitals.pulse, `got ${record.vitals.pulse.value}, want ${vitals.pulse}`, record.vitals.pulse);
  if (vitals.weightKg !== undefined) add('vitals.weightKg', record.vitals.weightKg.value === vitals.weightKg, `got ${record.vitals.weightKg.value}, want ${vitals.weightKg}`, record.vitals.weightKg);

  const flags = allFlags(record);
  const mayAlso = expect.mayAlsoContain ?? [];
  const wantedNames = new Set(expect.medications.map((m) => m.name));
  for (const want of expect.medications) {
    const got = record.medications.find((m) => m.name.value === want.name);
    add(`medications[${want.name}]`, Boolean(got), got ? 'found' : `not found; got ${JSON.stringify(record.medications.map((m) => m.name.value))}`, ...allMedFields);
    if (!got) continue;
    const props: [keyof ExpectedMedication, unknown, unknown][] = [
      ['dose', want.dose, got.dose.value],
      ['unit', want.unit, got.unit.value],
      ['perDay', want.perDay, got.perDay.value],
      ['timing', want.timing && sorted(want.timing), got.timing.value && sorted(got.timing.value)],
      ['prn', want.prn, got.prn.value === true ? true : undefined],
      ['durationDays', want.durationDays, got.durationDays.value],
      ['ongoing', want.ongoing, got.ongoing.value === true ? true : undefined],
      ['withFood', want.withFood, got.withFood.value],
    ];
    for (const [key, wanted, actual] of props) {
      if (want[key] === undefined) continue;
      add(`medications[${want.name}].${key}`, same(wanted, actual), `got ${JSON.stringify(actual)}, want ${JSON.stringify(wanted)}`, got[key === 'dose' ? 'dose' : key === 'unit' ? 'unit' : key === 'perDay' ? 'perDay' : key === 'timing' ? 'timing' : key === 'prn' ? 'prn' : key === 'durationDays' ? 'durationDays' : key === 'ongoing' ? 'ongoing' : 'withFood'], got.name);
    }
  }
  for (const med of record.medications) {
    const name = med.name.value;
    if (name && wantedNames.has(name)) continue;
    const allowed = mayAlso.find((m) => m.name === name);
    const carriesFlag = allowed ? flags.some((f) => f.code === allowed.requireFlag && f.target.includes(name ?? '')) || med.name.flags.some((f) => f.code === allowed.requireFlag) : false;
    add(`medications[${name ?? '?'}] extra`, Boolean(allowed && carriesFlag), allowed ? `allowed only with a ${allowed.requireFlag} flag` : 'unexpected medicine (false positive)', med.name, med.dose, med.perDay, med.durationDays);
  }

  add('advice.tags', same(sorted(record.advice.tags.value ?? []), sorted(expect.advice.tags)), `got ${JSON.stringify(record.advice.tags.value)}, want ${JSON.stringify(expect.advice.tags)}`, record.advice.tags);

  if (expect.referral === null) {
    add('referral', record.referral.value === null, `got ${JSON.stringify(record.referral.value)}, want none`, record.referral);
  } else {
    const got = record.referral.value;
    const ok = Boolean(got && (got.to ?? '').toLowerCase().includes(expect.referral.to.toLowerCase()) && got.urgent === expect.referral.urgent);
    add('referral', ok, `got ${JSON.stringify(got)}, want ${JSON.stringify(expect.referral)}`, record.referral);
  }

  if (expect.followUp === null) {
    add('followUp', record.followUp.value === null, `got ${JSON.stringify(record.followUp.value)}, want none`, record.followUp);
  } else {
    const got = record.followUp.value as Record<string, unknown> | null;
    const want = expect.followUp;
    const ok = Boolean(got && got.kind === want.kind && (want.days === undefined || got.days === want.days) && (want.date === undefined || got.date === want.date));
    add('followUp', ok, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`, record.followUp);
  }

  const flagChecks = expect.flags.map((want) => {
    const hit = flags.some((f) => f.code === want.code && f.target.toLowerCase().includes(want.target.toLowerCase()));
    return { area: `flag ${want.code} @ ${want.target}`, ok: hit, detail: hit ? 'raised' : `not raised; flags were ${JSON.stringify(flags.map((f) => `${f.code}@${f.target}`))}` };
  });
  const extraFlags = flags.filter((f) => !expect.flags.some((w) => w.code === f.code && f.target.toLowerCase().includes(w.target.toLowerCase())));

  return { id: script.id, checks, flagChecks, extraFlags };
}

export function accuracy(scores: ScriptScore[]): { passed: number; total: number; ratio: number; wrong: number; silentWrong: number } {
  const all = scores.flatMap((s) => s.checks);
  const passed = all.filter((c) => c.ok).length;
  const wrong = all.length - passed;
  return { passed, total: all.length, ratio: all.length ? passed / all.length : 0, wrong, silentWrong: all.filter((c) => !c.ok && c.silent).length };
}
