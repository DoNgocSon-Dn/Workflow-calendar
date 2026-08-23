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
    const parsed = await this.aiService.parseEventFromText(dto.message);

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

    return { intent: 'unclear' as const, title: parsed.title, message: dto.message };
  }
}
