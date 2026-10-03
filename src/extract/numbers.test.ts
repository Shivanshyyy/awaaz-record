import { describe, expect, it } from 'vitest';
import { findNumbers, mergeShorthand } from './numbers';
import { tokenize } from './tokens';

const values = (text: string) => findNumbers(tokenize(text)).map((n) => n.value);
const shorthand = (text: string) => mergeShorthand(findNumbers(tokenize(text))).map((n) => n.value);

describe('findNumbers', () => {
  it('reads digits and decimals', () => {
    expect(values('Temperature 101 and 38.5')).toEqual([101, 38.5]);
    expect(values('weight 62 kg')).toEqual([62]);
  });

  it('reads spoken numbers', () => {
    expect(values('thirty-eight')).toEqual([38]);
    expect(values('thirty eight')).toEqual([38]);
    expect(values('seven')).toEqual([7]);
    expect(values('fourteen days')).toEqual([14]);
    expect(values('ninety-five')).toEqual([95]);
  });

  it('reads hundreds with and without "and"', () => {
    expect(values('one hundred and one')).toEqual([101]);
    expect(values('two hundred and fifty')).toEqual([250]);
    expect(values('five hundred')).toEqual([500]);
    expect(values('one hundred and ten')).toEqual([110]);
    expect(values('a hundred and twenty')).toEqual([120]);
  });

  it('reads spoken decimals', () => {
    expect(values('ninety-nine point eight')).toEqual([99.8]);
    expect(values('thirty-eight point two')).toEqual([38.2]);
    expect(values('99 point 8')).toEqual([99.8]);
  });

  it('keeps separate numbers separate and reports offsets', () => {
    const text = 'BP one forty over ninety. Pulse eighty-eight.';
    const found = findNumbers(tokenize(text));
    expect(found.map((n) => n.value)).toEqual([1, 40, 90, 88]);
    expect(text.slice(found[3]!.start, found[3]!.end)).toBe('eighty-eight');
  });

  it('never joins numbers across punctuation or other words', () => {
    expect(values('paracetamol six fifty, one tablet three times a day')).toEqual([6, 50, 1, 3]);
    expect(values('fifty. one hundred')).toEqual([50, 100]);
    expect(values('twenty and five')).toEqual([20, 5]);
    expect(values('one hundred, five')).toEqual([100, 5]);
  });

  it('does not take "and" or "a" as numbers on their own', () => {
    expect(values('fever and cough, a day')).toEqual([]);
  });
});

describe('mergeShorthand (only where a three-digit value is expected)', () => {
  it('joins "one forty" and "six fifty"', () => {
    expect(shorthand('one forty over ninety')).toEqual([140, 90]);
    expect(shorthand('paracetamol six fifty')).toEqual([650]);
    expect(shorthand('one sixty over one hundred and ten')).toEqual([160, 110]);
    expect(shorthand('one fifty over ninety-five')).toEqual([150, 95]);
    expect(shorthand('one twenty five')).toEqual([125]);
  });

  it('leaves ordinary pairs alone', () => {
    expect(shorthand('twenty five')).toEqual([25]);
    expect(shorthand('three days')).toEqual([3]);
    expect(shorthand('38 and 40')).toEqual([38, 40]);
  });
});
