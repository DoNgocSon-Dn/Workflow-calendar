import { describe, expect, it } from 'vitest';
import { holidayCalendarType } from './holiday-resolver';
import { Holiday } from '../../../models/holiday-theme.model';

/**
 * Loại lịch của ngày lễ SUY từ `dateRule.kind` — không đoán theo tên.
 */
describe('holidayCalendarType', () => {
  const base = { id: 'x', name: 'x', priority: 1, content: { title: 'x' } };

  it('fixed / fixed-range / explicit → solar', () => {
    expect(holidayCalendarType({ ...base, dateRule: { kind: 'fixed', month: 1, day: 1 } } as Holiday)).toBe('solar');
    expect(
      holidayCalendarType({ ...base, dateRule: { kind: 'fixed-range', month: 12, day: 24, days: 2 } } as Holiday),
    ).toBe('solar');
    expect(
      holidayCalendarType({ ...base, dateRule: { kind: 'explicit', ranges: [] } } as Holiday),
    ).toBe('solar');
  });

  it('lunar / lunar-range / lunar-month-end → lunar', () => {
    expect(holidayCalendarType({ ...base, dateRule: { kind: 'lunar', month: 3, day: 10 } } as Holiday)).toBe('lunar');
    expect(
      holidayCalendarType({ ...base, dateRule: { kind: 'lunar-range', month: 1, day: 1, days: 5 } } as Holiday),
    ).toBe('lunar');
    expect(
      holidayCalendarType({ ...base, dateRule: { kind: 'lunar-month-end', month: 12 } } as Holiday),
    ).toBe('lunar');
  });
});
