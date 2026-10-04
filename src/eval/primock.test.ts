import { describe, expect, it } from 'vitest';
import { dropFillers, parseTextGrid, selectUtterances, type Interval } from './primock';
import { normalizeForWer, wordErrors } from '../extract/wer';

const GRID = `File type = "ooTextFile"
Object class = "TextGrid"

xmin = 0
xmax = 60
tiers? <exists>
size = 1
item []:
    item [1]:
        class = "IntervalTier"
        name = "Doctor"
        xmin = 0
        xmax = 60
        intervals: size = 5
        intervals [1]:
            xmin = 0
            xmax = 2.5
            text = ""
        intervals [2]:
            xmin = 2.5
            xmax = 12.4
            text = "Good morning, how can I help you this morning?"
        intervals [3]:
            xmin = 12.4
            xmax = 20.1
            text = "<UNIN/> Sorry to hear that."
        intervals [4]:
            xmin = 20.1
            xmax = 40
            text = "Do you mean ""loose"" stools? Um, and any blood?"
        intervals [5]:
            xmin = 40
            xmax = 45
            text = "Short one."
`;

describe('parseTextGrid', () => {
  it('reads every interval with its times and unescapes doubled quotes', () => {
    const intervals = parseTextGrid(GRID);
    expect(intervals).toHaveLength(5);
    expect(intervals[1]).toEqual({ start: 2.5, end: 12.4, text: 'Good morning, how can I help you this morning?' });
    expect(intervals[3]!.text).toBe('Do you mean "loose" stools? Um, and any blood?');
  });
});

describe('selectUtterances', () => {
  const intervals = parseTextGrid(GRID);
  it('keeps only untagged utterances of 8 to 25 seconds, in order, a fixed number per consultation', () => {
    const picked = selectUtterances([{ consultation: 'c1', intervals }, { consultation: 'c2', intervals }], { perConsultation: 1, minSeconds: 8, maxSeconds: 25, total: 10 });
    expect(picked.map((u) => [u.consultation, u.start])).toEqual([['c1', 2.5], ['c2', 2.5]]);
  });

  it('never picks tagged, empty, too-short or too-long utterances, and stops at the total', () => {
    const many: Interval[] = Array.from({ length: 12 }, (_, i) => ({ start: i * 20, end: i * 20 + 10, text: `utterance ${i}` }));
    const picked = selectUtterances([{ consultation: 'c1', intervals: [...intervals, ...many] }], { perConsultation: 5, minSeconds: 8, maxSeconds: 25, total: 3 });
    expect(picked).toHaveLength(3);
    expect(picked.every((u) => !u.text.includes('<') && u.text !== '' && u.end - u.start >= 8)).toBe(true);
  });
});

describe('fillers', () => {
  it('are dropped from both sides, so only real recognition errors are counted', () => {
    const reference = dropFillers(normalizeForWer('Um, and and any blood in the stool?'));
    const heard = dropFillers(normalizeForWer('And and any blood in the stool.'));
    expect(wordErrors(reference, heard).errors).toBe(0);
    expect(wordErrors(normalizeForWer('Um, and any blood?'), normalizeForWer('and any blood')).errors).toBe(1);
  });
});
