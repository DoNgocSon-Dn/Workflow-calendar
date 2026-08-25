const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, amount: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

export function addMonths(date: Date, amount: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + amount);
  return d;
}

export function addMinutes(date: Date, amount: number): Date {
  return new Date(date.getTime() + amount * 60_000);
}

/** "YYYY-MM-DD" theo giờ ĐỊA PHƯƠNG, đúng định dạng `<input type="date">`
 *  cần cho `value`/`max`/`min`. KHÔNG dùng `toISOString()` cho việc này — nó
 *  quy về UTC, nên vào khoảng nửa đêm ở múi giờ UTC+7 sẽ lùi mất một ngày. */
export function dateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Monday-first start of week. */
export function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  return addDays(d, -dow);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** 6x7 grid start: Monday of the week containing the 1st of the month. */
export function monthGridStart(date: Date): Date {
  return startOfWeek(startOfMonth(date));
}

export function buildMonthGrid(focusedDate: Date): Date[] {
  const start = monthGridStart(focusedDate);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function buildWeekDays(focusedDate: Date): Date[] {
  const start = startOfWeek(focusedDate);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function clampToDay(date: Date, day: Date): Date {
  const result = new Date(day);
  result.setHours(date.getHours(), date.getMinutes(), 0, 0);
  return result;
}

export function diffMinutes(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

export function spansDays(start: Date, end: Date): number {
  return Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / DAY_MS) + 1;
}

/** Matches TranslationService's `Locale` without importing it here — this
 *  file has no DI context, so callers pass the current locale explicitly. */
export type DateLocale = 'vi' | 'en';

/** Matches TimeFormatService's setting — see note above on why this file
 *  takes it as a plain param instead of injecting the service. */
export type TimeFormat = '24h' | '12h';

const WEEKDAY_SHORT: Record<DateLocale, readonly string[]> = {
  vi: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

const MONTH_LABEL: Record<DateLocale, readonly string[]> = {
  vi: [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
  ],
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
};

const AM_PM: Record<DateLocale, { am: string; pm: string }> = {
  vi: { am: 'SA', pm: 'CH' },
  en: { am: 'AM', pm: 'PM' },
};

export function weekdayShort(date: Date, locale: DateLocale = 'vi'): string {
  return WEEKDAY_SHORT[locale][date.getDay()];
}

export function monthYearLabel(date: Date, locale: DateLocale = 'vi'): string {
  return `${MONTH_LABEL[locale][date.getMonth()]} ${date.getFullYear()}`;
}

export function formatHourLabel(hour: number, locale: DateLocale = 'vi', format: TimeFormat = '24h'): string {
  if (hour === 0) return '';
  if (format === '24h') return `${hour}`;
  const period = hour < 12 ? AM_PM[locale].am : AM_PM[locale].pm;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
}

export function formatTime24(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatTimeLabel(date: Date, locale: DateLocale = 'vi', format: TimeFormat = '24h'): string {
  const h = date.getHours();
  const m = date.getMinutes();
  const mm = String(m).padStart(2, '0');
  if (format === '24h') return `${h}:${mm}`;
  const period = h < 12 ? AM_PM[locale].am : AM_PM[locale].pm;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${period}`;
}

export function parseTime24(value: string, day: Date): Date {
  const [h, m] = value.split(':').map(Number);
  return clampToDay(new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0), day);
}

export function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function fromDateInputValue(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
