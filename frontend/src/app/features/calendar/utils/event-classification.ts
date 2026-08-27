import { CalendarEvent, CalendarType } from '../models/calendar.models';
import { VN_HOLIDAY_CALENDAR_ID } from '../data/vietnam-holidays';

/** Id lịch giả cho các mốc Mùng 1 / Rằm hàng tháng do agenda tự sinh. */
export const LUNAR_SYSTEM_CALENDAR_ID = 'lunar-sys';

export type EventSource = 'system' | 'user';

/**
 * Nguồn của một sự kiện — SUY từ lịch chứa nó, không phải một field lưu riêng:
 * lịch ngày lễ VN dựng sẵn và các mốc âm lịch tự sinh là "hệ thống", còn lại
 * là do người dùng tạo. Dùng để tách "Sự kiện của tôi" khỏi ngày lễ.
 */
export function eventSource(event: Pick<CalendarEvent, 'calendarId'>): EventSource {
  return event.calendarId === VN_HOLIDAY_CALENDAR_ID ||
    event.calendarId === LUNAR_SYSTEM_CALENDAR_ID
    ? 'system'
    : 'user';
}

export function isSystemEvent(event: Pick<CalendarEvent, 'calendarId'>): boolean {
  return eventSource(event) === 'system';
}

export type AgendaScope = 'solar' | 'lunar' | 'mine';

/**
 * Một sự kiện có thuộc phạm vi đang xem không.
 *  - `solar`  → chỉ sự kiện Dương lịch (lễ dương + event người dùng type solar).
 *  - `lunar`  → chỉ sự kiện Âm lịch (lễ âm + event người dùng type lunar).
 *  - `mine`   → chỉ sự kiện do người dùng tạo (cả hai loại lịch).
 *
 * KHÔNG đoán theo tên — dựa hoàn toàn vào `calendarType` (đã gắn sẵn cho lễ khi
 * dựng, lưu ở cột `calendar_type` cho event người dùng) và `eventSource`.
 */
export function matchesAgendaScope(
  event: Pick<CalendarEvent, 'calendarId' | 'calendarType'>,
  scope: AgendaScope,
): boolean {
  if (scope === 'mine') return eventSource(event) === 'user';
  const type: CalendarType = event.calendarType ?? 'solar';
  return type === scope;
}
