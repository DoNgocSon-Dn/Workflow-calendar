export type CalendarViewMode = 'month' | 'week' | 'day';

export type CalendarColor =
  | 'blue'
  | 'green'
  | 'orange'
  | 'red'
  | 'purple'
  | 'teal';

export const CALENDAR_COLOR_HEX: Record<CalendarColor, string> = {
  blue: '#1a73e8',
  green: '#0b8043',
  orange: '#e8710a',
  red: '#d50000',
  purple: '#8e24aa',
  teal: '#009688',
};

export interface CalendarDef {
  id: string;
  name: string;
  color: CalendarColor;
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
}

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
