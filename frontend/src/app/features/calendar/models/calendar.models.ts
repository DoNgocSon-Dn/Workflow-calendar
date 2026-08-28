import { RecurrenceRule } from '../utils/recurrence';

export type CalendarViewMode = 'month' | 'week' | 'day' | 'agenda';

/** Loại lịch một sự kiện thuộc về — quyết định nó hiện trong "Lịch Dương" hay
 *  "Lịch Âm" ở chế độ xem Lịch biểu. Ngày lễ hệ thống suy ra từ `dateRule.kind`
 *  (xem `holidayCalendarType`), sự kiện người dùng lưu ở cột `calendar_type`. */
export type CalendarType = 'solar' | 'lunar';

export type CalendarColor =
  | 'blue'
  | 'green'
  | 'orange'
  | 'red'
  | 'purple'
  | 'teal';

export const CALENDAR_COLOR_HEX: Record<CalendarColor, string> = {
  blue: '#2563eb',
  green: '#16a34a',
  orange: '#ea580c',
  red: '#dc2626',
  purple: '#7c3aed',
  teal: '#0891b2',
};

/** Cùng bảng màu ghi chú đang dùng ở `notes.color` (backend `NOTE_COLORS`) —
 *  dùng cho color-dot trong sidebar, giữ đúng tông với thẻ ghi chú cũ. */
export const NOTE_COLOR_HEX: Record<string, string> = {
  yellow: '#fef08a',
  blue: '#bae6fd',
  green: '#bbf7d0',
  pink: '#fbcfe8',
  purple: '#ddd6fe',
};

export interface CalendarDef {
  id: string;
  name: string;
  color: CalendarColor;
  /** Người dùng có được thêm/sửa sự kiện trong lịch này không. Lịch nhóm mà
   *  họ chỉ được xem sẽ là false — backend tính, client không tự đoán. */
  canEdit: boolean;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  location?: string;
  description?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  deletedAt?: Date;
  meetLink?: string;
  /** Có giá trị khi sự kiện này là một lần lặp thuộc một chuỗi lặp lại. */
  seriesId?: string;
  recurrenceRule?: RecurrenceRule;
  /** 'solar' (Dương) mặc định cho mọi sự kiện cũ; 'lunar' (Âm) do người dùng
   *  chọn trong form. Vắng mặt ⇒ coi như 'solar'. Ngày lễ hệ thống được gắn
   *  sẵn khi dựng (`buildVietnamHolidayEvents`). */
  calendarType?: CalendarType;
  /** Id người tạo — dùng để lọc "Sự kiện của tôi". Không phải lúc nào backend
   *  cũng gửi (bản cũ). */
  createdBy?: string;
}

/** Phạm vi áp dụng khi sửa/xoá một lần lặp trong chuỗi lặp lại. */
export type SeriesEditScope = 'this' | 'following' | 'all';

export type CalendarEventDraft = Omit<CalendarEvent, 'id'>;

export type AttendeeStatus = 'pending' | 'accepted' | 'declined';

export interface Attendee {
  id: string;
  userId: string;
  email: string;
  status: AttendeeStatus;
}

export interface ConflictEvent {
  id: string;
  calendarId: string;
  title: string;
  start: Date;
  end: Date;
}

export type ReminderType = 'popup' | 'email';

export interface Reminder {
  id: string;
  eventId: string;
  remindAt: Date;
  type: ReminderType;
}

export type ReminderDraft = { offsetMinutes: number; type: ReminderType };

export interface EventComment {
  id: string;
  eventId: string;
  userId: string;
  content: string;
  createdAt: Date;
}

export interface Note {
  id: string;
  content: string;
  color: string;
  /** Có giá trị khi ghi chú đã được kéo-thả "dán" lên một ngày trên lịch. */
  pinnedDate?: Date;
  /** Có giá trị khi ghi chú đang nằm trong Thùng rác (đã xoá mềm). */
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Todo {
  id: string;
  listId: string;
  content: string;
  description?: string;
  done: boolean;
  dueAt?: Date;
  starred: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TodoList {
  id: string;
  name: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export type CalendarMemberRole = 'editor' | 'viewer';
export type CalendarInviteStatus = 'pending' | 'accepted' | 'declined';

export interface CalendarInvite {
  id: string;
  calendarId: string;
  calendarName: string;
  calendarColor: CalendarColor;
  role: CalendarMemberRole;
  status: CalendarInviteStatus;
  createdAt: Date;
  inviterEmail: string | null;
}
