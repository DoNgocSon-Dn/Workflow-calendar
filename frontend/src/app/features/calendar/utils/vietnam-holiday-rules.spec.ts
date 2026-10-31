import { describe, expect, it } from 'vitest';
import { HOLIDAYS } from '../../../data/holidays.data';
import { Holiday } from '../../../models/holiday-theme.model';
import { convertSolarToLunar } from './lunar-calendar';
import { findHolidayById, resolveHolidaysForDate, resolveOccurrenceDatesForYear } from './holiday-resolver';
import { holidayPalette } from './holiday-palette';

function key(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function occurrence(id: string, year: number): Date[] {
  return resolveOccurrenceDatesForYear(findHolidayById(id)!, year);
}

describe('Vietnamese lunar and solar holiday rules', () => {
  it.each([[2024, '2024-02-10'], [2025, '2025-01-29'], [2026, '2026-02-17'], [2027, '2027-02-06']])(
    'calculates Tết %s without a per-year date table', (year, expected) => {
      const dates = occurrence('tet-nguyen-dan', Number(year));
      expect(key(dates[0])).toBe(expected);
      expect(dates).toHaveLength(5);
      expect(convertSolarToLunar(dates[4]).day).toBe(5);
    });
  it('matches major lunar observances in 2026', () => {
    expect(key(occurrence('hung-kings', 2026)[0])).toBe('2026-04-26');
    expect(key(occurrence('doan-ngo', 2026)[0])).toBe('2026-06-19');
    expect(key(occurrence('mid-autumn', 2026)[0])).toBe('2026-09-25');
    expect(key(occurrence('tao-quan', 2026)[0])).toBe('2026-02-10');
  });
  it('finds Giao thừa on the actual 29th or 30th of tháng Chạp', () => {
    const full = occurrence('tat-nien', 2024)[0], short = occurrence('tat-nien', 2026)[0];
    expect(key(full)).toBe('2024-02-09'); expect(convertSolarToLunar(full).day).toBe(30);
    expect(key(short)).toBe('2026-02-16'); expect(convertSolarToLunar(short).day).toBe(29);
  });
  it('does not celebrate a normal lunar holiday again in a leap month', () => {
    const h: Holiday = { id: 'test', name: 'test', priority: 1,
      content: { title: 'test' }, dateRule: { kind: 'lunar', month: 6, day: 15 } };
    const regular = resolveOccurrenceDatesForYear(h, 2025);
    const leap = resolveOccurrenceDatesForYear({ ...h, dateRule: { kind: 'lunar', month: 6, day: 15, isLeap: true } }, 2025);
    expect(regular).toHaveLength(1); expect(leap).toHaveLength(1);
    expect(key(regular[0])).not.toBe(key(leap[0]));
    expect(convertSolarToLunar(regular[0]).isLeap).toBe(false);
    expect(convertSolarToLunar(leap[0]).isLeap).toBe(true);
  });
  it('keeps both holidays on a shared date and selects the higher priority theme', () => {
    const sameDay = resolveHolidaysForDate(new Date(2024, 1, 14));
    expect(sameDay.map((h) => h.id)).toContain('tet-nguyen-dan');
    expect(sameDay.map((h) => h.id)).toContain('valentine');
    expect(sameDay[0].id).toBe('tet-nguyen-dan');
  });
  it('reads explicit ISO date ranges as civil dates, not UTC instants', () => {
    const holiday: Holiday = { id: 'civil', name: 'civil', priority: 1, content: { title: 'civil' },
      dateRule: { kind: 'explicit', ranges: [{ year: 2026, start: '2026-04-30', end: '2026-05-01' }] } };
    expect(resolveOccurrenceDatesForYear(holiday, 2026).map(key)).toEqual(['2026-04-30', '2026-05-01']);
  });
  it('contains unique IDs and a valid theme and solar date for every observance', () => {
    expect(new Set(HOLIDAYS.map((h) => h.id)).size).toBe(HOLIDAYS.length);
    for (const h of HOLIDAYS) {
      expect(h.theme).toBeTruthy();
      expect(resolveOccurrenceDatesForYear(h, 2026).length).toBeGreaterThan(0);
      const palette = holidayPalette(h);
      expect(palette.light).toMatch(/^#[a-f0-9]{6}$/i);
      expect(palette.dark).toMatch(/^#[a-f0-9]{6}$/i);
    }
  });
  it('keeps every generated holiday accent readable on light and dark surfaces', () => {
    const luminance = (hex: string) => {
      const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    for (const h of HOLIDAYS) {
      const palette = holidayPalette(h);
      for (const [accent, surface] of [[palette.light, '#ffffff'], [palette.dark, '#161922']]) {
        const a = luminance(accent), b = luminance(surface);
        expect((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
