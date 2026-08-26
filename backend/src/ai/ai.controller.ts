import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { CurrentSupabase } from '../auth/current-supabase.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { EventsService } from '../events/events.service';
import { AiService } from './ai.service';
import { AiChatDto } from './dto/ai-chat.dto';
import { AiFileImportService } from '../import/services/ai-file-import.service';
import { MulterExceptionFilter } from '../common/multer-exception.filter';
import {
  ALLOWED_AI_FILE_EXTENSIONS,
  HEAVY_OPERATION_RATE_LIMIT,
  MULTER_FILE_SIZE_LIMIT,
  hasAllowedExtension,
} from '../common/limits';

@Controller('ai')
@UseGuards(SupabaseAuthGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly eventsService: EventsService,
    private readonly fileImport: AiFileImportService,
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

    // CỐ Ý chỉ trả về danh sách, KHÔNG lưu. Người dùng phải xem và chọn ở
    // bước xem trước rồi mới ghi vào "Việc cần làm" — khác hẳn create_event
    // ở trên vốn lưu ngay vì đó là một hành động dứt khoát, còn đây là một
    // bản nháp nhiều mục cần được duyệt.
    if (parsed.intent === 'create_todos' && parsed.todos?.length) {
      return {
        intent: 'create_todos' as const,
        goal: parsed.goal ?? '',
        todos: parsed.todos,
      };
    }

    if (parsed.intent === 'chat' && parsed.reply) {
      return { intent: 'chat' as const, reply: parsed.reply };
    }

    // Chuyển tiếp NGUYÊN VẸN phần đã hiểu được: frontend cần biết còn thiếu
    // gì để hỏi đúng câu, và biết giờ nào đã nắm được để khỏi bắt người dùng
    // gõ lại từ đầu.
    return {
      intent: 'unclear' as const,
      title: parsed.title,
      message: dto.message,
      ...(parsed.missingFields?.length ? { missingFields: parsed.missingFields } : {}),
      ...(parsed.startTime ? { startTime: parsed.startTime } : {}),
      ...(parsed.endTime ? { endTime: parsed.endTime } : {}),
    };
  }

  /**
   * Đọc một file .ics/.csv/.pdf và đề xuất sự kiện + việc cần làm.
   *
   * CỐ Ý KHÔNG lưu bất cứ thứ gì: kết quả chỉ để dựng bảng xem trước trong
   * khung chat. Người dùng chọn xong mới gọi các endpoint tạo sẵn có.
   */
  @Post('analyze-file')
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MULTER_FILE_SIZE_LIMIT, files: 1 },
      fileFilter: (_req, file, callback) => {
        if (!hasAllowedExtension(file.originalname, ALLOWED_AI_FILE_EXTENSIONS)) {
          callback(
            new BadRequestException(
              'Chỉ hỗ trợ file .ics, .csv hoặc .pdf.',
            ),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  // Đọc file tốn tài nguyên hơn chat thường nên hạn mức chặt hơn.
  @Throttle({ default: HEAVY_OPERATION_RATE_LIMIT })
  async analyzeFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('message') message = '',
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng đính kèm một file.');
    }

    if (!hasAllowedExtension(file.originalname, ALLOWED_AI_FILE_EXTENSIONS)) {
      throw new BadRequestException(
        'Chỉ hỗ trợ file .ics, .csv hoặc .pdf.',
      );
    }

    const text = await this.fileImport.extractTextFromFile(file);
    if (!text.trim()) {
      throw new BadRequestException('File không có nội dung văn bản nào để đọc.');
    }

    try {
      const analysis = await this.aiService.analyzeFile(text, file.originalname, message ?? '');
      return { ...analysis, fileName: file.originalname };
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }
}
