import { HOLIDAYS } from '../../../data/holidays.data';
import { Holiday } from '../../../models/holiday-theme.model';
import { findLastDayOfLunarMonth, findLunarDateInSolarYear } from './lunar-calendar';

/**
 * Single shared "which holidays fall on this day" query — every surface that
 * needs holiday info (popup, theme engine, calendar-grid badges, agenda view,
 * the reference calendar) calls this instead of re-implementing date-rule
 * matching. Results are cached per calendar year (built lazily, `HOLIDAYS`
 * has ~45 entries × ~366 days worst case for lunar ones — trivial, and only
 * paid once per year actually viewed).
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function dateKey(d: Date): string {
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Every Gregorian date a holiday occupies within one solar year — the one
 *  place that actually interprets a `HolidayDateRule`. Both the per-day
 *  lookup cache below and `vietnam-holidays.ts` (building real calendar
 *  events for the reference calendar) call this instead of duplicating the
 *  6-kind switch. */
export function resolveOccurrenceDatesForYear(holiday: Holiday, year: number): Date[] {
  const rule = holiday.dateRule;
  switch (rule.kind) {
    case 'fixed':
      return [new Date(year, rule.month - 1, rule.day)];

    case 'fixed-range': {
      const start = new Date(year, rule.month - 1, rule.day);
      return Array.from({ length: rule.days }, (_, i) => addDays(start, i));
    }

    case 'explicit': {
      const dates: Date[] = [];
      for (const range of rule.ranges) {
        if (range.year !== year) continue;
        const cursor = new Date(range.start);
        const end = new Date(range.end);
        while (cursor <= end) {
          dates.push(new Date(cursor));
          cursor.setDate(cursor.getDate() + 1);
        }
      }
      return dates;
    }

    case 'lunar': {
      const d = findLunarDateInSolarYear(year, rule.month, rule.day, rule.isLeap ?? false);
      return d ? [d] : [];
    }

    case 'lunar-range': {
      const start = findLunarDateInSolarYear(year, rule.month, rule.day, rule.isLeap ?? false);
      if (!start) return [];
      return Array.from({ length: rule.days }, (_, i) => addDays(start, i));
    }

    case 'lunar-month-end': {
      const d = findLastDayOfLunarMonth(year, rule.month, rule.isLeap ?? false);
      return d ? [d] : [];
    }
  }
}

const yearCache = new Map<number, Map<string, Holiday[]>>();

function buildYearCache(year: number): Map<string, Holiday[]> {
  const map = new Map<string, Holiday[]>();
  for (const holiday of HOLIDAYS) {
    for (const d of resolveOccurrenceDatesForYear(holiday, year)) {
      const key = dateKey(d);
      const list = map.get(key);
      if (list) list.push(holiday);
      else map.set(key, [holiday]);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.priority - b.priority);
  }
  return map;
}

/** Every holiday matching `date`, sorted by priority (lower number first). */
export function resolveHolidaysForDate(date: Date): readonly Holiday[] {
  const year = date.getFullYear();
  let cache = yearCache.get(year);
  if (!cache) {
    cache = buildYearCache(year);
    yearCache.set(year, cache);
  }
  return cache.get(dateKey(date)) ?? [];
}

/** The single highest-priority holiday for `date`, or `null`. */
export function resolveTopHolidayForDate(date: Date): Holiday | null {
  return resolveHolidaysForDate(date)[0] ?? null;
}

/** Looks up a holiday by id — used by the debug preview + info-modal. */
export function findHolidayById(id: string): Holiday | null {
  return HOLIDAYS.find((h) => h.id === id) ?? null;
}
