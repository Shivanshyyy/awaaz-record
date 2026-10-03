import type { BloodPressure, FollowUp, Temperature, VisitRecord } from '../record/schema';

// Documentation checks only: is a number impossible, or is something missing? Never a clinical opinion.

/** target path -> message, for numbers outside the sanity ranges in CLAUDE.md */
export function rangeProblems(record: VisitRecord): Map<string, string> {
  const out = new Map<string, string>();

  const age = record.patient.ageYears.value;
  if (age !== null && (age < 0 || age > 120)) out.set('patient.ageYears', `Age ${age} is outside 0–120 years — check the number.`);

  const temp = record.vitals.temp.value as Temperature | null;
  if (temp && temp.value !== null) {
    const inC = temp.unit === 'C' && temp.value >= 30 && temp.value <= 45;
    const inF = temp.unit === 'F' && temp.value >= 86 && temp.value <= 113;
    if (!inC && !inF) {
      out.set('vitals.temp', `Temperature ${temp.value}${temp.unit ? ' °' + temp.unit : ''} is outside 30–45 °C and 86–113 °F — check the number and the unit.`);
    }
  }

  const bp = record.vitals.bp.value as BloodPressure | null;
  if (bp) {
    if (bp.sys < 60 || bp.sys > 260 || bp.dia < 30 || bp.dia > 160) {
      out.set('vitals.bp', `Blood pressure ${bp.sys}/${bp.dia} is outside the usual range (top 60–260, bottom 30–160) — check the numbers.`);
    } else if (bp.sys <= bp.dia) {
      out.set('vitals.bp', `Blood pressure ${bp.sys}/${bp.dia}: the top number should be larger than the bottom one — check the numbers.`);
    }
  }

  const { pulse, spo2, weightKg } = record.vitals;
  if (pulse.value !== null && (pulse.value < 30 || pulse.value > 220)) out.set('vitals.pulse', `Pulse ${pulse.value} is outside 30–220 — check the number.`);
  if (spo2.value !== null && (spo2.value < 50 || spo2.value > 100)) out.set('vitals.spo2', `SpO2 ${spo2.value} is outside 50–100 — check the number.`);
  if (weightKg.value !== null && (weightKg.value < 0.5 || weightKg.value > 250)) out.set('vitals.weightKg', `Weight ${weightKg.value} kg is outside 0.5–250 — check the number.`);

  const days = record.complaint.durationDays.value;
  if (days !== null && (days < 0 || days > 365)) out.set('complaint.durationDays', `A complaint lasting ${days} days is outside 0–365 — check the number.`);
  const follow = record.followUp.value as FollowUp | null;
  if (follow?.kind === 'days' && (follow.days < 1 || follow.days > 365)) out.set('followUp', `Follow-up in ${follow.days} days is outside 1–365 — check the number.`);
  return out;
}

/** medication paths use the id so they stay unique even when the name is missing */
export function medicationRangeProblems(record: VisitRecord): Map<string, string> {
  const out = new Map<string, string>();
  for (const med of record.medications) {
    const days = med.durationDays.value;
    if (days !== null && (days < 1 || days > 365)) out.set(`${med.id}.durationDays`, `${days} days is outside 1–365 — check the number.`);
  }
  return out;
}
