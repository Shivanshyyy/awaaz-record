import { describe, expect, it } from 'vitest';
import { allFlags } from './score';
import { extractRecord } from './index';
import { textToTranscript } from './transcript-from-text';

const run = (text: string, visitDate = '2026-10-04') => extractRecord(textToTranscript(text), { visitDate });
const med = (text: string, name: string) => run(text).medications.find((m) => m.name.value === name);

describe('patient', () => {
  it('reads name and age in other wordings', () => {
    const a = run('Patient name is Anita, aged 34. Cough for two days.');
    expect(a.patient.name.value).toBe('Anita');
    expect(a.patient.ageYears.value).toBe(34);
    const b = run("Patient Mohan's 70, came for a blood pressure check.");
    expect(b.patient.name.value).toBe('Mohan');
    const c = run('Patient baby Aarav, six months old, fever since yesterday.');
    expect(c.patient.name.value).toBe('Aarav');
    expect(c.patient.ageYears.value).toBe(0.5);
    expect(c.patient.ageYears.flags.map((f) => f.code)).toEqual(['UNCLEAR']);
  });

  it('asks for the name when it was not heard, but still reads the age', () => {
    const r = run('Fish and Locks Me, 60 years, cough for two days.');
    expect(r.patient.name.value).toBeNull();
    expect(r.patient.name.status).toBe('missing');
    expect(r.patient.ageYears.value).toBe(60);
  });

  it('does not take a duration as the age', () => {
    expect(run('Patient Ramesh. Pain in the back for 2 years.').patient.ageYears.value).toBeNull();
  });
});

describe('medicines', () => {
  it('reads abbreviations and digits', () => {
    const m = med('Patient Ravi, 40. Fever for 2 days. Gave paracetamol 500 mg BD for 5 days. Review in 3 days.', 'paracetamol')!;
    expect([m.dose.value, m.unit.value, m.perDay.value, m.durationDays.value]).toEqual([500, 'mg', 2, 5]);
    const t = med('Gave amoxicillin 250 mg TDS x 5 days.', 'amoxicillin')!;
    expect([t.dose.value, t.perDay.value, t.durationDays.value]).toEqual([250, 3, 5]);
  });

  it('reads brand names as the generic and "every 8 hours" as three a day', () => {
    const m = med('Gave Dolo 650 mg every 8 hours for 3 days.', 'paracetamol')!;
    expect([m.dose.value, m.perDay.value, m.durationDays.value]).toEqual([650, 3, 3]);
  });

  it('reads two or three times a day written in digits, and "after food"', () => {
    const m = med('Gave metformin 500 mg 2 times a day after food, continue.', 'metformin')!;
    expect([m.perDay.value, m.withFood.value, m.ongoing.value]).toEqual([2, 'after', true]);
  });

  it('reads morning and night timing', () => {
    const m = med('Gave atenolol 50 mg once in the morning for 10 days.', 'atenolol')!;
    expect(m.timing.value).toEqual(['morning']);
    expect(m.perDay.value).toBe(1);
  });

  it('puts the dose before the name', () => {
    const m = med('Gave 500 mg paracetamol three times a day for three days.', 'paracetamol')!;
    expect([m.dose.value, m.perDay.value]).toEqual([500, 3]);
  });

  it('reads "when needed" and "after every loose motion" as only-when-needed', () => {
    expect(med('Gave paracetamol 500 mg when needed for fever.', 'paracetamol')!.prn.value).toBe(true);
    expect(med('Gave ORS after each loose motion.', 'ors')!.prn.value).toBe(true);
  });

  it('asks instead of guessing when details are missing', () => {
    const r = run('Patient Ravi, 40. Cough for 3 days. Gave cetirizine. Review in 3 days.');
    const codes = allFlags(r).map((f) => `${f.code}@${f.target}`);
    expect(codes).toContain('MISSING_DETAIL@medications[cetirizine].dose');
    expect(codes).toContain('MISSING_DETAIL@medications[cetirizine].perDay');
    expect(codes).toContain('MISSING_DETAIL@medications[cetirizine].durationDays');
  });

  it('snaps a garbled name next to a dose to the closest medicine, and asks', () => {
    const m = run('Patient Ravi, 40. Fever for 3 days. Gave Farasetamal 500 mg three times a day for 3 days. Review in 3 days.').medications[0]!;
    expect(m.name.value).toBe('paracetamol');
    expect(m.name.flags.map((f) => f.code)).toEqual(['NAME_SNAPPED']);
    expect(m.name.status).toBe('check');
  });

  it('picks neither when two medicines are equally close', () => {
    const m = run('Gave oxisol in 250 mg three times a day for 5 days.').medications[0]!;
    expect(m.name.value).toBeNull();
    expect(m.name.flags[0]!.code).toBe('NAME_SNAPPED');
    expect(m.name.flags[0]!.message).toMatch(/could be .* or /);
    expect(m.name.status).toBe('missing');
  });

  it('keeps an unreadable name as a question and still reads the rest', () => {
    const m = run('Gave blorp 20 mg once daily for 14 days.').medications[0]!;
    expect(m.name.value).toBeNull();
    expect(m.name.flags[0]!.code).toBe('UNCLEAR');
    expect([m.dose.value, m.perDay.value, m.durationDays.value]).toEqual([20, 1, 14]);
  });

  it('does not invent a medicine from "gave history of"', () => {
    expect(run('Patient Ravi, 40. Gave history of fever for 3 days. Review in 3 days.').medications).toHaveLength(0);
  });

  it('does not take advice to "give fluids" for a medicine', () => {
    expect(run('Advised mother to give plenty of fluids.').medications).toHaveLength(0);
  });
});

