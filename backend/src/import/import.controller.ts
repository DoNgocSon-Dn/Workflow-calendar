import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentSupabase } from '../auth/current-supabase.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ImportService } from './import.service';
import { EventsService } from '../events/events.service';
import { CreateEventDto } from '../events/dto/create-event.dto';
import { MulterExceptionFilter } from '../common/multer-exception.filter';
import {
  ALLOWED_IMPORT_EXTENSIONS,
  HEAVY_OPERATION_RATE_LIMIT,
  MAX_BULK_CREATE_EVENTS,
  MULTER_FILE_SIZE_LIMIT,
  hasAllowedExtension,
} from '../common/limits';

@Controller()
@UseGuards(SupabaseAuthGuard)
export class ImportController {
  constructor(
    private readonly importService: ImportService,
    private readonly eventsService: EventsService,
  ) {}

  @Post('calendars/import')
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      // Chặn ngay tại multer: vượt ngưỡng là dừng đọc stream, không nạp trọn
      // file vào RAM rồi mới kiểm tra file.size.
      limits: { fileSize: MULTER_FILE_SIZE_LIMIT, files: 1 },
      // Lọc đuôi file trước cả khi ghi vào buffer. Không dùng `mimetype` vì đó
      // là giá trị client tự khai, giả được.
      fileFilter: (_req, file, callback) => {
        if (!hasAllowedExtension(file.originalname, ALLOWED_IMPORT_EXTENSIONS)) {
          callback(
            new BadRequestException(
              'Chỉ hỗ trợ file .ics hoặc .csv. File .xlsx, .docx hoặc .pdf hãy gửi cho Trợ lý AI.',
            ),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  // Import đọc file và truy vấn database nên nặng hơn request thường. Ghi đè
  // throttler 'default' cho riêng handler này — quota vẫn tách khỏi AI và
  // Bulk Create vì khoá throttler có kèm tên handler.
  @Throttle({ default: HEAVY_OPERATION_RATE_LIMIT })
  async importFile(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
    @Body('mode') mode: 'standard' | 'smart' = 'standard',
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file để tải lên.');
    }
    return this.importService.processImport(supabase, file, mode, user.id);
  }

  @Post('events/bulk-create')
  // Một request tạo được rất nhiều bản ghi nên hạn mức riêng, tách khỏi import.
  @Throttle({ default: HEAVY_OPERATION_RATE_LIMIT })
  async bulkCreateEvents(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Body('calendarId') calendarId: string,
    @Body('events') events: CreateEventDto[],
    @Body('batchId') batchId?: string,
  ) {
    if (!calendarId) {
      throw new BadRequestException('Vui lòng chọn lịch để lưu sự kiện.');
    }
    if (!Array.isArray(events) || events.length === 0) {
      throw new BadRequestException('Danh sách sự kiện lưu không được rỗng.');
    }
    // Kiểm TRƯỚC khi dựng dtos: từ chối sớm thì không tốn công map mảng khổng
    // lồ, và chắc chắn chưa có bản ghi nào chạm tới database.
    if (events.length > MAX_BULK_CREATE_EVENTS) {
      throw new BadRequestException(
        `Mỗi lần chỉ có thể tạo tối đa ${MAX_BULK_CREATE_EVENTS} sự kiện.`,
      );
    }
    const dtos = events.map((e) => ({
      ...e,
      calendarId,
    }));
    // batchId chỉ để client nhận lại tiếng vọng của chính mình — không đụng
    // tới dữ liệu nên chỉ cần chặn kiểu và độ dài, không cần là UUID hợp lệ.
    const safeBatchId =
      typeof batchId === 'string' && batchId.length > 0 && batchId.length <= 64
        ? batchId
        : undefined;
    return this.eventsService.bulkCreate(supabase, dtos, user.id, safeBatchId);
  }
}
