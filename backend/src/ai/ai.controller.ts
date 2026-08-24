import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { CurrentSupabase } from '../auth/current-supabase.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { EventsService } from '../events/events.service';
import { AiService } from './ai.service';
import { AiChatDto } from './dto/ai-chat.dto';

@Controller('ai')
@UseGuards(SupabaseAuthGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly eventsService: EventsService,
  ) {}

  @Post('chat')
  // Ghi đè throttler 'default' cho riêng route này: 20 lượt chat AI mỗi giờ.
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  async chat(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Body() dto: AiChatDto,
  ) {
    // Ngữ cảnh lịch: toàn bộ sự kiện người dùng có quyền xem (RLS lọc sẵn qua
    // supabase client theo user), giới hạn về một cửa sổ gần "hiện tại" và cắt
    // bớt số lượng để prompt không phình to vô hạn với người dùng nhiều sự kiện.
    const allEvents = await this.eventsService.findAll(supabase);
    const now = Date.now();
    const windowStart = now - 7 * 24 * 60 * 60 * 1000;
    const windowEnd = now + 30 * 24 * 60 * 60 * 1000;
    const events = allEvents
      .filter((e) => {
        const start = new Date(e.start).getTime();
        return start >= windowStart && start <= windowEnd;
      })
      .slice(0, 60)
      .map((e) => ({
        title: e.title,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
        ...(e.location ? { location: e.location } : {}),
      }));

    const parsed = await this.aiService.chat(dto.message, {
      events,
      history: dto.history ?? [],
    });

    // Lưu lịch sử chat — best-effort, không chặn phản hồi nếu insert lỗi.
    await supabase.from('ai_conversations').insert({
      user_id: user.id,
      messages: [
        { role: 'user', content: dto.message },
        { role: 'assistant', content: JSON.stringify(parsed) },
      ],
    });

    if (parsed.intent === 'create_event' && parsed.title && parsed.start_at && parsed.end_at) {
      const event = await this.eventsService.create(
        supabase,
        {
          calendarId: dto.calendarId,
          title: parsed.title,
          start: parsed.start_at,
          end: parsed.end_at,
          allDay: false,
          ...(parsed.location ? { location: parsed.location } : {}),
        },
        user.id,
      );
      return { intent: 'create_event' as const, event };
    }

    if (parsed.intent === 'chat' && parsed.reply) {
      return { intent: 'chat' as const, reply: parsed.reply };
    }

    return { intent: 'unclear' as const, title: parsed.title, message: dto.message };
  }
}
