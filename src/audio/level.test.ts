import { describe, expect, it } from 'vitest';
import { hasSpeech, rms, SAMPLE_RATE } from './level';

function tone(seconds: number, amplitude: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE);
  return out;
}

describe('hasSpeech', () => {
  it('rejects digital silence and a quiet noise floor', () => {
    expect(hasSpeech(new Float32Array(SAMPLE_RATE * 3))).toBe(false);
    expect(hasSpeech(tone(3, 0.002))).toBe(false);
  });

  it('accepts speech-level audio', () => {
    expect(hasSpeech(tone(2, 0.2))).toBe(true);
  });

  it('rejects a single short click', () => {
    const clicks = new Float32Array(SAMPLE_RATE * 2);
    clicks.fill(0.5, 1000, 1400);
    expect(hasSpeech(clicks)).toBe(false);
  });
});

describe('rms', () => {
  it('matches the known value for a sine', () => {
    expect(rms(tone(1, 1))).toBeCloseTo(Math.SQRT1_2, 2);
  });
});
