import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

export interface EventRow {
  id: string;
  calendar_id: string;
  title: string;
  location: string | null;
  description: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventDto {
  id: string;
  calendarId: string;
  title: string;
  location?: string;
  description?: string;
  start: string;
  end: string;
  allDay: boolean;
}

export function toEventDto(row: EventRow): EventDto {
  return {
    id: row.id,
    calendarId: row.calendar_id,
    title: row.title,
    location: row.location ?? undefined,
    description: row.description ?? undefined,
    start: row.start_at,
    end: row.end_at,
    allDay: row.all_day,
  };
}

export function toEventInsertRow(
  dto: CreateEventDto,
  createdBy: string,
): Record<string, unknown> {
  return {
    calendar_id: dto.calendarId,
    title: dto.title,
    location: dto.location ?? null,
    description: dto.description ?? null,
    start_at: dto.start,
    end_at: dto.end,
    all_day: dto.allDay,
    created_by: createdBy,
  };
}

export function toEventUpdateRow(dto: UpdateEventDto): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (dto.calendarId !== undefined) row['calendar_id'] = dto.calendarId;
  if (dto.title !== undefined) row['title'] = dto.title;
  if (dto.location !== undefined) row['location'] = dto.location;
  if (dto.description !== undefined) row['description'] = dto.description;
  if (dto.start !== undefined) row['start_at'] = dto.start;
  if (dto.end !== undefined) row['end_at'] = dto.end;
  if (dto.allDay !== undefined) row['all_day'] = dto.allDay;
  return row;
}

export interface ConflictEventDto {
  id: string;
  calendarId: string;
  title: string;
  start: string;
  end: string;
}

export function toConflictEventDto(row: EventRow): ConflictEventDto {
  return {
    id: row.id,
    calendarId: row.calendar_id,
    title: row.title,
    start: row.start_at,
    end: row.end_at,
  };
}
