import { describe, expect, it } from 'vitest';
import { describeStorageError } from '../asr/offline';
import { formatClock, formatMB } from './format';

describe('format helpers', () => {
  it('formats megabytes and clock time', () => {
    expect(formatMB(44_497_724)).toBe('44.5 MB');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(75.9)).toBe('1:15');
    expect(formatClock(90)).toBe('1:30');
  });

  it('turns a full-disk error into plain words', () => {
    const quota = new DOMException('full', 'QuotaExceededError');
    expect(describeStorageError(quota)).toMatch(/out of storage space/);
    expect(describeStorageError(new Error('boom'))).toBe('boom');
  });
});
