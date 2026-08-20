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
import { CurrentUser } from '../auth/current-user.decorator';
import { CalendarsService } from './calendars.service';
import { CreateCalendarDto } from './dto/create-calendar.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { RespondCalendarInviteDto } from './dto/respond-calendar-invite.dto';
import { UpdateCalendarDto } from './dto/update-calendar.dto';
import type { SupabaseClient, User } from '@supabase/supabase-js';

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

  @Get('invites/mine')
  listMyInvites(@CurrentSupabase() supabase: SupabaseClient) {
    return this.calendarsService.listMyInvites(supabase);
  }

  @Post('invites/:inviteId/respond')
  respondInvite(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('inviteId') inviteId: string,
    @Body() dto: RespondCalendarInviteDto,
  ) {
    return this.calendarsService.respondInvite(supabase, user.id, inviteId, dto);
  }

  @Post(':id/invites')
  invite(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.calendarsService.invite(supabase, id, user, dto);
  }
}
