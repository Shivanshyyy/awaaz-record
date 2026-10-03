import { describe, expect, it } from 'vitest';
import { normalizeForWer, wer } from './wer';

describe('normalizeForWer', () => {
  it('makes spoken and written forms comparable', () => {
    expect(normalizeForWer('Patient Noor, thirty-eight years.')).toEqual(['patient', 'noor', '38', 'years']);
    expect(normalizeForWer('Temperature one hundred and one.')).toEqual(['temperature', '101']);
    expect(normalizeForWer('Gave O R S after every loose stool')).toEqual(['gave', 'ors', 'after', 'every', 'loose', 'stool']);
    expect(normalizeForWer('Gave ORS')).toEqual(['gave', 'ors']);
    expect(normalizeForWer('five hundred milligrams')).toEqual(['500', 'mg']);
    expect(normalizeForWer('99.8 and ninety-nine point eight')).toEqual(['99.8', 'and', '99.8']);
  });
});

describe('wer', () => {
  it('is zero for the same words in different clothes', () => {
    expect(wer('Patient Noor, thirty-eight years.', 'patient noor 38 years')).toBe(0);
  });

  it('counts substitutions, insertions and deletions against the script length', () => {
    expect(wer('one two three four', 'one two three')).toBeCloseTo(0.25);
    expect(wer('review after three days', 'review after 3 days please')).toBeCloseTo(0.25);
    expect(wer('gave paracetamol', 'gave ferrisate a mile')).toBeCloseTo(1.5);
  });
});
