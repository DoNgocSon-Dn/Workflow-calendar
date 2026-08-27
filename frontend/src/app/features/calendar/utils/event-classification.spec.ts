import { describe, expect, it } from 'vitest';
import { CalendarEvent } from '../models/calendar.models';
import { VN_HOLIDAY_CALENDAR_ID } from '../data/vietnam-holidays';
import {
  LUNAR_SYSTEM_CALENDAR_ID,
  eventSource,
  matchesAgendaScope,
} from './event-classification';

function evt(over: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'e',
    calendarId: 'cal-user',
    title: 't',
    start: new Date('2026-08-15T00:00:00Z'),
    end: new Date('2026-08-16T00:00:00Z'),
    allDay: true,
    ...over,
  };
}

describe('eventSource', () => {
  it('lịch ngày lễ VN + lịch mốc âm lịch = system', () => {
    expect(eventSource(evt({ calendarId: VN_HOLIDAY_CALENDAR_ID }))).toBe('system');
    expect(eventSource(evt({ calendarId: LUNAR_SYSTEM_CALENDAR_ID }))).toBe('system');
  });
  it('lịch khác = user', () => {
    expect(eventSource(evt({ calendarId: 'cal-abc' }))).toBe('user');
  });
});

describe('matchesAgendaScope — tách 3 phạm vi hoàn toàn theo dữ liệu', () => {
  const userSolar = evt({ calendarId: 'cal-user', calendarType: 'solar' });
  const userLunar = evt({ calendarId: 'cal-user', calendarType: 'lunar' });
  const userNoType = evt({ calendarId: 'cal-user' }); // hàng cũ ⇒ solar
  const holidaySolar = evt({ calendarId: VN_HOLIDAY_CALENDAR_ID, calendarType: 'solar' });
  const holidayLunar = evt({ calendarId: VN_HOLIDAY_CALENDAR_ID, calendarType: 'lunar' });

  it('solar: chỉ nhận calendarType solar (lễ dương + event người dùng dương)', () => {
    expect(matchesAgendaScope(userSolar, 'solar')).toBe(true);
    expect(matchesAgendaScope(userNoType, 'solar')).toBe(true);
    expect(matchesAgendaScope(holidaySolar, 'solar')).toBe(true);
    expect(matchesAgendaScope(userLunar, 'solar')).toBe(false);
    expect(matchesAgendaScope(holidayLunar, 'solar')).toBe(false);
  });

  it('lunar: chỉ nhận calendarType lunar', () => {
    expect(matchesAgendaScope(userLunar, 'lunar')).toBe(true);
    expect(matchesAgendaScope(holidayLunar, 'lunar')).toBe(true);
    expect(matchesAgendaScope(userSolar, 'lunar')).toBe(false);
    expect(matchesAgendaScope(holidaySolar, 'lunar')).toBe(false);
  });

  it('mine: chỉ event người dùng, cả hai loại lịch, không lễ hệ thống', () => {
    expect(matchesAgendaScope(userSolar, 'mine')).toBe(true);
    expect(matchesAgendaScope(userLunar, 'mine')).toBe(true);
    expect(matchesAgendaScope(holidaySolar, 'mine')).toBe(false);
    expect(matchesAgendaScope(holidayLunar, 'mine')).toBe(false);
  });
});
