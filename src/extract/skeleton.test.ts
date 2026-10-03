import { describe, expect, it } from 'vitest';
import { editDistance, skeleton } from './skeleton';

describe('skeleton', () => {
  it('keeps consonants and merges repeats', () => {
    expect(skeleton('paracetamol')).toBe('prstml');
    expect(skeleton('Ferrisate a mile')).toBe('frstml');
    expect(skeleton('cetirizine')).toBe('strsn');
  });

  it('puts a garbled name next to the right drug and far from others', () => {
    expect(editDistance(skeleton('Ferrisate a mile'), skeleton('paracetamol'))).toBe(1);
    expect(editDistance(skeleton('Ferrisate a mile'), skeleton('amlodipine'))).toBeGreaterThan(2);
  });
});
