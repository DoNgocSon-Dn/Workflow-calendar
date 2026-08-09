import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentSupabase } from '../auth/current-supabase.decorator';
import { CalendarsService } from './calendars.service';
import { CreateCalendarDto } from './dto/create-calendar.dto';
import { UpdateCalendarDto } from './dto/update-calendar.dto';
import type { SupabaseClient } from '@supabase/supabase-js';

@Controller('calendars')
@UseGuards(SupabaseAuthGuard)
export class CalendarsController {
  constructor(private readonly calendarsService: CalendarsService) {}

  @Get()
  findAll(@CurrentSupabase() supabase: SupabaseClient) {
    return this.calendarsService.findAllForUser(supabase);
  }

  @Post()
  create(
    @CurrentSupabase() supabase: SupabaseClient,
    @Body() dto: CreateCalendarDto,
  ) {
    return this.calendarsService.create(supabase, dto);
  }

  @Patch(':id')
  update(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('id') id: string,
    @Body() dto: UpdateCalendarDto,
  ) {
    return this.calendarsService.update(supabase, id, dto);
  }

  @Delete(':id')
  remove(@CurrentSupabase() supabase: SupabaseClient, @Param('id') id: string) {
    return this.calendarsService.remove(supabase, id);
  }

  @Get(':id/members')
  listMembers(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('id') id: string,
  ) {
    return this.calendarsService.listMembers(supabase, id);
  }
}
