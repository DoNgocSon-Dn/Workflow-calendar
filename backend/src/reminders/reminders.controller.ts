import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { CurrentSupabase } from '../auth/current-supabase.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { SetRemindersDto } from './dto/set-reminders.dto';
import { SnoozeReminderDto } from './dto/snooze-reminder.dto';
import { RemindersService } from './reminders.service';

@Controller()
@UseGuards(SupabaseAuthGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get('events/:eventId/reminders')
  listForEvent(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('eventId') eventId: string,
  ) {
    return this.remindersService.listForEvent(supabase, eventId);
  }

  // Route tĩnh 'reminders/missed' phải đứng TRƯỚC 'reminders/:id/snooze' bên
  // dưới — không có tham số cố định nên thứ tự khai báo không xung đột với
  // 'events/:eventId/reminders' (khác tiền tố), nhưng vẫn giữ quy ước đặt
  // route tĩnh lên trước cho nhất quán với GroupsController.
  @Get('reminders/missed')
  listMissed(@CurrentSupabase() supabase: SupabaseClient, @CurrentUser() user: User) {
    return this.remindersService.listMissed(supabase, user.id);
  }

  @Put('events/:eventId/reminders')
  setForEvent(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('eventId') eventId: string,
    @Body() dto: SetRemindersDto,
  ) {
    return this.remindersService.setForEvent(supabase, eventId, user.id, dto.reminders);
  }

  @Post('reminders/:id/snooze')
  snooze(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('id') id: string,
    @Body() dto: SnoozeReminderDto,
  ) {
    return this.remindersService.snooze(supabase, id, dto.minutes);
  }
}
