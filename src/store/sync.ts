import { displayName } from '../extract/context';
import { patientLabel } from './tasks';
import type { VisitRecord } from '../record/schema';

// A DHIS2-shaped export. The ids are placeholders: a ministry's DHIS2 administrator maps them to the real
// data elements (see docs/DHIS2_MAPPING.md). Nothing here has been sent to, or validated against, a DHIS2 server.

export interface Dhis2Event {
  program: string;
  programStage: string;
  orgUnit: string;
  eventDate: string;
  status: 'COMPLETED';
  /** the patient, first name and age only, as a plain note until a tracked entity is mapped */
  note?: string;
  dataValues: { dataElement: string; value: string | number | boolean }[];
}

const PROGRAM = 'PLACEHOLDER_AWAAZ_PROGRAM';
const ORG_UNIT = 'PLACEHOLDER_CLINIC_ORG_UNIT';

function values(entries: [string, string | number | boolean | null | undefined][]): Dhis2Event['dataValues'] {
  return entries.flatMap(([dataElement, value]) => (value === null || value === undefined || value === '' ? [] : [{ dataElement, value }]));
}

export function toDhis2(record: VisitRecord): { source: string; note: string; events: Dhis2Event[] } {
  const temp = record.vitals.temp.value;
  const bp = record.vitals.bp.value;
  const follow = record.followUp.value;
  const referral = record.referral.value;
  const visit: Dhis2Event = {
    program: PROGRAM,
    programStage: 'PLACEHOLDER_VISIT_STAGE',
    orgUnit: ORG_UNIT,
    eventDate: record.visitDate,
    status: 'COMPLETED',
    note: patientLabel(record),
    dataValues: values([
      ['PLACEHOLDER_AGE_YEARS', record.patient.ageYears.value],
      ['PLACEHOLDER_COMPLAINT', (record.complaint.terms.value ?? []).join('; ')],
      ['PLACEHOLDER_COMPLAINT_DURATION_DAYS', record.complaint.durationDays.value],
      ['PLACEHOLDER_TEMPERATURE', temp?.value ?? null],
      ['PLACEHOLDER_TEMPERATURE_UNIT', temp?.unit ?? null],
      ['PLACEHOLDER_BP_SYSTOLIC', bp?.sys],
      ['PLACEHOLDER_BP_DIASTOLIC', bp?.dia],
      ['PLACEHOLDER_PULSE', record.vitals.pulse.value],
      ['PLACEHOLDER_WEIGHT_KG', record.vitals.weightKg.value],
      ['PLACEHOLDER_SPO2', record.vitals.spo2.value],
      ['PLACEHOLDER_ADVICE_TAGS', (record.advice.tags.value ?? []).join('; ')],
      ['PLACEHOLDER_ADVICE_OTHER', (record.advice.other.value ?? []).join('; ')],
      ['PLACEHOLDER_REFERRAL_TO', referral?.to],
      ['PLACEHOLDER_REFERRAL_URGENT', referral ? referral.urgent : null],
      ['PLACEHOLDER_FOLLOW_UP_KIND', follow?.kind],
      ['PLACEHOLDER_FOLLOW_UP_DAYS', follow?.kind === 'days' ? follow.days : null],
      ['PLACEHOLDER_FOLLOW_UP_DATE', follow?.kind === 'date' ? follow.date : null],
      ['PLACEHOLDER_CONSENT_GIVEN', record.consent?.given ?? null],
    ]),
  };
  const medicines = record.medications.map<Dhis2Event>((m) => ({
    program: PROGRAM,
    programStage: 'PLACEHOLDER_MEDICINE_STAGE',
    orgUnit: ORG_UNIT,
    eventDate: record.visitDate,
    status: 'COMPLETED',
    dataValues: values([
      ['PLACEHOLDER_MEDICINE_NAME', m.name.value ? displayName(m.name.value) : null],
      ['PLACEHOLDER_DOSE', m.dose.value],
      ['PLACEHOLDER_DOSE_UNIT', m.unit.value],
      ['PLACEHOLDER_TIMES_PER_DAY', m.perDay.value],
      ['PLACEHOLDER_ONLY_WHEN_NEEDED', m.prn.value === true ? true : null],
      ['PLACEHOLDER_DURATION_DAYS', m.durationDays.value],
      ['PLACEHOLDER_CONTINUING', m.ongoing.value === true ? true : null],
      ['PLACEHOLDER_WITH_FOOD', m.withFood.value],
    ]),
  }));
  return {
    source: 'Awaaz Record (hackathon prototype)',
    note: 'DHIS2-shaped, not validated against a DHIS2 server. Every id is a placeholder. Contains patient details: share it only with your health system.',
    events: [visit, ...medicines],
  };
}

export function downloadJson(name: string, data: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
