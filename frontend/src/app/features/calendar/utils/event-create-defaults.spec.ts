import { describe, expect, it } from 'vitest';
import { suggestedEventStart } from './event-create-defaults';

describe('event draft defaults', () => {
  it('suggests a future half-hour rather than 1am from the midnight today signal', () => {
    const now = new Date(2026, 10, 1, 19, 52);
    const today = new Date(2026, 10, 1);
    expect(suggestedEventStart(today, now)).toEqual(new Date(2026, 10, 1, 20, 30));
    expect(today).toEqual(new Date(2026, 10, 1));
    expect(now).toEqual(new Date(2026, 10, 1, 19, 52));
  });
  it('keeps at least thirty minutes for the default reminder, including seconds', () => {
    const now = new Date(2026, 10, 1, 19, 30, 45);
    const result = suggestedEventStart(now, now);
    expect(result.getTime() - now.getTime()).toBeGreaterThanOrEqual(30 * 60_000);
    expect(result.getMinutes() % 30).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });
  it('rolls over midnight and uses the selected day for other dates', () => {
    expect(suggestedEventStart(new Date(2026, 10, 1), new Date(2026, 10, 1, 23, 50))).toEqual(new Date(2026, 10, 2, 0, 30));
    const focused = new Date(2026, 11, 15);
    expect(suggestedEventStart(focused, new Date(2026, 10, 1, 19, 52))).toEqual(new Date(2026, 11, 15, 9));
    expect(focused.getHours()).toBe(0);
  });
});
