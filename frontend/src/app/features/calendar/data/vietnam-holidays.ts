import { HOLIDAYS } from '../../../data/holidays.data';
import { CalendarDef, CalendarEvent } from '../models/calendar.models';
import { resolveOccurrenceDatesForYear } from '../utils/holiday-resolver';

export const VN_HOLIDAY_CALENDAR_ID = 'vn-holidays';

export const VN_HOLIDAY_CALENDAR_DEF: CalendarDef = {
  id: VN_HOLIDAY_CALENDAR_ID,
  name: 'Ngày lễ ở Việt Nam',
  color: 'green',
};

const EVENT_ID_SEPARATOR = '::';

/**
 * Read-only reference calendar — one all-day event per occurrence of every
 * `officialHoliday: true` entry in `HOLIDAYS` (the single source of truth;
 * see `holiday-resolver.ts`). Dates are computed, not hand-typed per year —
 * lunar ones resolve through `findLunarDateInSolarYear`, so this stays
 * correct beyond whatever year was last curated by hand.
 */
export function buildVietnamHolidayEvents(years: readonly number[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const holiday of HOLIDAYS) {
    if (!holiday.officialHoliday) continue;

    for (const year of years) {
      const dates = resolveOccurrenceDatesForYear(holiday, year);
      dates.forEach((date, offset) => {
        const start = new Date(date);
        const end = new Date(date);
        end.setDate(end.getDate() + 1);
        const resolvedTitle = holiday.content.title
          .replace(/\{year\}/g, String(year))
          .replace(/\{nextYear\}/g, String(year + 1));
        events.push({
          id: `${VN_HOLIDAY_CALENDAR_ID}${EVENT_ID_SEPARATOR}${holiday.id}${EVENT_ID_SEPARATOR}${year}-${offset}`,
          calendarId: VN_HOLIDAY_CALENDAR_ID,
          title: resolvedTitle,
          start,
          end,
          allDay: true,
        });
      });
    }
  }

  return events;
}

/** Recovers the `Holiday.id` a reference-calendar event was generated from —
 *  lets `HolidayInfoModal` borrow that holiday's full theme/content instead
 *  of a fragile title-string lookup. Returns `null` for any other event. */
export function resolveHolidayIdFromEvent(event: CalendarEvent): string | null {
  if (event.calendarId !== VN_HOLIDAY_CALENDAR_ID) return null;
  const parts = event.id.split(EVENT_ID_SEPARATOR);
  return parts.length === 3 ? parts[1] : null;
}
