import { RecurrenceRule } from '../utils/recurrence';

export type CalendarViewMode = 'month' | 'week' | 'day' | 'agenda';

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
