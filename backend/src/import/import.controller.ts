import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentSupabase } from '../auth/current-supabase.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ImportService } from './import.service';
import { EventsService } from '../events/events.service';
import { CreateEventDto } from '../events/dto/create-event.dto';

@Controller()
@UseGuards(SupabaseAuthGuard)
export class ImportController {
  constructor(
    private readonly importService: ImportService,
    private readonly eventsService: EventsService,
  ) {}

  @Post('calendars/import')
  @UseInterceptors(FileInterceptor('file'))
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
  async bulkCreateEvents(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Body('calendarId') calendarId: string,
    @Body('events') events: CreateEventDto[],
  ) {
    if (!calendarId) {
      throw new BadRequestException('Vui lòng chọn lịch để lưu sự kiện.');
    }
    if (!Array.isArray(events) || events.length === 0) {
      throw new BadRequestException('Danh sách sự kiện lưu không được rỗng.');
    }
    const dtos = events.map((e) => ({
      ...e,
      calendarId,
    }));
    return this.eventsService.bulkCreate(supabase, dtos, user.id);
  }
}
