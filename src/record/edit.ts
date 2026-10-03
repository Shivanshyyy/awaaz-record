import { evaluate, leaves } from './completeness';
import { emptyField, type Field, type Medication, type VisitRecord } from './schema';

// Every change the worker makes goes through here and ends with evaluate(), so what the screen shows,
// what Confirm checks and what gets saved always agree.

export interface Edit {
  path: string;
  value: unknown;
}

const isEmpty = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

function findField(record: VisitRecord, path: string): Field<any> {
  const leaf = leaves(record).find((l) => l.path === path);
  if (!leaf) throw new Error(`No field at ${path}`);
  return leaf.field;
}

/** Sets values the worker typed or chose. The extractor's questions about those fields are cleared: the human has answered. */
export function applyEdits(record: VisitRecord, edits: Edit[]): VisitRecord {
  const next = structuredClone(record);
  for (const edit of edits) {
    const field = findField(next, edit.path);
    field.source = isEmpty(field.value) ? 'manual' : 'edited';
    field.value = isEmpty(edit.value) ? null : edit.value;
    field.flags = [];
    field.confirmed = false;
    field.na = false;
  }
  return evaluate(next);
}

/** "Looks right": the worker has seen the question and the evidence and accepts the value as it is. */
export function confirmFields(record: VisitRecord, paths: string[]): VisitRecord {
  const next = structuredClone(record);
  for (const path of paths) {
    const field = findField(next, path);
    if (!isEmpty(field.value)) field.confirmed = true;
  }
  return evaluate(next);
}

/** "Not applicable": nothing is wanted for this detail. */
export function markNotApplicable(record: VisitRecord, paths: string[]): VisitRecord {
  const next = structuredClone(record);
  for (const path of paths) {
    const field = findField(next, path);
    field.value = null;
    field.na = true;
    field.flags = [];
    field.source = 'edited';
  }
  return evaluate(next);
}

export function addMedication(record: VisitRecord): { record: VisitRecord; id: string } {
  const next = structuredClone(record);
  const number = Math.max(0, ...next.medications.map((m) => Number(m.id.slice(1)) || 0)) + 1;
  const id = `m${number}`;
  const med: Medication = {
    id,
    name: emptyField('manual'),
    dose: emptyField('manual'),
    unit: emptyField('manual'),
    count: emptyField('manual'),
    perDay: emptyField('manual'),
    timing: emptyField('manual'),
    prn: emptyField('manual'),
    durationDays: emptyField('manual'),
    ongoing: emptyField('manual'),
    withFood: emptyField('manual'),
  };
  next.medications.push(med);
  return { record: evaluate(next), id };
}

export function removeMedication(record: VisitRecord, id: string): VisitRecord {
  const next = structuredClone(record);
  next.medications = next.medications.filter((m) => m.id !== id);
  return evaluate(next);
}

export function confirmRecord(record: VisitRecord, at = new Date().toISOString()): VisitRecord {
  return { ...structuredClone(record), status: 'confirmed', createdAt: record.createdAt || at };
}
