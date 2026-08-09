import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CreateCalendarDto } from './dto/create-calendar.dto';
import { UpdateCalendarDto } from './dto/update-calendar.dto';
import { CalendarDto, CalendarRow, toCalendarDto } from './calendar.mapper';

export interface CalendarMemberDto {
  userId: string;
  role: string;
}

@Injectable()
export class CalendarsService {
  async findAllForUser(supabase: SupabaseClient): Promise<CalendarDto[]> {
    const { data, error } = await supabase
      .from('calendars')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw new InternalServerErrorException(error.message);
    return (data as CalendarRow[]).map(toCalendarDto);
  }

  async create(
    supabase: SupabaseClient,
    dto: CreateCalendarDto,
  ): Promise<CalendarDto> {
    const { data, error } = await supabase
      .rpc('create_calendar_with_owner', {
        p_name: dto.name,
        p_color: dto.color,
      })
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return toCalendarDto(data as CalendarRow);
  }

  async update(
    supabase: SupabaseClient,
    id: string,
    dto: UpdateCalendarDto,
  ): Promise<CalendarDto> {
    const { data, error } = await supabase
      .from('calendars')
      .update(dto)
      .eq('id', id)
      .select('*');

    if (error) throw new InternalServerErrorException(error.message);
    const rows = data as CalendarRow[];
    if (rows.length === 0) {
      throw new NotFoundException(
        'Calendar not found or you do not have permission to edit it',
      );
    }
    return toCalendarDto(rows[0]);
  }

  async remove(supabase: SupabaseClient, id: string): Promise<void> {
    const { data, error } = await supabase
      .from('calendars')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) throw new InternalServerErrorException(error.message);
    if ((data as { id: string }[]).length === 0) {
      throw new NotFoundException(
        'Calendar not found or you do not have permission to delete it',
      );
    }
  }

  async listMembers(
    supabase: SupabaseClient,
    calendarId: string,
  ): Promise<CalendarMemberDto[]> {
    const { data, error } = await supabase
      .from('calendar_members')
      .select('user_id, role')
      .eq('calendar_id', calendarId);

    if (error) throw new InternalServerErrorException(error.message);
    return (data as { user_id: string; role: string }[]).map((row) => ({
      userId: row.user_id,
      role: row.role,
    }));
  }
}
