import { CalendarEvent } from '../models/calendar.models';
import { isSameDay, startOfDay } from './date-utils';

/** True when `day` falls within the event's span (end is exclusive for all-day events). */
export function isEventOnDay(event: CalendarEvent, day: Date): boolean {
  if (event.allDay) {
    const dayTime = startOfDay(day).getTime();
    return startOfDay(event.start).getTime() <= dayTime && dayTime < startOfDay(event.end).getTime();
  }
  return isSameDay(event.start, day);
}
