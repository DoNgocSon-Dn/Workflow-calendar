import { HolidayDateRule, HolidayTheme } from '../../models/holiday-theme.model';

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function isDateWithinRule(date: Date, rule: HolidayDateRule): boolean {
  const year = date.getFullYear();
  let month: number;
  let day: number;

  if (rule.kind === 'fixed') {
    month = rule.month;
    day = rule.day;
  } else {
    const entry = rule.datesByYear[year];
    if (!entry) return false;
    [month, day] = entry;
  }

  const start = new Date(year, month - 1, day);
  const end = new Date(start);
  end.setDate(end.getDate() + (rule.durationDays ?? 1));

  const cursor = startOfDay(date);
  return cursor >= start && cursor < end;
}

/**
 * Trả về theme phù hợp nhất cho `date` trong danh sách `themes`, ưu tiên
 * theme có `priority` nhỏ nhất khi nhiều ngày lễ trùng ngày. Trả về `null`
 * nếu không có ngày lễ nào áp dụng.
 */
export function resolveActiveHoliday(date: Date, themes: readonly HolidayTheme[]): HolidayTheme | null {
  const matches = themes.filter((theme) => isDateWithinRule(date, theme.dateRule));
  if (matches.length === 0) return null;

  return matches.reduce((best, current) => (current.priority < best.priority ? current : best));
}

export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
