import { describe, expect, it } from 'vitest';
import { addMonths } from './date-utils';

describe('month navigation', () => {
  it('does not skip February from the end of January', () => {
    const original = new Date(2026, 0, 31, 9, 30);
    const next = addMonths(original, 1);
    expect([next.getMonth(), next.getDate(), next.getHours(), next.getMinutes()]).toEqual([
      1, 28, 9, 30,
    ]);
    expect(original.getDate()).toBe(31);
  });
  it('handles leap years and backward year boundaries', () => {
    expect(addMonths(new Date(2024, 0, 31), 1).getDate()).toBe(29);
    const previous = addMonths(new Date(2026, 0, 31), -1);
    expect([previous.getFullYear(), previous.getMonth(), previous.getDate()]).toEqual([
      2025, 11, 31,
    ]);
  });
});
