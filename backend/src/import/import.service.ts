import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { IcsImportService, ParsedImportEvent } from './services/ics-import.service';
import { AiFileImportService } from './services/ai-file-import.service';
import { EventsService } from '../events/events.service';
import { ConflictEventDto } from '../events/event.mapper';

export interface ImportPreviewResponse {
  events: ParsedImportEvent[];
  conflicts: ConflictEventDto[];
}

@Injectable()
export class ImportService {
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
      const content = file.buffer.toString('utf-8');
      if (filename.endsWith('.ics')) {
        parsedEvents = this.icsImportService.parseIcs(content);
      } else if (filename.endsWith('.csv')) {
        parsedEvents = this.icsImportService.parseCsv(content);
      } else {
        throw new BadRequestException('Chế độ Nhập chuẩn chỉ hỗ trợ file .ics hoặc .csv');
      }
    } else {
      const text = await this.aiFileImportService.extractTextFromFile(file);
      parsedEvents = await this.aiFileImportService.parseEventsWithAi(text);
    }

    // Check conflicts for all imported events against user's schedule
    const conflicts: ConflictEventDto[] = [];
    for (const evt of parsedEvents) {
      if (evt.start && evt.end) {
        try {
          const list = await this.eventsService.checkConflicts(
            supabase,
            { start: evt.start, end: evt.end },
          );
          conflicts.push(...list);
        } catch {}
      }
    }

    return {
      events: parsedEvents,
      conflicts,
    };
  }
}
