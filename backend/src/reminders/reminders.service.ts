import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { ReminderItemDto } from './dto/set-reminders.dto';
import { ReminderDto, ReminderRow, toReminderDto } from './reminder.mapper';

@Injectable()
export class RemindersService {
  async listForEvent(
    supabase: SupabaseClient,
    eventId: string,
  ): Promise<ReminderDto[]> {
    const { data, error } = await supabase
      .from('reminders')
      .select('*')
      .eq('event_id', eventId)
      .order('remind_at', { ascending: true });

    if (error) throw new InternalServerErrorException(error.message);
    return (data as ReminderRow[]).map(toReminderDto);
  }

  async setForEvent(
    supabase: SupabaseClient,
    eventId: string,
    userId: string,
    items: ReminderItemDto[],
  ): Promise<ReminderDto[]> {
    const { data: eventRow, error: eventError } = await supabase
      .from('events')
      .select('id, start_at')
      .eq('id', eventId)
      .maybeSingle<{ id: string; start_at: string }>();
    if (eventError) throw new InternalServerErrorException(eventError.message);
    if (!eventRow) throw new NotFoundException('Event not found');

    const { error: deleteError } = await supabase
      .from('reminders')
      .delete()
      .eq('event_id', eventId);
    if (deleteError) throw new InternalServerErrorException(deleteError.message);

    if (items.length === 0) return [];

    const eventStartMs = new Date(eventRow.start_at).getTime();
    const rows = items.map((item) => ({
      event_id: eventId,
      user_id: userId,
      remind_at: new Date(eventStartMs - item.offsetMinutes * 60_000).toISOString(),
      remind_type: item.type,
    }));

    const { data, error } = await supabase
      .from('reminders')
      .insert(rows)
      .select('*')
      .returns<ReminderRow[]>();
    if (error) throw new InternalServerErrorException(error.message);
    return data.map(toReminderDto);
  }

  async snooze(
    supabase: SupabaseClient,
    id: string,
    minutes: number,
  ): Promise<ReminderDto> {
    const remindAt = new Date(Date.now() + minutes * 60_000).toISOString();
    const { data, error } = await supabase
      .from('reminders')
      .update({ remind_at: remindAt, is_sent: false, snoozed_until: null })
      .eq('id', id)
      .select('*')
      .returns<ReminderRow[]>();

    if (error) throw new InternalServerErrorException(error.message);
    if (data.length === 0) throw new NotFoundException('Reminder not found');
    return toReminderDto(data[0]);
  }
}
