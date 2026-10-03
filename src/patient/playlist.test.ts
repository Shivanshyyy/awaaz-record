import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractRecord } from '../extract';
import { textToTranscript } from '../extract/transcript-from-text';
import { CLIPS, clip } from './clips';
import { buildPlaylist } from './playlist';

const ids = (text: string) => buildPlaylist(extractRecord(textToTranscript(text), { visitDate: '2026-10-04' })).map((i) => i.clip.id);
const scripts = JSON.parse(readFileSync('eval/scripts.json', 'utf8')).scripts as { id: string; text: string }[];
const script = (id: string) => scripts.find((s) => s.id === id)!.text;

describe('the Hindi clips', () => {
  it('are exactly the 23 in docs/HINDI_CLIPS.md, with the Hindi copied character for character', () => {
    const markdown = readFileSync('docs/HINDI_CLIPS.md', 'utf8');
    expect(CLIPS).toHaveLength(23);
    for (const c of CLIPS) {
      expect(markdown, c.id).toContain(`| \`${c.id}\` | ${c.hindi} | ${c.romanized} | ${c.english} |`);
      expect(c.hindi).toMatch(/[ऀ-ॿ]/);
    }
    expect(new Set(CLIPS.map((c) => c.id)).size).toBe(23);
  });

  it('fail loudly for an unknown id rather than inventing a line', () => {
    expect(() => clip('made_up')).toThrow();
  });
});

describe('playlist rules (docs/HINDI_CLIPS.md)', () => {
  it('S01: one medicine three times a day, follow-up in three days', () => {
    expect(ids(script('S01'))).toEqual(['intro', 'med_3x', 'med_finish', 'fu_3', 'worse', 'keep_slip', 'outro']);
  });

  it('S02: once a day at night uses the night clip; follow-up in a week', () => {
    expect(ids(script('S02'))).toEqual(['intro', 'med_1x_night', 'med_finish', 'fu_7', 'worse', 'keep_slip', 'outro']);
  });

  it('S03: an urgent referral and an unclear follow-up (no follow-up clip)', () => {
    expect(ids(script('S03'))).toEqual(['intro', 'ref_go', 'ref_today', 'worse', 'keep_slip', 'outro']);
  });

  it('S04: a medicine only when needed means the "see your slip" clip; advice clips follow the order', () => {
    expect(ids(script('S04'))).toEqual(['intro', 'med_multi', 'med_finish', 'adv_water', 'adv_breastfeed', 'fu_5', 'worse', 'keep_slip', 'outro']);
  });

  it('S06 after the worker answers the missing follow-up with "none": no follow-up clip', () => {
    expect(ids(`${script('S06')} No follow-up needed.`)).toEqual(['intro', 'med_2x', 'med_finish', 'adv_water', 'worse', 'keep_slip', 'outro']);
  });

  it('S07: a date or an unusual number of days points to the slip; "after food" adds its clip', () => {
    expect(ids('Patient Ravi, 40. Cough for 2 days. Gave metformin 500 mg twice a day after food for 5 days. Review in 10 days.')).toEqual([
      'intro', 'med_2x', 'med_after_food', 'med_finish', 'fu_slip', 'worse', 'keep_slip', 'outro',
    ]);
    expect(ids(script('S09'))).toContain('fu_slip');
  });

  it('different frequencies, or four a day, use the "see your slip" clip', () => {
    expect(ids('Gave paracetamol 500 mg three times a day for 3 days. Gave cetirizine 10 mg once at night for 3 days.')).toContain('med_multi');
    expect(ids('Gave paracetamol 500 mg four times a day for 3 days.')).toContain('med_multi');
  });

  it('only the opening and closing clips are locked, and "finish the course" starts unticked', () => {
    const record = extractRecord(textToTranscript(script('S01')), { visitDate: '2026-10-04' });
    const list = buildPlaylist(record);
    expect(list.filter((i) => i.locked).map((i) => i.clip.id)).toEqual(['intro', 'outro']);
    expect(list.find((i) => i.clip.id === 'med_finish')!.checked).toBe(false);
    expect(list.filter((i) => i.clip.id !== 'med_finish').every((i) => i.checked)).toBe(true);
  });
});
