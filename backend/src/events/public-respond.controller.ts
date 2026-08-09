import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SupabaseService } from '../supabase/supabase.service';

interface AttendeeTokenRow {
  id: string;
  event_id: string;
  user_id: string;
  status: 'pending' | 'accepted' | 'declined';
  respond_token: string | null;
  token_expires_at: string | null;
  token_used: boolean;
}

function renderPage(title: string, message: string, ok: boolean): string {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  body { font-family: sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; background:#f5f5f5; }
  .card { background:#fff; padding:32px 40px; border-radius:8px; box-shadow:0 2px 12px rgba(0,0,0,.08); text-align:center; max-width:420px; }
  h1 { font-size:20px; color: ${ok ? '#1a73e8' : '#d93025'}; margin:0 0 12px; }
  p { color:#444; }
</style>
</head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body>
</html>`;
}

// Không có SupabaseAuthGuard — người bấm link trong email chưa đăng nhập.
// Xác thực bằng chính respond_token (random, hết hạn 7 ngày, tự vô hiệu sau
// khi dùng). Rate-limit theo IP để tránh brute-force đoán token.
@Controller('events')
export class PublicRespondController {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  @Get(':id/respond-via-email')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Throttle({ 'respond-email': { limit: 10, ttl: 60_000 } })
  async respondViaEmail(
    @Param('id') eventId: string,
    @Query('token') token?: string,
    @Query('action') action?: string,
  ): Promise<string> {
    if (!token || (action !== 'accept' && action !== 'decline')) {
      return renderPage(
        'Liên kết không hợp lệ',
        'Thiếu token hoặc hành động không hợp lệ.',
        false,
      );
    }

    const supabase = this.supabaseService.getServiceRoleClient();
    const { data: attendee, error } = await supabase
      .from('event_attendees')
      .select('id, event_id, user_id, status, respond_token, token_expires_at, token_used')
      .eq('event_id', eventId)
      .eq('respond_token', token)
      .maybeSingle<AttendeeTokenRow>();

    if (error || !attendee) {
      return renderPage(
        'Liên kết không hợp lệ',
        'Không tìm thấy lời mời tương ứng với liên kết này.',
        false,
      );
    }
    if (attendee.token_used) {
      return renderPage(
        'Liên kết đã được sử dụng',
        'Bạn đã xác nhận trước đó, không thể dùng lại liên kết này.',
        false,
      );
    }
    if (
      attendee.token_expires_at &&
      new Date(attendee.token_expires_at).getTime() < Date.now()
    ) {
      return renderPage(
        'Liên kết đã hết hạn',
        'Liên kết xác nhận đã hết hạn sau 7 ngày. Vui lòng mở app để phản hồi.',
        false,
      );
    }

    const status = action === 'accept' ? 'accepted' : 'declined';
    const { data: updated, error: updateError } = await supabase
      .from('event_attendees')
      .update({ status, token_used: true })
      .eq('id', attendee.id)
      .select('id, user_id, status')
      .single<{ id: string; user_id: string; status: string }>();

    if (updateError || !updated) {
      return renderPage(
        'Có lỗi xảy ra',
        'Không thể cập nhật trạng thái, vui lòng thử lại sau.',
        false,
      );
    }

    const { data: eventRow } = await supabase
      .from('events')
      .select('calendar_id')
      .eq('id', eventId)
      .maybeSingle<{ calendar_id: string }>();
    if (eventRow) {
      this.realtimeGateway.emitToCalendar(eventRow.calendar_id, 'attendee:statusChanged', {
        eventId,
        attendee: { id: updated.id, userId: updated.user_id, email: '', status: updated.status },
      });
    }

    const label = status === 'accepted' ? 'Đã xác nhận tham gia ✅' : 'Đã từ chối tham gia';
    return renderPage(label, 'Cảm ơn bạn đã phản hồi. Bạn có thể đóng trang này.', true);
  }
}