describe('complaint', () => {
  it('drops a denied symptom but keeps one after a comma', () => {
    expect(run('Patient Ravi, 40. No fever, headache since morning.').complaint.terms.value).toEqual(['headache']);
    expect(run('Patient Ravi, 40. No fever or cough. Headache for 2 days.').complaint.terms.value).toEqual(['headache']);
  });

  it('reads plurals and the common duration wordings', () => {
    const r = run('Patient Ravi, 40. Headaches for a week.');
    expect(r.complaint.terms.value).toEqual(['headache']);
    expect(r.complaint.durationDays.value).toBe(7);
    expect(run('Cough since last week.').complaint.durationDays.value).toBe(7);
    expect(run('Cough since last night.').complaint.durationDays.value).toBe(1);
  });

  it('shows words that are not in the symptom list exactly as heard, and asks', () => {
    const r = run('Patient Ravi, 40. Complains of hiccups for 3 days. Review in 3 days.');
    expect(r.complaint.terms.value).toEqual(['hiccups']);
    expect(r.complaint.terms.flags.map((f) => f.code)).toEqual(['UNCLEAR']);
  });

  it('ignores a purpose phrase inside a medicine sentence when the complaint was already said', () => {
    const r = run('Patient Ravi, 40. Fever for 2 days. Gave paracetamol 500 mg when needed for pain. Review in 3 days.');
    expect(r.complaint.terms.value).toEqual(['fever']);
  });
});

