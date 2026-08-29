import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { CurrentSupabase } from '../auth/current-supabase.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { SetReminderPreferencesDto } from './dto/set-reminder-preferences.dto';
import { ReminderPreferencesService } from './reminder-preferences.service';

@Controller('reminder-preferences')
@UseGuards(SupabaseAuthGuard)
export class ReminderPreferencesController {
  constructor(private readonly service: ReminderPreferencesService) {}

  @Get()
  async get(@CurrentUser() user: User): Promise<{ offsets: number[] }> {
    return { offsets: await this.service.getOffsets(user.id) };
  }

  @Put()
  set(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Body() dto: SetReminderPreferencesDto,
  ): Promise<{ offsets: number[] }> {
    return this.service.setOffsets(supabase, user.id, dto.offsets);
  }
}
