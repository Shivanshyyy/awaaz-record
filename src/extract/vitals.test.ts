import { describe, expect, it } from 'vitest';
import { extractRecord } from './index';
import { textToTranscript } from './transcript-from-text';

const run = (text: string) => extractRecord(textToTranscript(text), { visitDate: '2026-10-04' });

describe('vitals', () => {
  it('reads blood pressure written with digits, a slash and dots in "B.P."', () => {
    expect(run('Patient Ramesh, 52. (B.P. 140 /90).').vitals.bp.value).toEqual({ sys: 140, dia: 90 });
    expect(run('Patient Ramesh, 52. BP140/90.').vitals.bp.value).toEqual({ sys: 140, dia: 90 });
    expect(run('Patient Ramesh, 52. blood pressure 130 over 85').vitals.bp.value).toEqual({ sys: 130, dia: 85 });
  });

  it('takes "140 over 90" as blood pressure but asks when the words "blood pressure" were not heard', () => {
    const bp = run('Patient Ramesh, 52. VP140 over 90.').vitals.bp;
    expect(bp.value).toEqual({ sys: 140, dia: 90 });
    expect(bp.flags.map((f) => f.code)).toEqual(['UNCLEAR']);
  });

  it('works out the temperature unit from the range and keeps a spoken unit', () => {
    expect(run('Temperature 38.5').vitals.temp.value).toEqual({ value: 38.5, unit: 'C' });
    expect(run('Temperature 101.4').vitals.temp.value).toEqual({ value: 101.4, unit: 'F' });
    expect(run('Temperature 102 degrees fahrenheit').vitals.temp.value).toEqual({ value: 102, unit: 'F' });
    expect(run('Temperature 38 C').vitals.temp.value).toEqual({ value: 38, unit: 'C' });
  });

  it('flags a temperature that fits neither scale and an impossible blood pressure', () => {
    const hot = run('Patient Ramesh, 52. Temperature 150.');
    expect(hot.vitals.temp.flags.map((f) => f.code)).toContain('OUT_OF_RANGE');
    expect(hot.vitals.temp.status).toBe('check');
    const low = run('Patient Ramesh, 52. BP 90 over 120.');
    expect(low.vitals.bp.flags.map((f) => f.code)).toContain('OUT_OF_RANGE');
  });

  it('keeps the first reading and asks when two different readings are heard', () => {
    const bp = run('BP 140 over 90. Later BP 150 over 95.').vitals.bp;
    expect(bp.value).toEqual({ sys: 140, dia: 90 });
    expect(bp.flags.map((f) => f.code)).toEqual(['CONFLICT']);
    expect(bp.evidence).toHaveLength(2);
  });

  it('takes the later reading after a spoken correction, and still asks', () => {
    const temp = run('Temperature 101, sorry, make that 102.').vitals.temp;
    expect(temp.value).toEqual({ value: 102, unit: 'F' });
    expect(temp.flags.map((f) => f.code)).toEqual(['CORRECTION_CUE']);
  });

  it('takes a spoken blood pressure correction as the later reading', () => {
    const bp = run('BP 140 over 90, sorry, 150 over 95.').vitals.bp;
    expect(bp.value).toEqual({ sys: 150, dia: 95 });
    expect(bp.flags.map((f) => f.code)).toEqual(['CORRECTION_CUE']);
  });

  it('does not flag the same reading mentioned twice', () => {
    expect(run('BP 140 over 90. Again BP 140 over 90.').vitals.bp.flags).toEqual([]);
  });

  it('reads pulse, weight and SpO2, and asks about a weight with no unit', () => {
    const r = run('Pulse 88 per minute. Weight sixty-two kilos. SpO2 97 percent.');
    expect(r.vitals.pulse.value).toBe(88);
    expect(r.vitals.weightKg.value).toBe(62);
    expect(r.vitals.weightKg.flags).toEqual([]);
    expect(r.vitals.spo2.value).toBe(97);
    const bare = run('Weight sixty-two.');
    expect(bare.vitals.weightKg.flags.map((f) => f.code)).toEqual(['UNIT_INFERRED']);
  });
});
