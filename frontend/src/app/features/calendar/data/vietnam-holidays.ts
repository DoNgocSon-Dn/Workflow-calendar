import { HOLIDAYS } from '../../../data/holidays.data';
import { CalendarDef, CalendarEvent } from '../models/calendar.models';
import { holidayCalendarType, resolveOccurrenceDatesForYear } from '../utils/holiday-resolver';

export const VN_HOLIDAY_CALENDAR_ID = 'vn-holidays';

export const VN_HOLIDAY_CALENDAR_DEF: CalendarDef = {
  id: VN_HOLIDAY_CALENDAR_ID,
  name: 'Ngày lễ ở Việt Nam',
  color: 'green',
  // Lịch dựng sẵn, không nằm trên server — không ai thêm sự kiện vào đây được,
  // và cũng không được phép trở thành lịch mặc định khi tự chọn hộ người dùng.
  canEdit: false,
};

const EVENT_ID_SEPARATOR = '::';

/**
 * Read-only reference calendar — **MỘT** all-day event cho mỗi lần xuất hiện
 * của mỗi entry `officialHoliday: true` trong `HOLIDAYS` (nguồn sự thật duy
 * nhất; xem `holiday-resolver.ts`).
 *
 * Lễ kéo dài nhiều ngày (Tết Nguyên Đán — `lunar-range` 5 ngày, Giáng sinh —
 * `fixed-range` 2 ngày) là MỘT event `start → end`, KHÔNG phải N event rời.
 * Lưới tháng/tuần vẫn tô nhãn lễ trên từng ngày qua `resolveTopHolidayForDate`,
 * nhưng state/agenda chỉ thấy một event.
 *
 * `calendarType` gắn theo `holidayCalendarType(holiday)` (suy từ `dateRule.kind`),
 * để "Lịch Dương" / "Lịch Âm" lọc được mà không cần đoán theo tên.
 */
export function buildVietnamHolidayEvents(years: readonly number[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const holiday of HOLIDAYS) {
    if (!holiday.officialHoliday) continue;
    const calendarType = holidayCalendarType(holiday);

    for (const year of years) {
      const dates = resolveOccurrenceDatesForYear(holiday, year);
      if (dates.length === 0) continue;

      const start = new Date(dates[0]);
      // `end` là mốc loại trừ (exclusive) — ngày cuối cùng + 1, khớp quy ước
      // all-day của phần còn lại (xem toEventInsertRow / event-form-modal).
      const end = new Date(dates[dates.length - 1]);
      end.setDate(end.getDate() + 1);

      const resolvedTitle = holiday.content.title
        .replace(/\{year\}/g, String(year))
        .replace(/\{nextYear\}/g, String(year + 1));

      events.push({
        id: `${VN_HOLIDAY_CALENDAR_ID}${EVENT_ID_SEPARATOR}${holiday.id}${EVENT_ID_SEPARATOR}${year}`,
        calendarId: VN_HOLIDAY_CALENDAR_ID,
        title: resolvedTitle,
        start,
        end,
        allDay: true,
        calendarType,
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
