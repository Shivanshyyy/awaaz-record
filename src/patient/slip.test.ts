import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { extractRecord } from '../extract';
import { textToTranscript } from '../extract/transcript-from-text';
import { confirmRecord } from '../record/edit';
import { qrPixels } from './qr';
import { buildSlip, mappingNote, slipQrText, timingFor } from './slip';

const make = (text: string) => confirmRecord(extractRecord(textToTranscript(text), { visitDate: '2026-10-04', id: 'r1' }));
const meds = (text: string) => make(text).medications;

const FULL =
  'Patient Noor Fatima, thirty-eight years. Complains of fever for three days. Gave paracetamol five hundred milligrams three times a day after food for three days. Advised plenty of fluids and rest. Referred to the district hospital today. Review after three days.';

describe('timing icons', () => {
  it('once a day shows an icon only when a time was said', () => {
    expect(timingFor(meds('Gave cetirizine 10 mg once at night for 5 days.')[0]!)).toEqual({ kind: 'icons', slots: ['night'] });
    expect(timingFor(meds('Gave amlodipine 5 mg once daily for 5 days.')[0]!)).toEqual({ kind: 'text', text: 'Once a day' });
  });

  it('twice a day is morning and night, three times is morning, afternoon and night', () => {
    expect(timingFor(meds('Gave paracetamol 500 mg twice a day for 3 days.')[0]!)).toEqual({ kind: 'icons', slots: ['morning', 'night'] });
    expect(timingFor(meds('Gave paracetamol 500 mg three times a day for 3 days.')[0]!)).toEqual({ kind: 'icons', slots: ['morning', 'afternoon', 'night'] });
  });

  it('uses the times the worker said when they match the count', () => {
    expect(timingFor(meds('Gave paracetamol 500 mg twice a day, morning and afternoon, for 3 days.')[0]!)).toEqual({ kind: 'icons', slots: ['morning', 'afternoon'] });
  });

  it('shows "when needed" for as-needed medicines and plain words for four or more', () => {
    expect(timingFor(meds('Gave paracetamol 500 mg when needed.')[0]!)).toEqual({ kind: 'needed' });
    expect(timingFor(meds('Gave paracetamol 500 mg four times a day for 3 days.')[0]!)).toEqual({ kind: 'text', text: '4 times a day' });
  });

  it('explains every mapping in words for the worker', () => {
    const m = meds('Gave paracetamol 500 mg twice a day for 3 days.')[0]!;
    expect(mappingNote(m, timingFor(m))).toBe('2 times a day is drawn as morning, night.');
  });
});

describe('the slip', () => {
  const slip = buildSlip(make(FULL), 'Sunrise PHC');

  it('has a first name and age, and no surname', () => {
    expect(slip.who).toBe('Noor, 38 y');
    expect(JSON.stringify(slip)).not.toContain('Fatima');
  });

  it('lists the medicine, how to take it, the follow-up date and the referral', () => {
    expect(slip.date).toBe('4 Oct 2026');
    const m = slip.medicines[0]!;
    expect([m.name, m.dose, m.how, m.duration, m.food]).toEqual(['Paracetamol', '500 mg', '3 times a day', 'for 3 days', 'After food']);
    expect(m.hindi.id).toBe('med_3x');
    expect(m.hindiFood?.id).toBe('med_after_food');
    expect(slip.referral).toMatchObject({ place: 'District hospital', urgent: true });
    expect(slip.referral!.hindi.map((c) => c.id)).toEqual(['ref_go', 'ref_today']);
    expect(slip.followUp).toEqual({ text: expect.stringContaining('Wed 7 Oct'), hindi: expect.objectContaining({ id: 'fu_3' }) });
    expect(slip.advice.map((a) => a.hindi.id)).toEqual(['adv_water', 'adv_rest']);
    expect(slip.closing.map((c) => c.id)).toEqual(['worse', 'keep_slip']);
  });

  it('lets the worker override the icons for one medicine', () => {
    const changed = buildSlip(make(FULL), '', { m1: { kind: 'icons', slots: ['morning'] } });
    expect(changed.medicines[0]!.timing).toEqual({ kind: 'icons', slots: ['morning'] });
  });
});

describe('the QR code', () => {
  it('holds a short plain-text summary that a QR reader decodes back exactly', () => {
    const slip = buildSlip(make(FULL), 'Sunrise PHC');
    const text = slipQrText(slip);
    expect(text).toBe(
      ['AWAAZ SLIP 4 Oct 2026', 'Sunrise PHC', 'Noor, 38 y', 'Paracetamol 500 mg 3x/day 3d', 'Advice: fluids, rest', 'Go to: District hospital today', 'Return: Wed 7 Oct (in 3 days)'].join('\n'),
    );
    expect(text.length).toBeLessThan(300);

    const { data, width, height } = qrPixels(text);
    const decoded = jsQR(data, width, height);
    expect(decoded?.data).toBe(text);
  });

  it('never carries a surname, and stays short with many medicines', () => {
    const many = make(`${FULL} Gave cetirizine 10 mg once at night for 5 days. Gave zinc 20 mg once daily for 14 days. Gave ORS when needed. Gave amoxicillin 250 mg three times a day for 5 days. Gave ibuprofen 400 mg twice a day for 5 days.`);
    const text = slipQrText(buildSlip(many, ''));
    expect(text).not.toContain('Fatima');
    expect(text).toContain('+2 more');
    const { data, width, height } = qrPixels(text);
    expect(jsQR(data, width, height)?.data).toBe(text);
  });
});
