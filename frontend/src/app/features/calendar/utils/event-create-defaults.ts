import { isSameDay } from './date-utils';

/** A useful draft time, without mutating the store's shared Date signals. */
export function suggestedEventStart(focused: Date, now: Date): Date {
  if (isSameDay(focused, now)) {
    const start = new Date(now.getTime() + 30 * 60_000);
    const minutes = start.getMinutes() + (start.getSeconds() || start.getMilliseconds() ? 1 : 0);
    start.setMinutes(Math.ceil(minutes / 30) * 30, 0, 0);
    return start;
  }
  const start = new Date(focused);
  start.setHours(9, 0, 0, 0);
  return start;
}
