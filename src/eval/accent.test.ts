import { describe, expect, it } from 'vitest';
import { ELICITATION, groupOf, selectSpeakers, slotsOf, toSpeaker, type Speaker } from './accent';
import { normalizeForWer, wordErrors } from '../extract/wer';

const speaker = (speakerId: number, country: string, nativeLanguage: string, gender: string): Speaker => ({ speakerId, file: `${nativeLanguage}${speakerId}.mp3`, nativeLanguage, country, residence: 'usa', gender, age: '30' });

describe('toSpeaker', () => {
  it('reads the archive columns, lower-cases the labels and skips rows without a recording', () => {
    expect(toSpeaker({ speakerid: '207', native_language: 'Hindi', country: 'India ', english_residence: 'USA', gender: 'Male', age: '27', speech_sample: 'hindi1.mp3' })).toEqual({ speakerId: 207, file: 'hindi1.mp3', nativeLanguage: 'hindi', country: 'india', residence: 'usa', gender: 'male', age: '27' });
    expect(toSpeaker({ speakerid: '9', native_language: 'x', country: 'y' })).toBeNull();
    expect(toSpeaker({ speakerid: 'abc', speech_sample: 'a.mp3' })).toBeNull();
  });
});

describe('groupOf', () => {
  it('puts speakers born in India with another mother tongue in one group and native English speakers born in the USA in the other', () => {
    expect(groupOf(speaker(1, 'india', 'hindi', 'male'))).toBe('india');
    expect(groupOf(speaker(2, 'india', 'tamil', 'female'))).toBe('india');
    expect(groupOf(speaker(3, 'usa', 'english', 'female'))).toBe('usa');
  });

  it('leaves everyone else out: English speakers born in India, Indian-language speakers born in the USA, other countries', () => {
    expect(groupOf(speaker(4, 'india', 'english', 'male'))).toBeNull();
    expect(groupOf(speaker(5, 'usa', 'hindi', 'male'))).toBeNull();
    expect(groupOf(speaker(6, 'uk', 'english', 'male'))).toBeNull();
    expect(groupOf(speaker(7, 'india', '', 'male'))).toBeNull();
  });
});

describe('selectSpeakers', () => {
  const pool: Speaker[] = [];
  for (let i = 1; i <= 30; i++) {
    pool.push(speaker(100 + i, 'india', i % 2 ? 'hindi' : 'tamil', i % 3 ? 'female' : 'male'));
    pool.push(speaker(200 + i, 'usa', 'english', i % 2 ? 'female' : 'male'));
    pool.push(speaker(300 + i, 'uk', 'english', 'female'));
  }

  it('takes the lowest speaker ids first, the same number of women and men from each group', () => {
    const picked = selectSpeakers([...pool].reverse(), { perGender: 3 });
    expect(picked).toHaveLength(12);
    const key = (group: string, gender: string) => picked.filter((p) => p.group === group && p.speaker.gender === gender).map((p) => p.speaker.speakerId);
    expect(key('india', 'female')).toEqual([101, 102, 104]);
    expect(key('india', 'male')).toEqual([103, 106, 109]);
    expect(key('usa', 'female')).toEqual([201, 203, 205]);
    expect(key('usa', 'male')).toEqual([202, 204, 206]);
  });

  it('never picks anyone outside the two groups, and uses everyone when a group is smaller than asked', () => {
    const small = [speaker(1, 'india', 'hindi', 'male'), speaker(2, 'uk', 'english', 'male'), speaker(3, 'usa', 'english', 'female')];
    expect(selectSpeakers(small, { perGender: 10 }).map((p) => [p.group, p.speaker.speakerId])).toEqual([['india', 1], ['usa', 3]]);
  });
});

describe('slotsOf', () => {
  it('lists each group and gender with every candidate in speaker-id order, so a missing recording can be skipped by taking the next', () => {
    const slots = slotsOf([speaker(9, 'usa', 'english', 'male'), speaker(3, 'usa', 'english', 'male'), speaker(5, 'india', 'tamil', 'female'), speaker(4, 'uk', 'english', 'male')]);
    expect(slots.map((s) => `${s.group}/${s.gender}: ${s.candidates.map((c) => c.speakerId).join(',')}`)).toEqual(['india/female: 5', 'india/male: ', 'usa/female: ', 'usa/male: 3,9']);
  });
});

describe('the elicitation paragraph', () => {
  it('scores a perfect reading as no errors and a missed word as one error, with spoken numbers made comparable', () => {
    const reference = normalizeForWer(ELICITATION);
    expect(reference).toContain('6');
    expect(reference).toContain('wednesday');
    expect(wordErrors(reference, normalizeForWer(ELICITATION.replace('Six', '6').replace('five', 'Five'))).errors).toBe(0);
    expect(wordErrors(reference, normalizeForWer(ELICITATION.replace('train ', ''))).errors).toBe(1);
  });
});
