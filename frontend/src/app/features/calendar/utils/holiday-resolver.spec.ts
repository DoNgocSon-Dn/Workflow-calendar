import { describe, expect, it } from 'vitest';
import { holidayCalendarType, holidayName, holidayTitle } from './holiday-resolver';
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

describe('holidayName / holidayTitle localisation', () => {
  const h = {
    id: 'x',
    name: 'Giỗ Tổ Hùng Vương',
    nameEn: 'Hung Kings Commemoration Day',
    priority: 1,
    dateRule: { kind: 'lunar', month: 3, day: 10 },
    content: { title: 'Chúc Mừng', titleEn: 'Congrats' },
  } as Holiday;

  it('returns the English variant only for locale "en"', () => {
    expect(holidayName(h, 'en')).toBe('Hung Kings Commemoration Day');
    expect(holidayName(h, 'vi')).toBe('Giỗ Tổ Hùng Vương');
    expect(holidayTitle(h, 'en')).toBe('Congrats');
    expect(holidayTitle(h, 'vi')).toBe('Chúc Mừng');
  });

  it('falls back to Vietnamese when the English variant is missing', () => {
    const noEn = { ...h, nameEn: undefined, content: { title: 'Chúc Mừng' } } as Holiday;
    expect(holidayName(noEn, 'en')).toBe('Giỗ Tổ Hùng Vương');
    expect(holidayTitle(noEn, 'en')).toBe('Chúc Mừng');
  });
});
