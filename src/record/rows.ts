import { displayName } from '../extract/context';
import { isResolved, leaves, medLeaves, type Leaf } from './completeness';
import type { Evidence, Flag, FollowUp, Status, Temperature, VisitRecord } from './schema';

export type EditorKind =
  | 'text' | 'number' | 'terms' | 'temp' | 'bp' | 'medName' | 'dose' | 'frequency' | 'duration' | 'withFood'
  | 'tags' | 'other' | 'referral' | 'followUp';

export type Section = 'Patient' | 'Complaint' | 'Vitals' | 'Medicines' | 'Advice and referral' | 'Follow-up';

export interface Row {
  id: string;
  section: Section;
  /** medicine id, so a medicine's rows stay together */
  group?: string;
  label: string;
  leaves: Leaf[];
  display: string;
  status: Status;
  resolved: boolean;
  evidence: Evidence[];
  flags: Flag[];
  editor: EditorKind;
  /** "Not applicable" makes sense for this row */
  canNa: boolean;
  /** the row has something to add rather than a value */
  empty: boolean;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function niceDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]!.slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function describeFollowUp(value: FollowUp, visitDate: string): string {
  switch (value.kind) {
    case 'days':
      return `In ${plural(value.days, 'day')} (${niceDate(addDays(visitDate, value.days))})`;
    case 'date':
      return `On ${WEEKDAYS[new Date(`${value.date}T00:00:00Z`).getUTCDay()]} ${niceDate(value.date).slice(4)}`;
    case 'if_worse':
      return 'If not better, come back';
    case 'none':
      return 'No follow-up needed';
  }
}

function describeTemp(t: Temperature): string {
  if (t.qualitative === 'normal' && t.value === null) return 'Normal';
  return `${t.value}${t.unit ? ` °${t.unit}` : ''}`;
}

const worst = (leafs: Leaf[]): Status => (leafs.some((l) => l.field.status === 'missing') ? 'missing' : leafs.some((l) => l.field.status === 'check') ? 'check' : 'ok');

function make(
  record: VisitRecord,
  id: string,
  section: Section,
  label: string,
  leafs: Leaf[],
  editor: EditorKind,
  display: string,
  extra: Partial<Pick<Row, 'group' | 'canNa'>> = {},
): Row {
  const unique = new Map<string, Flag>();
  for (const f of leafs.flatMap((l) => l.field.flags)) unique.set(`${f.code}|${f.message}`, f);
  const empty = leafs.every((l) => l.field.value === null || (Array.isArray(l.field.value) && l.field.value.length === 0));
  void record;
  return {
    id,
    section,
    label,
    leaves: leafs,
    display: empty && !leafs.some((l) => l.field.na) ? 'Not heard' : leafs.every((l) => l.field.na) ? 'Not applicable' : display,
    status: worst(leafs),
    resolved: leafs.every((l) => isResolved(l.field)),
    evidence: leafs.flatMap((l) => l.field.evidence),
    flags: [...unique.values()],
    editor,
    canNa: false,
    empty,
    ...extra,
  };
}

const unitLabel = (unit: string | null) => (unit ? ` ${unit}` : '');

