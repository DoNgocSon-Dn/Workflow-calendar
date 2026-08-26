export interface CalendarRow {
  id: string;
  owner_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface CalendarDto {
  id: string;
  name: string;
  color: string;
  /**
   * Người dùng hiện tại có được thêm/sửa sự kiện trong lịch này không.
   *
   * Danh sách lịch trộn lẫn lịch riêng của người dùng với lịch nhóm mà họ chỉ
   * được XEM. Không có cờ này thì client không thể phân biệt, và mọi chỗ tự
   * chọn lịch (trợ lý AI, màn hình import) đều lấy phần tử đầu danh sách —
   * thường là một lịch nhóm chỉ-đọc, và RLS chặn với lỗi 500 khó hiểu.
   */
  canEdit: boolean;
}

export function toCalendarDto(row: CalendarRow, canEdit = true): CalendarDto {
  return { id: row.id, name: row.name, color: row.color, canEdit };
}

export interface CalendarInviteRow {
  id: string;
  calendar_id: string;
  calendar_name: string;
  calendar_color: string;
  role: string;
  status: string;
  created_at: string;
  inviter_email?: string | null;
}

export interface CalendarInviteDto {
  id: string;
  calendarId: string;
  calendarName: string;
  calendarColor: string;
  role: string;
  status: string;
  createdAt: string;
  inviterEmail: string | null;
}

export function toCalendarInviteDto(row: CalendarInviteRow): CalendarInviteDto {
  return {
    id: row.id,
    calendarId: row.calendar_id,
    calendarName: row.calendar_name,
    calendarColor: row.calendar_color,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    inviterEmail: row.inviter_email ?? null,
  };
}
