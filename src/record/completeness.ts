import { displayName } from '../extract/context';
import { medicationRangeProblems, rangeProblems } from '../extract/flags';
import type { Field, Flag, FlagCode, Medication, VisitRecord } from './schema';

export interface Leaf {
  /** stable path used for edits, e.g. `patient.name` or `m1.dose` */
  path: string;
  /** the path used in flag targets, e.g. `medications[paracetamol].dose` */
  target: string;
  label: string;
  field: Field<any>;
  required: boolean;
}

const DERIVED: FlagCode[] = ['MISSING', 'MISSING_DETAIL', 'OUT_OF_RANGE'];

export function medLeaves(med: Medication): Leaf[] {
  const key = med.name.value ?? med.id;
  const shown = med.name.value ? displayName(med.name.value) : 'Medicine';
  const mk = (part: keyof Medication, label: string, required: boolean): Leaf => ({
    path: `${med.id}.${part}`,
    target: `medications[${key}].${part}`,
    label: `${shown}: ${label}`,
    field: med[part] as Field<any>,
    required,
  });
  return [
    mk('name', 'name', true),
    mk('dose', 'dose', true),
    mk('unit', 'unit', false),
    mk('count', 'tablets or spoons', false),
    mk('perDay', 'times a day', false),
    mk('timing', 'time of day', false),
    mk('prn', 'only when needed', false),
    mk('durationDays', 'days', false),
    mk('ongoing', 'continuing medicine', false),
    mk('withFood', 'with food', false),
  ];
}

export function leaves(record: VisitRecord): Leaf[] {
  const leaf = (path: string, label: string, field: Field<any>, required = false): Leaf => ({ path, target: path, label, field, required });
  return [
    leaf('patient.name', 'Name', record.patient.name, true),
    leaf('patient.ageYears', 'Age', record.patient.ageYears),
    leaf('complaint.terms', 'Complaint', record.complaint.terms, true),
    leaf('complaint.durationDays', 'How long', record.complaint.durationDays),
    leaf('vitals.temp', 'Temperature', record.vitals.temp),
    leaf('vitals.bp', 'Blood pressure', record.vitals.bp),
    leaf('vitals.pulse', 'Pulse', record.vitals.pulse),
    leaf('vitals.weightKg', 'Weight', record.vitals.weightKg),
    leaf('vitals.spo2', 'SpO2', record.vitals.spo2),
    ...record.medications.flatMap(medLeaves),
    leaf('advice.tags', 'Advice', record.advice.tags),
    leaf('advice.other', 'Other advice', record.advice.other),
    leaf('referral', 'Referral', record.referral),
    leaf('followUp', 'Follow-up', record.followUp, true),
  ];
}

const isEmpty = (v: unknown) => v === null || v === undefined || (Array.isArray(v) && v.length === 0);

function derive(field: Field<any>, flags: Flag[]) {
  field.flags = [...field.flags.filter((f) => !DERIVED.includes(f.code)), ...flags];
}

/**
 * Re-derives everything that follows from the current values (missing details, impossible numbers) and sets
 * each field's status. Flags the extractor raised from what it heard (unclear, snapped, corrected) are kept
 * until the worker edits the field or presses "Looks right".
 */
