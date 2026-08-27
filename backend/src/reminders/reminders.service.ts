import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';
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
  constructor(private readonly supabaseService: SupabaseService) {}

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
   * Đặt lời nhắc cho MỌI thành viên của lịch chứa sự kiện.
   *
   * Bảng `reminders` gắn theo `user_id` và RLS `reminders_all_own` chỉ cho mỗi
   * người đụng vào hàng của chính mình — nên một buổi họp nhóm KHÔNG thể tự
   * nhắc cả nhóm bằng client của người tạo. Phần chèn vì vậy đi qua service
   * role, và đúng vì đi qua service role nên quyền phải được kiểm tay TRƯỚC
   * đó bằng chính client của người gọi: họ phải có quyền GHI trên lịch, tức
   * đúng mức quyền đã cần để tạo ra sự kiện này. Thiếu bước kiểm đó thì bất
   * kỳ ai đọc được sự kiện cũng bắt cả lịch phải nghe chuông theo ý mình.
   */
  async setForCalendarMembers(
    supabase: SupabaseClient,
    eventId: string,
    userId: string,
    items: ReminderItemDto[],
  ): Promise<{ created: number; members: number }> {
    const { data: eventRow, error: eventError } = await supabase
      .from('events')
      .select('id, start_at, calendar_id')
      .eq('id', eventId)
      .maybeSingle<{ id: string; start_at: string; calendar_id: string }>();
    if (eventError) throw new InternalServerErrorException(eventError.message);
    if (!eventRow) throw new NotFoundException('Event not found');

    await this.assertCanWriteCalendar(supabase, eventRow.calendar_id, userId);

    const admin = this.supabaseService.getServiceRoleClient();
    const { data: memberRows, error: memberError } = await admin
      .from('calendar_members')
      .select('user_id')
      .eq('calendar_id', eventRow.calendar_id);
    if (memberError) throw new InternalServerErrorException(memberError.message);

    const memberIds = [...new Set((memberRows ?? []).map((m) => m.user_id as string))];
    if (memberIds.length === 0) return { created: 0, members: 0 };

    // Xoá trước rồi chèn lại: gọi hai lần cho cùng một sự kiện phải ra đúng
    // một bộ lời nhắc, không phải hai lần chuông cho mỗi người.
    const { error: deleteError } = await admin
      .from('reminders')
      .delete()
      .eq('event_id', eventId);
    if (deleteError) throw new InternalServerErrorException(deleteError.message);

    if (items.length === 0) return { created: 0, members: memberIds.length };

    const eventStartMs = new Date(eventRow.start_at).getTime();
    const rows = memberIds.flatMap((memberId) =>
      items.map((item) => ({
        event_id: eventId,
        user_id: memberId,
        remind_at: new Date(eventStartMs - item.offsetMinutes * 60_000).toISOString(),
        remind_type: item.type,
      })),
    );

    const { error } = await admin.from('reminders').insert(rows);
    if (error) throw new InternalServerErrorException(error.message);
    return { created: rows.length, members: memberIds.length };
  }

  /** Chủ lịch, hoặc thành viên vai owner/editor. Thành viên thường (viewer —
   *  chính là thành viên nhóm không phải trưởng/quản trị) bị chặn. */
  private async assertCanWriteCalendar(
    supabase: SupabaseClient,
    calendarId: string,
    userId: string,
  ): Promise<void> {
    const { data: calendar } = await supabase
      .from('calendars')
      .select('owner_id')
      .eq('id', calendarId)
      .maybeSingle<{ owner_id: string | null }>();
    if (calendar?.owner_id === userId) return;

    const { data: membership } = await supabase
      .from('calendar_members')
      .select('role')
      .eq('calendar_id', calendarId)
      .eq('user_id', userId)
      .maybeSingle<{ role: string }>();
    if (membership?.role === 'owner' || membership?.role === 'editor') return;

    throw new ForbiddenException(
      'You do not have permission to set reminders for this calendar',
    );
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
      .select('id, event_id, remind_at, events(title, start_at, meet_link)')
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
