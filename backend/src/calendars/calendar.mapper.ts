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
}

export function toCalendarDto(row: CalendarRow): CalendarDto {
  return { id: row.id, name: row.name, color: row.color };
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
