import { evaluate } from './completeness';
import { emptyField, type VisitRecord } from './schema';

/** A record with nothing in it, for a visit where the patient did not agree to a recording: the worker types everything. */
export function blankRecord(visitDate: string, id: string, consent: VisitRecord['consent'], now = new Date().toISOString()): VisitRecord {
  const field = <T>() => emptyField<T>('manual');
  return evaluate({
    id,
    visitDate,
    createdAt: now,
    consent,
    transcript: { text: '', words: [] },
    patient: { name: field(), ageYears: field() },
    complaint: { terms: field(), durationDays: field() },
    vitals: { temp: field(), bp: field(), pulse: field(), weightKg: field(), spo2: field() },
    medications: [],
    advice: { tags: field(), other: field() },
    referral: field(),
    followUp: field(),
    status: 'draft',
    sync: 'pending',
  });
}