describe('follow-up and referral', () => {
  it('reads several follow-up wordings', () => {
    expect(run('Come back after 3 days.').followUp.value).toEqual({ kind: 'days', days: 3 });
    expect(run('Review tomorrow.').followUp.value).toEqual({ kind: 'days', days: 1 });
    expect(run('Follow up next week.').followUp.value).toEqual({ kind: 'days', days: 7 });
    expect(run('Review in 2 months.').followUp.value).toEqual({ kind: 'days', days: 60 });
    expect(run('No follow-up needed.').followUp.value).toEqual({ kind: 'none' });
    expect(run('If symptoms persist, come back.').followUp.value).toEqual({ kind: 'if_worse' });
  });

  it('always means the NEXT weekday after the visit', () => {
    expect(run('Follow up on Monday.', '2026-10-04').followUp.value).toEqual({ kind: 'date', date: '2026-10-05' });
    expect(run('Follow up on Sunday.', '2026-10-04').followUp.value).toEqual({ kind: 'date', date: '2026-10-11' });
    expect(run('Review on Friday.', '2026-10-04').followUp.value).toEqual({ kind: 'date', date: '2026-10-09' });
  });

  it('does not read "worse in the mornings" as a follow-up', () => {
    expect(run('Cough for 2 days, worse in the mornings.').followUp.value).toBeNull();
  });

  it('asks when follow-up is mentioned without a time', () => {
    const f = run('Follow up after delivery.').followUp;
    expect(f.value).toBeNull();
    expect(f.status).toBe('missing');
    expect(f.flags.map((x) => x.code)).toEqual(['UNCLEAR']);
  });

  it('reads referrals and urgency, with commas instead of full stops', () => {
    const r = run('Patient Sunita, 26, swelling of feet and headaches since yesterday, BP 160 over 110, referred to the district hospital today, follow up after delivery.');
    expect(r.referral.value).toEqual({ to: 'district hospital', urgent: true });
    expect(r.complaint.terms.value).toEqual(['swelling of feet', 'headache']);
    expect(r.complaint.durationDays.value).toBe(1);
    expect(run('Sent to the PHC immediately.').referral.value).toEqual({ to: 'primary health centre', urgent: true });
    expect(run('Advised to go to the CHC for an X-ray.').referral.value).toEqual({ to: 'community health centre', urgent: false });
  });

  it('asks for the place when a referral has none', () => {
    const r = run('Referred urgently.');
    expect(r.referral.value).toEqual({ to: null, urgent: true });
    expect(allFlags(r).some((f) => f.code === 'MISSING_DETAIL' && f.target === 'referral.to')).toBe(true);
  });
});

describe('advice', () => {
  it('reads the three advice tags and keeps other advice as the worker\'s own words', () => {
    const r = run('Patient Ravi, 40. Advised bed rest and plenty of fluids. Advised to avoid cold drinks.');
    expect(r.advice.tags.value).toEqual(['rest', 'fluids']); // in the order they were said
    expect(r.advice.other.value).toEqual(['avoid cold drinks']);
  });

  it('does not take "passing water" for fluid advice, or "stop breastfeeding" for a recommendation', () => {
    expect(run('Burning while passing water for two days.').advice.tags.value).toBeNull();
    const r = run('Advised to stop breastfeeding.');
    expect(r.advice.tags.value).toBeNull();
    expect(r.advice.tags.flags.map((f) => f.code)).toEqual(['UNCLEAR']);
  });
});

describe('records', () => {
  it('never puts words in a record that are not in the transcript, a lexicon entry, or a number', () => {
    const text = 'Patient Anita, 34. Complains of fever for three days. Gave paracetamol 500 mg three times a day for three days. Advised plenty of fluids. Review in three days.';
    const r = run(text);
    const spoken = text.toLowerCase();
    expect(r.patient.name.value!.toLowerCase()).toSatisfy((n: string) => spoken.includes(n));
    for (const f of [r.patient.name, r.complaint.terms, r.advice.tags, ...r.medications.flatMap((m) => [m.name, m.dose])]) {
      expect(f.evidence.length).toBeGreaterThan(0);
      for (const e of f.evidence) expect(text.slice(e.start, e.end)).toBe(e.text);
    }
  });

  it('puts audio times on evidence when the transcript has them', () => {
    const words = ['Patient', 'Noor,', 'fever', 'for', 'three', 'days.'];
    let text = '';
    const timed = words.map((w, i) => {
      const start = text.length + (text ? 1 : 0);
      text += (text ? ' ' : '') + w;
      return { w, start, end: text.length, t0: i, t1: i + 0.9 };
    });
    const r = extractRecord({ text, words: timed }, { visitDate: '2026-10-04' });
    expect(r.patient.name.evidence[0]).toMatchObject({ text: 'Noor', t0: 1, t1: 1.9 });
    expect(r.complaint.durationDays.evidence[0]!.t0).toBe(3);
  });
});
