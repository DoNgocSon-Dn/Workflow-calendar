import { describe, expect, it } from 'vitest';
import { CalendarEvent } from '../models/calendar.models';
import { layoutDayEvents } from './time-grid-layout';

const HOUR_HEIGHT = 48;
const DAY = new Date(2026, 7, 27);

function evt(id: string, startHour: number, endHour: number): CalendarEvent {
  return {
    id,
    calendarId: 'cal-1',
    title: id,
    start: new Date(2026, 7, 27, startHour, 0),
    end: new Date(2026, 7, 27, endHour, 0),
    allDay: false,
  };
}

/** Tra kết quả theo id cho gọn — layoutDayEvents trả mảng theo thứ tự đã sắp. */
function byId(events: CalendarEvent[]) {
  const map = new Map(layoutDayEvents(events, HOUR_HEIGHT, DAY).map((p) => [p.event.id, p]));
  return (id: string) => {
    const found = map.get(id);
    if (!found) throw new Error(`không có kết quả cho ${id}`);
    return found;
  };
}

describe('layoutDayEvents — chia cột', () => {
  it('một sự kiện đứng riêng chiếm trọn bề ngang', () => {
    const at = byId([evt('a', 9, 10)]);
    expect(at('a').leftPct).toBe(0);
    expect(at('a').widthPct).toBe(100);
  });

  it('hai sự kiện trùng giờ chia đôi, không đè lên nhau', () => {
    const at = byId([evt('a', 9, 11), evt('b', 10, 12)]);
    expect(at('a')).toMatchObject({ leftPct: 0, widthPct: 50 });
    expect(at('b')).toMatchObject({ leftPct: 50, widthPct: 50 });
    // Không giao nhau theo trục ngang là điều kiện đủ để không cần màu trong suốt.
    expect(at('a').leftPct + at('a').widthPct).toBeLessThanOrEqual(at('b').leftPct);
  });

  it('ba sự kiện trùng giờ chia đều thành ba cột', () => {
    const at = byId([evt('a', 9, 12), evt('b', 9, 12), evt('c', 9, 12)]);
    for (const [id, left] of [['a', 0], ['b', 100 / 3], ['c', 200 / 3]] as const) {
      expect(at(id).leftPct).toBeCloseTo(left, 5);
      expect(at(id).widthPct).toBeCloseTo(100 / 3, 5);
    }
  });

  it('chạm đầu-đuôi (9-10 và 10-11) không tính là trùng — cả hai full width', () => {
    const at = byId([evt('a', 9, 10), evt('b', 10, 11)]);
    expect(at('a')).toMatchObject({ leftPct: 0, widthPct: 100 });
    expect(at('b')).toMatchObject({ leftPct: 0, widthPct: 100 });
  });

  it('nong sang cột trống bên phải thay vì teo theo cả cụm', () => {
    // 'long' phủ cả ngày nên cụm phải mở 3 cột vì 'b' và 'c' chồng nhau lúc
    // 10h. 'd' (12-13h) không đụng ai ở cột 2, nên phải được nong ra gấp đôi
    // thay vì bị ép còn 1/3 như trước.
    const at = byId([evt('long', 9, 17), evt('b', 10, 11), evt('c', 10, 11), evt('d', 12, 13)]);

    expect(at('long')).toMatchObject({ leftPct: 0 });
    expect(at('long').widthPct).toBeCloseTo(100 / 3, 5);
    expect(at('c').leftPct).toBeCloseTo(200 / 3, 5);
    expect(at('c').widthPct).toBeCloseTo(100 / 3, 5);

    expect(at('d').leftPct).toBeCloseTo(100 / 3, 5);
    expect(at('d').widthPct).toBeCloseTo(200 / 3, 5);
  });

  it('hai cụm cách nhau được tính cột độc lập', () => {
    const at = byId([evt('a', 8, 9), evt('b', 8, 9), evt('c', 14, 15)]);
    expect(at('a').widthPct).toBe(50);
    expect(at('b').widthPct).toBe(50);
    expect(at('c')).toMatchObject({ leftPct: 0, widthPct: 100 });
  });

  it('tổng left+width không bao giờ vượt 100%', () => {
    const events = [evt('a', 9, 17), evt('b', 9, 10), evt('c', 9, 10), evt('d', 11, 16)];
    for (const pe of layoutDayEvents(events, HOUR_HEIGHT, DAY)) {
      expect(pe.leftPct + pe.widthPct).toBeLessThanOrEqual(100.0001);
    }
  });
});

describe('layoutDayEvents — vị trí dọc', () => {
  it('top và height tính theo giờ', () => {
    const at = byId([evt('a', 9, 11)]);
    expect(at('a').top).toBe(9 * HOUR_HEIGHT);
    expect(at('a').height).toBe(2 * HOUR_HEIGHT);
  });

  it('sự kiện tràn qua nửa đêm bị cắt tại 24:00 của ngày đang vẽ', () => {
    const overnight: CalendarEvent = {
      id: 'overnight',
      calendarId: 'cal-1',
      title: 'overnight',
      start: new Date(2026, 7, 27, 22, 0),
      end: new Date(2026, 7, 28, 3, 0),
      allDay: false,
    };
    const at = byId([overnight]);
    expect(at('overnight').top).toBe(22 * HOUR_HEIGHT);
    expect(at('overnight').height).toBe(2 * HOUR_HEIGHT);
  });

  it('sự kiện siêu ngắn vẫn cao tối thiểu để còn bấm được', () => {
    const tiny: CalendarEvent = {
      id: 'tiny',
      calendarId: 'cal-1',
      title: 'tiny',
      start: new Date(2026, 7, 27, 9, 0),
      end: new Date(2026, 7, 27, 9, 5),
      allDay: false,
    };
    expect(byId([tiny])('tiny').height).toBeGreaterThanOrEqual(18);
  });
});

describe('layoutDayEvents — sự kiện siêu ngắn', () => {
  /** MIN_BLOCK_HEIGHT (18px) ở HOUR_HEIGHT 48px tương đương 22.5 phút. */
  function shortEvt(id: string, startHour: number, startMin: number, lengthMin: number) {
    return {
      id,
      calendarId: 'cal-1',
      title: id,
      start: new Date(2026, 7, 27, startHour, startMin),
      end: new Date(2026, 7, 27, startHour, startMin + lengthMin),
      allDay: false,
    } satisfies CalendarEvent;
  }

  it('hai sự kiện 5 phút liên tiếp bị tách cột vì khối vẽ ra chồng nhau', () => {
    // Theo giờ THẬT thì 9:00-9:05 và 9:05-9:10 không trùng. Nhưng cả hai đều
    // được kéo cao tối thiểu ~22 phút, nên nếu cùng nhận 100% bề ngang thì khối
    // sau sẽ đè lên khối trước.
    const at = byId([shortEvt('a', 9, 0, 5), shortEvt('b', 9, 5, 5)]);
    expect(at('a')).toMatchObject({ leftPct: 0, widthPct: 50 });
    expect(at('b')).toMatchObject({ leftPct: 50, widthPct: 50 });
  });

  it('cách nhau đủ xa hơn chiều cao tối thiểu thì vẫn full width', () => {
    const at = byId([shortEvt('a', 9, 0, 5), shortEvt('b', 9, 30, 5)]);
    expect(at('a')).toMatchObject({ leftPct: 0, widthPct: 100 });
    expect(at('b')).toMatchObject({ leftPct: 0, widthPct: 100 });
  });
});
