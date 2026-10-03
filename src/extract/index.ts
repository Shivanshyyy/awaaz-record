import type { Transcript } from '../asr/transcript';
import { evaluate } from '../record/completeness';
import type { VisitRecord } from '../record/schema';
import { makeContext } from './context';
import { extractAdvice } from './fields/advice';
import { extractComplaint } from './fields/complaint';
import { extractFollowUp } from './fields/followup';
import { extractMedications } from './fields/medications';
import { extractPatient } from './fields/patient';
import { extractReferral } from './fields/referral';
import { extractVitals } from './fields/vitals';

export interface ExtractOptions {
  /** YYYY-MM-DD: weekday follow-ups ("on Monday") are worked out from this day */
  visitDate: string;
  id?: string;
  now?: string;
}

// Fills the fixed visit record from the transcript. Every value is a lexicon entry, a number, or words copied
// from the transcript, and every value points back at the words it came from. Nothing is generated.
export function extractRecord(transcript: Transcript, options: ExtractOptions): VisitRecord {
  const ctx = makeContext(transcript, options.visitDate);
  const { name, ageYears } = extractPatient(ctx);
  const vitals = extractVitals(ctx);
  const { medications, segments } = extractMedications(ctx);
  const followUp = extractFollowUp(ctx);
  const referral = extractReferral(ctx);
  const exclude = [followUp.span, referral.span].filter((s): s is NonNullable<typeof s> => s !== null);
  const advice = extractAdvice(ctx, [...segments, ...exclude]);
  const complaint = extractComplaint(ctx, segments, exclude);

  const draft: VisitRecord = {
    id: options.id ?? '',
    visitDate: options.visitDate,
    createdAt: options.now ?? new Date().toISOString(),
    consent: null,
    transcript,
    patient: { name, ageYears },
    complaint,
    vitals,
    medications,
    advice,
    referral: referral.field,
    followUp: followUp.field,
    status: 'draft',
    sync: 'pending',
  };
  return evaluate(draft);
}
