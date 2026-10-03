import { describe, expect, it } from 'vitest';
import { buildTranscript } from './transcript';

describe('buildTranscript', () => {
  it('joins word chunks and records character offsets that slice back to each word', () => {
    const t = buildTranscript(
      [
        { text: ' Patient', timestamp: [0, 0.44] },
        { text: ' nor.', timestamp: [0.44, 0.84] },
        { text: ' 38', timestamp: [1.04, 1.52] },
        { text: ' years.', timestamp: [1.52, 2.08] },
      ],
      12,
    );
    expect(t.text).toBe('Patient nor. 38 years.');
    expect(t.words.map((w) => t.text.slice(w.start, w.end))).toEqual(['Patient', 'nor.', '38', 'years.']);
    expect(t.words[2]).toMatchObject({ w: '38', t0: 1.04, t1: 1.52 });
  });

  it('gives the last word an end time when the model returns none, and never runs past the audio', () => {
    const t = buildTranscript([{ text: ' days', timestamp: [11.9, null] }], 12);
    expect(t.words[0]!.t1).toBe(12);
    expect(t.words[0]!.t0).toBe(11.9);
  });

  it('attaches stray punctuation to the previous word and skips empty chunks', () => {
    const t = buildTranscript(
      [
        { text: ' fever', timestamp: [0, 1] },
        { text: ' ', timestamp: [1, 1] },
        { text: '.', timestamp: [1, 1.1] },
      ],
      5,
    );
    expect(t.text).toBe('fever.');
    expect(t.words).toHaveLength(2);
  });
});
