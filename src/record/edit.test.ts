import { describe, expect, it } from 'vitest';
import { extractRecord } from '../extract';
import { textToTranscript } from '../extract/transcript-from-text';
import { canConfirm, summarize } from './completeness';
import { addMedication, applyEdits, confirmFields, confirmRecord, markNotApplicable, removeMedication } from './edit';
import { addableRows, describeFollowUp, rowsOf } from './rows';

const run = (text: string) => extractRecord(textToTranscript(text), { visitDate: '2026-10-04' });
const S05_NO_FOLLOWUP =
  'Patient Lakshmi, sixty years. Pain in both knees for two months. Gave diclofenac fifty milligrams twice a day after food for five days. Sorry, make that ibuprofen four hundred milligrams twice a day after food for five days.';
const CLEAN = 'Patient Noor, thirty-eight years. Complains of fever for three days. Gave paracetamol five hundred milligrams three times a day for three days. Review after three days.';

describe('what blocks Confirm', () => {
  it('a clean note can be confirmed straight away', () => {
    const record = run(CLEAN);
    expect(summarize(record).open).toHaveLength(0);
    expect(canConfirm(record)).toBe(true);
  });

  it('amber and red items block Confirm, and each is listed', () => {
    const record = run(S05_NO_FOLLOWUP);
    const s = summarize(record);
    expect(canConfirm(record)).toBe(false);
    expect(s.missing).toBe(1); // follow-up
    expect(s.check).toBe(2); // both medicines carry the spoken-correction question
    expect(s.open.map((l) => l.path).sort()).toEqual(['followUp', 'm1.name', 'm2.name']);
  });

  it('resolving every item unlocks Confirm: remove one medicine, accept the other, answer the follow-up', () => {
    let record = run(S05_NO_FOLLOWUP);
    record = removeMedication(record, 'm1');
    expect(canConfirm(record)).toBe(false);
    record = confirmFields(record, ['m2.name']);
    expect(canConfirm(record)).toBe(false); // follow-up is still red
    record = applyEdits(record, [{ path: 'followUp', value: { kind: 'days', days: 14 } }]);
    expect(summarize(record).open).toHaveLength(0);
    expect(canConfirm(record)).toBe(true);
    expect(confirmRecord(record).status).toBe('confirmed');
  });
});

describe('edits', () => {
  it('"Looks right" cannot resolve an empty field', () => {
    let record = run('Patient Ravi, 40. Cough for 2 days. Gave cetirizine. Review in 3 days.');
    record = confirmFields(record, ['m1.dose']);
    expect(canConfirm(record)).toBe(false);
  });

  it('typing a value answers the extractor\'s question, and marks the source as edited or manual', () => {
    let record = run('Patient Ravi, 40. Cough for 2 days. Gave cetirizine. Review in 3 days.');
    expect(record.medications[0]!.dose.status).toBe('check');
    record = applyEdits(record, [
      { path: 'm1.dose', value: 10 },
      { path: 'm1.unit', value: 'mg' },
      { path: 'm1.perDay', value: 1 },
      { path: 'm1.durationDays', value: 5 },
    ]);
    expect(canConfirm(record)).toBe(true);
    expect(record.medications[0]!.dose.source).toBe('manual');
    record = applyEdits(record, [{ path: 'patient.name', value: 'Ravi Kumar' }]);
    expect(record.patient.name.source).toBe('edited');
  });

  it('an edited number outside the sanity range is flagged again and needs "Looks right"', () => {
    let record = run(CLEAN);
    record = applyEdits(record, [{ path: 'patient.ageYears', value: 380 }]);
    expect(record.patient.ageYears.status).toBe('check');
    expect(record.patient.ageYears.flags[0]!.code).toBe('OUT_OF_RANGE');
    expect(canConfirm(record)).toBe(false);
    record = confirmFields(record, ['patient.ageYears']);
    expect(canConfirm(record)).toBe(true);
    record = applyEdits(record, [{ path: 'patient.ageYears', value: 38 }]);
    expect(record.patient.ageYears.flags).toEqual([]);
  });

  it('"Not applicable" resolves a detail that was not given, e.g. the dose of ORS', () => {
    let record = run('Patient Ravi, 4. Loose motions since 2 days. Gave ORS after every loose stool. Review in 3 days.');
    expect(canConfirm(record)).toBe(false);
    record = markNotApplicable(record, ['m1.dose', 'm1.unit']);
    expect(canConfirm(record)).toBe(true);
  });

  it('the follow-up can be set to none, and a record with nothing given needs at least one treatment', () => {
    let record = run('Patient Ravi, 40. Cough for 2 days.');
    expect(summarize(record).open.map((l) => l.path).sort()).toEqual(['advice.tags', 'followUp']);
    record = applyEdits(record, [{ path: 'followUp', value: { kind: 'none' } }, { path: 'advice.tags', value: ['rest'] }]);
    expect(canConfirm(record)).toBe(true);
  });

  it('a medicine added by hand starts empty and must be filled in', () => {
    const base = run(CLEAN);
    const { record, id } = addMedication(base);
    expect(id).toBe('m2');
    expect(canConfirm(record)).toBe(false);
    expect(summarize(record).open.map((l) => l.path)).toContain('m2.name');
    expect(canConfirm(removeMedication(record, id))).toBe(true);
  });

  it('never changes the record it was given', () => {
    const base = run(S05_NO_FOLLOWUP);
    const before = JSON.stringify(base);
    applyEdits(base, [{ path: 'followUp', value: { kind: 'none' } }]);
    removeMedication(base, 'm1');
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe('rows', () => {
  it('shows a medicine as readable rows and hides optional details that were not heard', () => {
    const rows = rowsOf(run(CLEAN));
    const text = Object.fromEntries(rows.map((r) => [r.id, r.display]));
    expect(text['patient.name']).toBe('Noor');
    expect(text['patient.ageYears']).toBe('38 years');
    expect(text['complaint.durationDays']).toBe('3 days');
    expect(text['m1.name']).toBe('Paracetamol');
    expect(text['m1.dose']).toBe('500 mg');
    expect(text['m1.perDay']).toBe('3 times a day');
    expect(text['m1.durationDays']).toBe('3 days');
    expect(text['followUp']).toBe('In 3 days (Wed 7 Oct)');
    expect(rows.some((r) => r.id === 'vitals.bp')).toBe(false);
    expect(addableRows(run(CLEAN)).map((r) => r.id)).toContain('vitals.bp');
  });

  it('describes follow-up dates', () => {
    expect(describeFollowUp({ kind: 'date', date: '2026-10-05' }, '2026-10-04')).toBe('On Monday 5 Oct');
    expect(describeFollowUp({ kind: 'if_worse' }, '2026-10-04')).toBe('If not better, come back');
  });
});
