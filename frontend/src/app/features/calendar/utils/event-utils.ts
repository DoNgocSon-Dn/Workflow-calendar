import { CalendarEvent } from '../models/calendar.models';
import { isSameDay, startOfDay } from './date-utils';

export function isEventOnDay(event: CalendarEvent, day: Date): boolean {
  const dayStart = startOfDay(day).getTime();
  const eventStart = startOfDay(event.start).getTime();
  const eventEnd = startOfDay(event.end).getTime();

  if (event.allDay) {
    return eventStart <= dayStart && dayStart < eventEnd;
  }
  return eventStart <= dayStart && dayStart <= eventEnd;
}
