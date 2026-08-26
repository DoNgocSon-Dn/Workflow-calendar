import { RecurrenceRuleDto, RecurrenceUnit } from './dto/recurrence-rule.dto';

/**
 * Chặn trên khi vật chất hoá (materialize) các lần lặp thành hàng thật trong
 * DB — "không bao giờ kết thúc" không có nghĩa vô hạn, chỉ tới mốc nào đó là
 * đủ dùng thực tế mà không phình bảng events. Xem plan feature lặp lại sự kiện.
 */
export const RECURRENCE_MAX_OCCURRENCES = 180;
export const RECURRENCE_HORIZON_YEARS = 2;

export function weekOfMonth(date: Date): number {
  return Math.floor((date.getDate() - 1) / 7) + 1;
}

export function isLastWeekdayOfMonth(date: Date): boolean {
  const next = addDays(date, 7);
  return next.getMonth() !== date.getMonth();
}

export function expandRecurrence(
  start: Date,
  end: Date,
  rule: RecurrenceRuleDto,
): { start: Date; end: Date }[] {
  const durationMs = end.getTime() - start.getTime();
  const horizon = new Date(start);
  horizon.setFullYear(horizon.getFullYear() + RECURRENCE_HORIZON_YEARS);
  const untilDate = rule.endType === 'until' && rule.until ? new Date(rule.until) : null;
  const hardCap = Math.min(
    rule.endType === 'count' && rule.count ? rule.count : RECURRENCE_MAX_OCCURRENCES,
    RECURRENCE_MAX_OCCURRENCES,
  );

  const results: { start: Date; end: Date }[] = [];
  for (const occStart of candidateDates(start, rule)) {
    if (results.length >= hardCap) break;
    if (occStart.getTime() > horizon.getTime()) break;
    if (untilDate && occStart.getTime() > untilDate.getTime()) break;
    results.push({ start: occStart, end: new Date(occStart.getTime() + durationMs) });
  }
  return results;
}

function* candidateDates(start: Date, rule: RecurrenceRuleDto): Generator<Date> {
  switch (rule.freq) {
    case 'daily':
      yield* periodicCandidates(start, 'day', 1);
      return;
    case 'weekly':
      yield* periodicCandidates(start, 'week', 1);
      return;
    case 'yearly':
      yield* periodicCandidates(start, 'year', 1);
      return;
    case 'weekdays':
      yield* weekdayOnlyCandidates(start);
      return;
    case 'monthly_nth_weekday':
      yield* monthlyNthWeekdayCandidates(start);
      return;
    case 'monthly_last_weekday':
      yield* monthlyLastWeekdayCandidates(start);
      return;
    case 'custom': {
      const unit: RecurrenceUnit = rule.unit ?? 'week';
      const interval = rule.interval ?? 1;
      if (unit === 'week' && rule.byWeekdays && rule.byWeekdays.length > 0) {
        yield* weeklyMultiWeekdayCandidates(start, interval, rule.byWeekdays);
      } else {
        yield* periodicCandidates(start, unit, interval);
      }
      return;
    }
  }
}

function* periodicCandidates(start: Date, unit: RecurrenceUnit, interval: number): Generator<Date> {
  let cursor = start;
  while (true) {
    yield cursor;
    cursor = addUnit(cursor, unit, interval);
  }
}

function* weekdayOnlyCandidates(start: Date): Generator<Date> {
  let cursor = start;
  while (true) {
    if (cursor.getDay() >= 1 && cursor.getDay() <= 5) yield cursor;
    cursor = addDays(cursor, 1);
  }
}

function* weeklyMultiWeekdayCandidates(
  start: Date,
  interval: number,
  byWeekdays: number[],
): Generator<Date> {
  const sorted = [...new Set(byWeekdays)].sort((a, b) => isoDow(a) - isoDow(b));
  const startDow = (start.getDay() + 6) % 7; // ngày kể từ Thứ Hai
  let weekMonday = addDays(start, -startDow);
  while (true) {
    for (const wd of sorted) {
      const candidate = withTimeOf(addDays(weekMonday, isoDow(wd)), start);
      if (candidate.getTime() >= start.getTime()) yield candidate;
    }
    weekMonday = addDays(weekMonday, 7 * interval);
  }
}

function isoDow(weekday: number): number {
  return (weekday + 6) % 7; // 0=CN..6=T7 -> số ngày kể từ Thứ Hai
}

function* monthlyNthWeekdayCandidates(start: Date): Generator<Date> {
  const weekday = start.getDay();
  const nth = weekOfMonth(start);
  let year = start.getFullYear();
  let month = start.getMonth();
  while (true) {
    const occ = nthWeekdayOfMonth(year, month, weekday, nth);
    if (occ) yield withTimeOf(occ, start);
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
}

function* monthlyLastWeekdayCandidates(start: Date): Generator<Date> {
  const weekday = start.getDay();
  let year = start.getFullYear();
  let month = start.getMonth();
  while (true) {
    const occ = lastWeekdayOfMonth(year, month, weekday);
    yield withTimeOf(occ, start);
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date | null {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  if (day > daysInMonth) return null;
  return new Date(year, month, day);
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const last = new Date(year, month, daysInMonth);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, daysInMonth - offset);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addUnit(date: Date, unit: RecurrenceUnit, amount: number): Date {
  if (unit === 'day') return addDays(date, amount);
  if (unit === 'week') return addDays(date, amount * 7);
  if (unit === 'year') {
    return new Date(
      date.getFullYear() + amount,
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      date.getMilliseconds(),
    );
  }
  // month: giữ nguyên ngày trong tháng, kẹp về ngày cuối cùng nếu tháng đích ngắn hơn
  // (VD 31/1 + 1 tháng -> 28 hoặc 29/2, không tràn sang tháng 3).
  const targetIndex = date.getMonth() + amount;
  const targetYear = date.getFullYear() + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12;
  const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const day = Math.min(date.getDate(), daysInTargetMonth);
  return new Date(
    targetYear,
    targetMonth,
    day,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
}

function withTimeOf(date: Date, timeSource: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    timeSource.getHours(),
    timeSource.getMinutes(),
    timeSource.getSeconds(),
    timeSource.getMilliseconds(),
  );
}
