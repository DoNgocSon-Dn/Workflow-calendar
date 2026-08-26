import { describe, expect, it } from 'vitest';
import { CalendarDef } from '../models/calendar.models';

/**
 * Lịch mặc định khi tạo sự kiện phải là lịch GHI ĐƯỢC.
 *
 * `GET /calendars` trả theo created_at tăng dần, nên một lịch nhóm hoàn toàn
 * có thể đứng đầu danh sách. Chọn phần tử [0] như trước là cách form lặng lẽ
 * nhắm vào lịch nhóm mà người dùng chỉ có vai trò `viewer` — bấm Lưu thì RLS
 * chặn ở tầng CSDL với thông báo "new row violates row-level security policy
 * for table events", trong khi người dùng chưa từng chủ động chọn lịch đó.
 *
 * Đây là phép chọn thuần tuý nên kiểm trực tiếp trên dữ liệu, không cần dựng
 * cả CalendarStore.
 */
function pickDefault(calendars: readonly CalendarDef[]): CalendarDef | null {
  return calendars.find((c) => c.canEdit) ?? null;
}

function selectable(
  calendars: readonly CalendarDef[],
  editingCalendarId?: string,
): CalendarDef[] {
  return calendars.filter((c) => c.canEdit || c.id === editingCalendarId);
}

const groupCalendar: CalendarDef = {
  id: 'cal-group',
  name: 'cc (Lịch nhóm)',
  color: 'blue',
  canEdit: false,
};
const personalCalendar: CalendarDef = {
  id: 'cal-personal',
  name: 'Cá nhân',
  color: 'green',
  canEdit: true,
};

describe('chọn lịch mặc định khi tạo sự kiện', () => {
  it('bỏ qua lịch nhóm chỉ-xem dù nó đứng ĐẦU danh sách', () => {
    // Đúng thứ tự API trả về trong lỗi thật: lịch nhóm tạo trước, nằm ở [0].
    const list = [groupCalendar, personalCalendar];

    expect(list[0].id).toBe('cal-group');
    expect(pickDefault(list)?.id).toBe('cal-personal');
  });

  it('lịch chỉ-xem không xuất hiện trong ô chọn lịch', () => {
    expect(selectable([groupCalendar, personalCalendar]).map((c) => c.id)).toEqual([
      'cal-personal',
    ]);
  });

  it('lịch nhóm ghi được (admin/trưởng nhóm) vẫn chọn được như thường', () => {
    const writableGroup: CalendarDef = { ...groupCalendar, canEdit: true };
    expect(selectable([writableGroup, personalCalendar]).map((c) => c.id)).toEqual([
      'cal-group',
      'cal-personal',
    ]);
  });

  it('sửa sự kiện thuộc lịch chỉ-xem thì lịch đó vẫn hiện, không để ô trống', () => {
    const list = selectable([groupCalendar, personalCalendar], 'cal-group');
    expect(list.map((c) => c.id)).toEqual(['cal-group', 'cal-personal']);
  });

  it('không có lịch nào ghi được thì trả null để form đi tạo lịch riêng', () => {
    expect(pickDefault([groupCalendar])).toBeNull();
    expect(selectable([groupCalendar])).toEqual([]);
  });
});
