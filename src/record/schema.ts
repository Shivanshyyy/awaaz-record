import type { Transcript } from '../asr/transcript';

export type Status = 'ok' | 'check' | 'missing';
export type Source = 'voice' | 'edited' | 'manual';

export interface Evidence {
  text: string;
  /** character offsets into transcript.text */
  start: number;
  end: number;
  t0?: number;
  t1?: number;
}

export type FlagCode =
  | 'MISSING'
  | 'MISSING_DETAIL'
  | 'UNIT_INFERRED'
  | 'OUT_OF_RANGE'
  | 'CONFLICT'
  | 'CORRECTION_CUE'
  | 'NAME_SNAPPED'
  | 'UNCLEAR';

export interface Flag {
  code: FlagCode;
  /** path such as `followUp`, `vitals.bp`, `medications[paracetamol].dose` */
  target: string;
  /** a short plain-English question for the health worker */
  message: string;
}

export interface Field<T> {
  value: T | null;
  status: Status;
  evidence: Evidence[];
  flags: Flag[];
  source: Source;
  /** the worker pressed "Looks right" on an amber field */
  confirmed: boolean;
  /** the worker marked this detail "not applicable" */
  na: boolean;
}

export interface Temperature {
  value: number | null;
  unit: 'C' | 'F' | null;
  qualitative?: 'normal';
}

export interface BloodPressure {
  sys: number;
  dia: number;
}

export type Timing = 'morning' | 'afternoon' | 'night';
export type AdviceTag = 'fluids' | 'rest' | 'breastfeeding';
export type DoseUnit = 'mg' | 'g' | 'mcg' | 'ml' | 'iu' | 'units';

export interface Medication {
  id: string;
  name: Field<string>;
  dose: Field<number>;
  unit: Field<DoseUnit>;
  count: Field<number>;
  perDay: Field<number>;
  timing: Field<Timing[]>;
  prn: Field<boolean>;
  durationDays: Field<number>;
  ongoing: Field<boolean>;
  withFood: Field<'after' | 'before'>;
}

export interface Referral {
  to: string | null;
  urgent: boolean;
}

export type FollowUp = { kind: 'days'; days: number } | { kind: 'date'; date: string } | { kind: 'if_worse' } | { kind: 'none' };

export interface VisitRecord {
  id: string;
  /** YYYY-MM-DD, the day of the visit */
  visitDate: string;
  createdAt: string;
  consent: { given: boolean; at: string; mode: 'clip' | 'verbal' } | null;
  transcript: Transcript;
  patient: { name: Field<string>; ageYears: Field<number> };
  complaint: { terms: Field<string[]>; durationDays: Field<number> };
  vitals: {
    temp: Field<Temperature>;
    bp: Field<BloodPressure>;
    pulse: Field<number>;
    weightKg: Field<number>;
    spo2: Field<number>;
  };
  medications: Medication[];
  advice: { tags: Field<AdviceTag[]>; other: Field<string[]> };
  referral: Field<Referral>;
  followUp: Field<FollowUp>;
  status: 'draft' | 'confirmed';
  sync: 'pending' | 'sent';
  /** a made-up demo record, never a real patient */
  synthetic?: boolean;
}

export function emptyField<T>(source: Source = 'voice'): Field<T> {
  return { value: null, status: 'ok', evidence: [], flags: [], source, confirmed: false, na: false };
}

export function makeField<T>(value: T | null, evidence: Evidence[] = [], flags: Flag[] = [], source: Source = 'voice'): Field<T> {
  return { value, status: 'ok', evidence, flags, source, confirmed: false, na: false };
}
