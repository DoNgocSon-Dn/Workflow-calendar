import { CalendarDef, CalendarEvent } from '../models/calendar.models';

export const VN_HOLIDAY_CALENDAR_ID = 'vn-holidays';

export const VN_HOLIDAY_CALENDAR_DEF: CalendarDef = {
  id: VN_HOLIDAY_CALENDAR_ID,
  name: 'Ngày lễ ở Việt Nam',
  color: 'green',
};

interface FixedHoliday {
  month: number; // 1-12
  day: number;
  title: string;
}

const FIXED_HOLIDAYS: FixedHoliday[] = [
  { month: 1, day: 1, title: 'Tết Dương lịch' },
  { month: 4, day: 30, title: 'Ngày Giải phóng miền Nam' },
  { month: 5, day: 1, title: 'Ngày Quốc tế Lao động' },
  { month: 9, day: 2, title: 'Quốc khánh' },
];

// Ngày âm lịch quy đổi sẵn sang dương lịch — lịch âm không tính được bằng công
// thức cố định (có tháng nhuận), nên chỉ liệt kê những năm đã tra cứu chắc chắn.
// Cần bổ sung thêm khi sang năm mới.
const LUNAR_NEW_YEAR_DAY1: Record<number, [number, number]> = {
  2024: [2, 10],
  2025: [1, 29],
  2026: [2, 17],
  2027: [2, 6],
  2028: [1, 26],
};

const HUNG_KINGS_ANNIVERSARY: Record<number, [number, number]> = {
  2024: [4, 18],
  2025: [4, 7],
  2026: [4, 26],
};

function makeAllDayEvent(id: string, title: string, year: number, month: number, day: number): CalendarEvent {
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day + 1);
  return {
    id,
    calendarId: VN_HOLIDAY_CALENDAR_ID,
    title,
    start,
    end,
    allDay: true,
  };
}

export function buildVietnamHolidayEvents(years: number[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const year of years) {
    for (const h of FIXED_HOLIDAYS) {
      events.push(makeAllDayEvent(`${VN_HOLIDAY_CALENDAR_ID}-${year}-${h.month}-${h.day}`, h.title, year, h.month, h.day));
    }

    const tet = LUNAR_NEW_YEAR_DAY1[year];
    if (tet) {
      const [month, day] = tet;
      const start = new Date(year, month - 1, day);
      for (let offset = 0; offset < 3; offset++) {
        const d = new Date(start);
        d.setDate(d.getDate() + offset);
        const label = offset === 0 ? 'Tết Nguyên Đán' : `Tết Nguyên Đán (mùng ${offset + 1})`;
        events.push(
          makeAllDayEvent(`${VN_HOLIDAY_CALENDAR_ID}-tet-${year}-${offset}`, label, d.getFullYear(), d.getMonth() + 1, d.getDate()),
        );
      }
    }

    const hung = HUNG_KINGS_ANNIVERSARY[year];
    if (hung) {
      const [month, day] = hung;
      events.push(makeAllDayEvent(`${VN_HOLIDAY_CALENDAR_ID}-hung-${year}`, 'Giỗ Tổ Hùng Vương', year, month, day));
    }
  }

  return events;
}
