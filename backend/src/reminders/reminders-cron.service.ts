import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseClient } from '@supabase/supabase-js';
import { MailService } from '../mail/mail.service';
import { PushService } from '../push/push.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SupabaseService } from '../supabase/supabase.service';

interface DueReminderRow {
  id: string;
  event_id: string;
  user_id: string;
  remind_type: 'popup' | 'email';
  events: { title: string; start_at: string; meet_link: string | null; calendar_id: string } | null;
}

@Injectable()
export class RemindersCronService {
  private readonly logger = new Logger(RemindersCronService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly mailService: MailService,
    private readonly pushService: PushService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleDueReminders(): Promise<void> {
    const supabase = this.supabaseService.getServiceRoleClient();
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from('reminders')
      .select('id, event_id, user_id, remind_type, events(title, start_at, meet_link, calendar_id)')
      .lte('remind_at', nowIso)
      .eq('is_sent', false)
      .returns<DueReminderRow[]>();

    if (error) {
      this.logger.error(`Failed to fetch due reminders: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) return;

    for (const reminder of data) {
      try {
        await this.dispatch(supabase, reminder);
      } catch (err) {
        this.logger.error(
          `Failed to dispatch reminder ${reminder.id}: ${(err as Error).message}`,
        );
      } finally {
        await supabase.from('reminders').update({ is_sent: true }).eq('id', reminder.id);
      }
    }
  }

  private async dispatch(supabase: SupabaseClient, reminder: DueReminderRow): Promise<void> {
    const title = reminder.events?.title ?? 'Sự kiện';
    const startAt = reminder.events?.start_at ?? '';
    const calendarId = reminder.events?.calendar_id;

    let groupId: string | null = null;
    if (calendarId) {
      const { data: group } = await supabase
        .from('groups')
        .select('id')
        .eq('calendar_id', calendarId)
        .maybeSingle();
      if (group?.id) groupId = group.id;
    }

    if (reminder.remind_type === 'popup') {
      // App đang mở: popup trong app qua socket.
      this.realtimeGateway.emitToUser(reminder.user_id, 'reminder:fire', {
        reminderId: reminder.id,
        eventId: reminder.event_id,
        title,
        startAt,
        meetLink: reminder.events?.meet_link ?? null,
        groupId,
      });
      // App đã đóng: thông báo hệ điều hành qua Web Push (bỏ qua êm nếu người
      // dùng chưa bật hoặc VAPID chưa cấu hình). Giờ diễn ra để service worker
      // tự format theo múi giờ + ngôn ngữ của trình duyệt.
      await this.pushService.sendToUser(reminder.user_id, {
        title,
        body: 'reminder',
        startAt: startAt || undefined,
        url: groupId ? `/groups/${groupId}` : '/calendar',
        tag: `reminder:${reminder.event_id}`,
      });
      return;
    }

    const { data: email, error } = await supabase.rpc('get_user_email_by_id', {
      p_user_id: reminder.user_id,
    });
    if (error || !email) {
      this.logger.warn(
        `No email found for user ${reminder.user_id}, skip reminder ${reminder.id}`,
      );
      return;
    }
    await this.mailService.sendReminderEmail(email as string, title, startAt);
  }
}