export function rowsOf(record: VisitRecord, includeEmpty = false): Row[] {
  const all = leaves(record);
  const by = (path: string) => all.find((l) => l.path === path)!;
  const rows: Row[] = [];
  const show = (leaf: Leaf) => includeEmpty || leaf.field.value !== null || leaf.field.flags.length > 0 || leaf.field.na;

  rows.push(make(record, 'patient.name', 'Patient', 'Name', [by('patient.name')], 'text', record.patient.name.value ?? ''));
  const age = by('patient.ageYears');
  if (show(age)) rows.push(make(record, 'patient.ageYears', 'Patient', 'Age', [age], 'number', `${record.patient.ageYears.value} years`));

  rows.push(make(record, 'complaint.terms', 'Complaint', 'Complaint', [by('complaint.terms')], 'terms', (record.complaint.terms.value ?? []).join(', ')));
  const duration = by('complaint.durationDays');
  if (show(duration)) {
    const d = record.complaint.durationDays.value;
    rows.push(make(record, 'complaint.durationDays', 'Complaint', 'For how long', [duration], 'number', d === 0 ? 'Since today' : plural(d ?? 0, 'day')));
  }

  const { vitals } = record;
  const vitalRows: [string, string, string][] = [
    ['vitals.temp', 'Temperature', vitals.temp.value ? describeTemp(vitals.temp.value) : ''],
    ['vitals.bp', 'Blood pressure', vitals.bp.value ? `${vitals.bp.value.sys}/${vitals.bp.value.dia}` : ''],
    ['vitals.pulse', 'Pulse', `${vitals.pulse.value} a minute`],
    ['vitals.weightKg', 'Weight', `${vitals.weightKg.value} kg`],
    ['vitals.spo2', 'SpO2', `${vitals.spo2.value}%`],
  ];
  for (const [path, label, text] of vitalRows) {
    const leaf = by(path);
    if (show(leaf)) rows.push(make(record, path, 'Vitals', label, [leaf], path === 'vitals.temp' ? 'temp' : path === 'vitals.bp' ? 'bp' : 'number', text));
  }

  for (const med of record.medications) {
    const ls = new Map(medLeaves(med).map((l) => [l.path.split('.')[1]!, l]));
    const g = (part: string) => ls.get(part)!;
    const group = med.id;
    const name = med.name.value ? displayName(med.name.value) : '';
    rows.push(make(record, `${med.id}.name`, 'Medicines', 'Medicine', [g('name')], 'medName', name, { group }));

    const doseText = `${med.dose.value}${unitLabel(med.unit.value)}${med.count.value !== null ? ` · ${med.count.value} at a time` : ''}`;
    rows.push(make(record, `${med.id}.dose`, 'Medicines', 'Dose', [g('dose'), g('unit'), g('count')], 'dose', doseText, { group, canNa: true }));

    const times = med.timing.value?.length ? ` (${med.timing.value.join(', ')})` : '';
    const freq = med.prn.value === true ? 'Only when needed' : med.perDay.value !== null ? `${plural(med.perDay.value, 'time')} a day${times}` : '';
    rows.push(make(record, `${med.id}.perDay`, 'Medicines', 'How often', [g('perDay'), g('prn'), g('timing')], 'frequency', freq, { group, canNa: med.prn.value !== true }));

    const dur = med.ongoing.value === true ? 'Continuing' : med.durationDays.value !== null ? plural(med.durationDays.value, 'day') : '';
    const durationRow = make(record, `${med.id}.durationDays`, 'Medicines', 'For how long', [g('durationDays'), g('ongoing')], 'duration', dur, { group, canNa: true });
    if (med.prn.value !== true || !durationRow.empty) rows.push(durationRow);

    const food = g('withFood');
    if (show(food)) rows.push(make(record, `${med.id}.withFood`, 'Medicines', 'With food', [food], 'withFood', med.withFood.value === 'after' ? 'After food' : 'Before food', { group }));
  }

  const tags = by('advice.tags');
  if (show(tags)) rows.push(make(record, 'advice.tags', 'Advice and referral', 'Advice given', [tags], 'tags', (record.advice.tags.value ?? []).join(', ')));
  const other = by('advice.other');
  if (show(other)) rows.push(make(record, 'advice.other', 'Advice and referral', 'Other advice', [other], 'other', (record.advice.other.value ?? []).join('; ')));
  const referral = by('referral');
  if (show(referral)) {
    const r = record.referral.value;
    rows.push(make(record, 'referral', 'Advice and referral', 'Referral', [referral], 'referral', r ? `${r.to ? displayName(r.to) : 'Place not heard'}${r.urgent ? ' — urgent, today' : ''}` : ''));
  }

  const follow = by('followUp');
  rows.push(make(record, 'followUp', 'Follow-up', 'Come back', [follow], 'followUp', record.followUp.value ? describeFollowUp(record.followUp.value, record.visitDate) : ''));
  return rows;
}

/** Optional details the transcript did not contain; the worker can add them. */
export function addableRows(record: VisitRecord): { id: string; label: string; editor: EditorKind; section: Section }[] {
  const shown = new Set(rowsOf(record).map((r) => r.id));
  const candidates: { id: string; label: string; editor: EditorKind; section: Section }[] = [
    { id: 'patient.ageYears', label: 'Age', editor: 'number', section: 'Patient' },
    { id: 'complaint.durationDays', label: 'How long', editor: 'number', section: 'Complaint' },
    { id: 'vitals.temp', label: 'Temperature', editor: 'temp', section: 'Vitals' },
    { id: 'vitals.bp', label: 'Blood pressure', editor: 'bp', section: 'Vitals' },
    { id: 'vitals.pulse', label: 'Pulse', editor: 'number', section: 'Vitals' },
    { id: 'vitals.weightKg', label: 'Weight', editor: 'number', section: 'Vitals' },
    { id: 'vitals.spo2', label: 'SpO2', editor: 'number', section: 'Vitals' },
    { id: 'advice.tags', label: 'Advice', editor: 'tags', section: 'Advice and referral' },
    { id: 'advice.other', label: 'Other advice', editor: 'other', section: 'Advice and referral' },
    { id: 'referral', label: 'Referral', editor: 'referral', section: 'Advice and referral' },
  ];
  return candidates.filter((c) => !shown.has(c.id));
}
