import { describe, expect, it } from 'vitest';
import { buildVietnamHolidayEvents } from './vietnam-holidays';
import { HOLIDAYS } from '../../../data/holidays.data';
import { convertSolarToLunar } from '../utils/lunar-calendar';

/**
 * `buildVietnamHolidayEvents` phải tạo **MỘT** event cho mỗi (ngày lễ, năm) —
 * kể cả lễ kéo dài nhiều ngày (Tết Nguyên Đán 5 ngày). Trước đây nó tạo 1
 * event / mỗi ngày, khiến Tết hiện lặp trên Mùng 1..Mùng 5.
 */
describe('buildVietnamHolidayEvents', () => {
  const events2026 = buildVietnamHolidayEvents([2026]);

  it('mỗi entry officialHoliday → đúng 1 event (không nhân theo số ngày)', () => {
    const officialCount = HOLIDAYS.filter((h) => h.officialHoliday).length;
    expect(events2026.length).toBe(officialCount);
  });

  it('Tết Nguyên Đán = 1 event Âm lịch, kéo dài 5 ngày', () => {
    const tet = events2026.filter((e) => e.id.includes('tet-nguyen-dan'));
    expect(tet.length).toBe(1);
    expect(tet[0].calendarType).toBe('lunar');
    expect(tet[0].allDay).toBe(true);
    const spanDays = Math.round(
      (tet[0].end.getTime() - tet[0].start.getTime()) / (24 * 60 * 60 * 1000),
    );
    expect(spanDays).toBe(5);
    // Bắt đầu đúng mùng 1 âm lịch.
    expect(convertSolarToLunar(tet[0].start).day).toBe(1);
  });

  it('Quốc khánh 2/9 = 1 event Dương lịch, 1 ngày', () => {
    const nd = events2026.filter((e) => e.id.includes('national-day'));
    expect(nd.length).toBe(1);
    expect(nd[0].calendarType).toBe('solar');
    expect(nd[0].start.getMonth()).toBe(8); // tháng 9
    expect(nd[0].start.getDate()).toBe(2);
  });

  it('id giữ format 3 phần để resolveHolidayIdFromEvent còn nhận ra', () => {
    for (const e of events2026) {
      expect(e.id.split('::').length).toBe(3);
    }
  });

  it('không có event trùng id trong cùng một năm', () => {
    const ids = events2026.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
