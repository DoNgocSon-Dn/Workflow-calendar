import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { ReminderItemDto } from './dto/set-reminders.dto';
import {
  MissedReminderDto,
  MissedReminderRow,
  ReminderDto,
  ReminderRow,
  toMissedReminderDto,
  toReminderDto,
} from './reminder.mapper';

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

  /**
   * Nhắc lịch đã BẮN (cron xử lý xong, is_sent = true) nhưng chưa client nào
   * thực sự nhận được (seen_at còn null) — do offline đúng lúc cron bắn qua
   * socket. Gọi 1 lần khi mở app / mỗi lần socket reconnect, để bù lại y hệt
   * như vừa nhận realtime, rồi đánh dấu đã thấy để không lặp lại ở lần sau.
   *
   * remind_type chỉ lọc 'popup': loại 'email' cron đã gửi mail xong việc rồi,
   * không có gì để "bù" ở phía client.
   */
  async listMissed(
    supabase: SupabaseClient,
    userId: string,
  ): Promise<MissedReminderDto[]> {
    const { data, error } = await supabase
      .from('reminders')
      .select('id, event_id, remind_at, events(title, start_at)')
      .eq('user_id', userId)
      .eq('remind_type', 'popup')
      .eq('is_sent', true)
      .is('seen_at', null)
      .order('remind_at', { ascending: true })
      .returns<MissedReminderRow[]>();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data || data.length === 0) return [];

    await supabase
      .from('reminders')
      .update({ seen_at: new Date().toISOString() })
      .in(
        'id',
        data.map((r) => r.id),
      );

    return data.map(toMissedReminderDto);
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
