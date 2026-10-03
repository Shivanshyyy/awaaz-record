import { describe, expect, it } from 'vitest';
import { buildTranscript, findLoop } from './transcript';

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

describe('repetition guard', () => {
  const loop = 'The first was the first to be the first to be the first to be the first to be the first to be'.split(' ');

  it('finds a stuck loop and keeps one copy of the phrase', () => {
    const cut = findLoop(loop);
    expect(cut).not.toBeNull();
    expect(loop.slice(0, cut!).join(' ')).toBe('The first was the first to be');
  });

  it('leaves ordinary speech alone, including a legitimately repeated phrase', () => {
    const speech =
      'gave diclofenac fifty milligrams twice a day after food for five days sorry make that ibuprofen four hundred milligrams twice a day after food for five days review in two weeks';
    expect(findLoop(speech.split(' '))).toBeNull();
    expect(findLoop('very very very very good'.split(' '))).toBeNull();
  });

  it('cuts the transcript and records a warning', () => {
    const chunks = loop.map((w, i) => ({ text: ` ${w}`, timestamp: [i * 0.3, i * 0.3 + 0.3] as [number, number] }));
    const t = buildTranscript(chunks, 30);
    expect(t.warnings).toEqual(['repeated']);
    expect(t.text).toBe('The first was the first to be');
  });
});
