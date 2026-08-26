import { CreateEventDto } from './dto/create-event.dto';
import { RecurrenceRuleDto } from './dto/recurrence-rule.dto';
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
  deleted_at: string | null;
  meet_link: string | null;
  series_id: string | null;
  recurrence_rule: RecurrenceRuleDto | null;
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
  deletedAt?: string;
  meetLink?: string;
  seriesId?: string;
  recurrenceRule?: RecurrenceRuleDto;
  /**
   * Ai đã tạo sự kiện này.
   *
   * Client cần nó để nhận ra gói realtime `event:created` là tiếng vọng của
   * chính thao tác mình vừa làm. Không có nó thì việc nhận diện phải dựa vào
   * id do phản hồi HTTP mang về — mà gói socket được phát ngay lúc insert nên
   * thường tới TRƯỚC phản hồi đó, và cuộc đua ấy sinh ra thông báo trùng.
   */
  createdBy?: string;
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
    deletedAt: row.deleted_at ?? undefined,
    meetLink: row.meet_link ?? undefined,
    seriesId: row.series_id ?? undefined,
    recurrenceRule: row.recurrence_rule ?? undefined,
    createdBy: row.created_by ?? undefined,
  };
}

export function toEventInsertRow(
  dto: CreateEventDto,
  createdBy: string,
  series?: { seriesId: string; recurrenceRule: RecurrenceRuleDto | null },
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
    meet_link: dto.meetLink ?? null,
    series_id: series?.seriesId ?? null,
    recurrence_rule: series?.recurrenceRule ?? null,
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
  if (dto.meetLink !== undefined) row['meet_link'] = dto.meetLink;
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
