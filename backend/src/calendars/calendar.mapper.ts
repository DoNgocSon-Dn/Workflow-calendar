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