export function evaluate(input: VisitRecord): VisitRecord {
  const record = structuredClone(input);
  const ranges = rangeProblems(record);
  const medRanges = medicationRangeProblems(record);

  for (const l of leaves(record)) {
    const derived: Flag[] = [];
    const range = ranges.get(l.path) ?? (l.path.startsWith('m') ? medRanges.get(l.path) : undefined);
    if (range) derived.push({ code: 'OUT_OF_RANGE', target: l.target, message: range });
    derive(l.field, derived);
  }

  // A more specific question the extractor already raised ("follow-up was mentioned but unclear") replaces the generic one.
  const missing = (field: Field<any>, flag: Flag) => {
    if (field.na || field.flags.some((f) => !DERIVED.includes(f.code))) return;
    derive(field, [...field.flags.filter((f) => DERIVED.includes(f.code)), flag]);
  };

  if (isEmpty(record.patient.name.value)) missing(record.patient.name, { code: 'MISSING', target: 'patient.name', message: 'Patient name not heard — who is the patient?' });
  if (isEmpty(record.complaint.terms.value)) missing(record.complaint.terms, { code: 'MISSING', target: 'complaint.terms', message: 'Complaint not heard — what did the patient come for?' });
  if (record.followUp.value === null) missing(record.followUp, { code: 'MISSING', target: 'followUp', message: 'Follow-up not heard — when should the patient come back?' });
  const hasTreatment =
    record.medications.length > 0 || !isEmpty(record.advice.tags.value) || !isEmpty(record.advice.other.value) || record.referral.value !== null;
  if (!hasTreatment) {
    missing(record.advice.tags, { code: 'MISSING', target: 'treatment', message: 'Nothing was heard about medicines, advice or a referral — add at least one.' });
  }
  if (record.referral.value && record.referral.value.to === null) {
    missing(record.referral, { code: 'MISSING_DETAIL', target: 'referral.to', message: 'A referral was mentioned but the place was not heard — where should the patient go?' });
  }

  for (const med of record.medications) {
    const key = med.name.value ?? med.id;
    const shown = med.name.value ? displayName(med.name.value) : 'this medicine';
    const t = (part: string) => `medications[${key}].${part}`;
    const isPrn = med.prn.value === true;
    if (isEmpty(med.name.value)) {
      if (!med.name.flags.some((f) => !DERIVED.includes(f.code))) {
        derive(med.name, [{ code: 'MISSING', target: t('name'), message: 'Which medicine was it?' }]);
      }
    }
    if (isEmpty(med.dose.value)) missing(med.dose, { code: 'MISSING_DETAIL', target: t('dose'), message: `Dose not heard for ${shown} — what was given?` });
    if (!isEmpty(med.dose.value) && isEmpty(med.unit.value)) {
      missing(med.unit, { code: 'MISSING_DETAIL', target: t('unit'), message: `Unit not heard for ${shown} — mg, ml or something else?` });
    }
    if (!isPrn && isEmpty(med.perDay.value)) missing(med.perDay, { code: 'MISSING_DETAIL', target: t('perDay'), message: `How often should ${shown} be taken?` });
    if (!isPrn && med.ongoing.value !== true && isEmpty(med.durationDays.value)) {
      missing(med.durationDays, { code: 'MISSING_DETAIL', target: t('durationDays'), message: `For how many days should ${shown} be taken?` });
    }
  }

  for (const l of leaves(record)) l.field.status = statusOf(l.field, l.required);
  return record;
}

const AMBER: FlagCode[] = ['MISSING_DETAIL', 'UNIT_INFERRED', 'OUT_OF_RANGE', 'CONFLICT', 'CORRECTION_CUE', 'NAME_SNAPPED', 'UNCLEAR'];

export function statusOf(field: Field<any>, required: boolean): 'ok' | 'check' | 'missing' {
  if (field.na) return 'ok';
  if (field.flags.some((f) => f.code === 'MISSING')) return 'missing';
  if (required && isEmpty(field.value)) return 'missing';
  if (field.flags.some((f) => AMBER.includes(f.code))) return 'check';
  return 'ok';
}

/** The worker has dealt with this field: nothing is wrong, or they pressed "Looks right" on a real value, or marked it not applicable. */
export function isResolved(field: Field<any>): boolean {
  if (field.na) return true;
  if (field.status === 'ok') return true;
  if (field.status === 'check') return field.confirmed && !isEmpty(field.value);
  return false;
}

export interface Summary {
  ok: number;
  check: number;
  missing: number;
  /** unresolved fields, amber first would not matter: the list keeps record order */
  open: Leaf[];
}

export function summarize(record: VisitRecord): Summary {
  const open: Leaf[] = [];
  let ok = 0;
  let check = 0;
  let missing = 0;
  for (const l of leaves(record)) {
    if (isResolved(l.field)) {
      ok++;
      continue;
    }
    open.push(l);
    if (l.field.status === 'missing') missing++;
    else check++;
  }
  return { ok, check, missing, open };
}

export function canConfirm(record: VisitRecord): boolean {
  return summarize(record).open.length === 0;
}
