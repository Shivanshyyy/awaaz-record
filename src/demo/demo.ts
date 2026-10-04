import { extractRecord } from '../extract';
import { textToTranscript } from '../extract/transcript-from-text';
import { applyEdits, confirmRecord, markNotApplicable } from '../record/edit';
import type { VisitRecord } from '../record/schema';

// Three made-up visits so anyone can look around without recording. They come from the scripts in eval/scripts.json,
// go through the same extractor and the same checks as a real visit, and are marked SYNTHETIC everywhere.
const NOTES = [
  'Patient Noor, thirty-eight years. Complains of fever for three days. Temperature one hundred and one. Gave paracetamol five hundred milligrams three times a day for three days. Review after three days.',
  'Patient Sunita, twenty-six, seven months pregnant. Swelling of feet and headache since yesterday. BP one sixty over one hundred and ten. Referred to the district hospital today. Follow up after delivery.',
  'Patient baby Aarav, two years, brought by mother. Loose motions since two days. Gave O R S after every loose stool, and zinc twenty milligrams once daily for fourteen days. Advised mother to continue breastfeeding and give plenty of fluids. Review in five days.',
];

export function demoRecords(visitDate: string, now = new Date().toISOString()): VisitRecord[] {
  const make = (text: string, resolve: (r: VisitRecord) => VisitRecord = (r) => r): VisitRecord => {
    const base = extractRecord(textToTranscript(text), { visitDate, id: crypto.randomUUID(), now });
    const consent = { given: true, at: now, mode: 'verbal' as const };
    return { ...confirmRecord(resolve({ ...base, consent })), synthetic: true };
  };
  return [
    make(NOTES[0]!),
    // "Follow up after delivery" has no date, so the worker answers the question: here, two weeks.
    make(NOTES[1]!, (r) => applyEdits(r, [{ path: 'followUp', value: { kind: 'days', days: 14 } }])),
    // ORS has no dose to give, so the worker marks that as not applicable.
    make(NOTES[2]!, (r) => markNotApplicable(r, ['m1.dose', 'm1.unit'])),
  ];
}
