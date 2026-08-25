import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { IcsImportService, ParsedImportEvent } from './services/ics-import.service';
import { AiFileImportService } from './services/ai-file-import.service';
import { EventsService } from '../events/events.service';
import { ConflictEventDto } from '../events/event.mapper';
import {
  ALLOWED_IMPORT_EXTENSIONS,
  MAX_IMPORT_EVENTS,
  hasAllowedExtension,
} from '../common/limits';

export interface ImportPreviewResponse {
  events: ParsedImportEvent[];
  conflicts: ConflictEventDto[];
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly icsImportService: IcsImportService,
    private readonly aiFileImportService: AiFileImportService,
    private readonly eventsService: EventsService,
  ) {}

  async processImport(
    supabase: SupabaseClient,
    file: Express.Multer.File,
    mode: 'standard' | 'smart',
    userId: string,
  ): Promise<ImportPreviewResponse> {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file để tải lên.');
    }

    let parsedEvents: ParsedImportEvent[] = [];
    const filename = file.originalname.toLowerCase();

    if (mode === 'standard') {
      // Kiểm lại đuôi file ở tầng service. Controller đã lọc, nhưng service là
      // nơi duy nhất mọi đường gọi đều đi qua nên không dựa vào tầng trên.
      if (!hasAllowedExtension(filename, ALLOWED_IMPORT_EXTENSIONS)) {
        throw new BadRequestException('Chế độ Nhập chuẩn chỉ hỗ trợ file .ics hoặc .csv');
      }
      const content = file.buffer.toString('utf-8');
      if (filename.endsWith('.ics')) {
        parsedEvents = this.icsImportService.parseIcs(content);
      } else {
        parsedEvents = this.icsImportService.parseCsv(content);
      }
    } else {
      const text = await this.aiFileImportService.extractTextFromFile(file);
      parsedEvents = await this.aiFileImportService.parseEventsWithAi(text);
    }

    // Chặn TRƯỚC khi đụng tới database: file quá nhiều sự kiện thì dừng hẳn,
    // không kiểm tra trùng giờ, không ghi gì.
    if (parsedEvents.length > MAX_IMPORT_EVENTS) {
      throw new BadRequestException(
        `File chứa quá nhiều sự kiện (${parsedEvents.length}). Mỗi lần import tối đa ${MAX_IMPORT_EVENTS} sự kiện.`,
      );
    }

    return {
      events: parsedEvents,
      conflicts: await this.findConflicts(supabase, parsedEvents),
    };
  }

  /**
   * Tìm các sự kiện đã có trùng giờ với danh sách sắp import.
   *
   * Trước đây hàm này gọi `checkConflicts` MỘT LẦN CHO MỖI sự kiện — file 500
   * sự kiện là 500 truy vấn tuần tự. Nay lấy một lần toàn bộ sự kiện nằm trong
   * khoảng thời gian bao trùm cả file, rồi đối chiếu trong bộ nhớ.
   *
   * Định nghĩa trùng giờ giữ NGUYÊN như `EventsService.checkConflicts`:
   * `đã_có.start < mới.end && đã_có.end > mới.start` (nửa mở, nên hai sự kiện
   * nối đuôi nhau không tính là trùng). Chỉ đổi cách lấy dữ liệu, không đổi
   * nghiệp vụ — kể cả việc một sự kiện đã có trùng với nhiều sự kiện mới thì
   * vẫn xuất hiện nhiều lần trong kết quả, đúng như hành vi cũ.
   */
  private async findConflicts(
    supabase: SupabaseClient,
    parsedEvents: ParsedImportEvent[],
  ): Promise<ConflictEventDto[]> {
    const timed = parsedEvents.filter((e) => e.start && e.end);
    if (!timed.length) return [];

    // Khoảng bao trùm cả file: mọi sự kiện có thể trùng đều nằm trong đây.
    let windowStart = timed[0].start;
    let windowEnd = timed[0].end;
    for (const evt of timed) {
      if (evt.start < windowStart) windowStart = evt.start;
      if (evt.end > windowEnd) windowEnd = evt.end;
    }

    let existing: ConflictEventDto[];
    try {
      // Đúng một truy vấn, dùng lại chính checkConflicts nên điều kiện lọc và
      // phạm vi RLS không thể lệch khỏi phần còn lại của hệ thống.
      existing = await this.eventsService.checkConflicts(supabase, {
        start: windowStart,
        end: windowEnd,
      });
    } catch (err) {
      // Giữ nguyên hành vi cũ: lỗi khi dò trùng giờ không làm hỏng cả lần
      // import — người dùng vẫn xem trước và tự quyết định được.
      this.logger.warn(`Không kiểm tra được trùng giờ khi import: ${(err as Error).message}`);
      return [];
    }
    if (!existing.length) return [];

    const bounds = existing.map((e) => ({
      event: e,
      start: new Date(e.start).getTime(),
      end: new Date(e.end).getTime(),
    }));

    const conflicts: ConflictEventDto[] = [];
    for (const evt of timed) {
      const start = new Date(evt.start).getTime();
      const end = new Date(evt.end).getTime();
      if (Number.isNaN(start) || Number.isNaN(end)) continue;
      for (const candidate of bounds) {
        if (candidate.start < end && candidate.end > start) {
          conflicts.push(candidate.event);
        }
      }
    }
    return conflicts;
  }
}
