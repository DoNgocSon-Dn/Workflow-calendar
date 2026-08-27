import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { CurrentSupabase } from '../auth/current-supabase.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CheckConflictsDto } from './dto/check-conflicts.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { InviteAttendeeDto } from './dto/invite-attendee.dto';
import { RespondInviteDto } from './dto/respond-invite.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

@Controller('events')
@UseGuards(SupabaseAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  findAll(
    @CurrentSupabase() supabase: SupabaseClient,
    @Query('calendarId') calendarId?: string,
  ) {
    return this.eventsService.findAll(supabase, calendarId);
  }

  @Get('trash')
  listTrash(
    @CurrentSupabase() supabase: SupabaseClient,
    @Query('calendarId') calendarId?: string,
  ) {
    return this.eventsService.listTrash(supabase, calendarId);
  }

  /** Lời mời tham gia SỰ KIỆN còn đang chờ của chính người gọi — để client
   *  kéo lúc mở app, đảm bảo người được mời vẫn thấy lời mời dù lúc mời họ
   *  đang offline (giống /calendars/invites/mine cho lời mời LỊCH). */
  @Get('invites/mine')
  listMyInvites(@CurrentUser() user: User) {
    return this.eventsService.listMyInvites(user.id);
  }

  @Post()
  create(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Body() dto: CreateEventDto,
  ) {
    if (dto.recurrenceRule) {
      return this.eventsService.createSeries(supabase, dto, user.id);
    }
    return this.eventsService.create(supabase, dto, user.id);
  }

  @Post('series')
  createSeries(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Body() dto: CreateEventDto,
  ) {
    return this.eventsService.createSeries(supabase, dto, user.id);
  }

  @Post('check-conflicts')
  checkConflicts(
    @CurrentSupabase() supabase: SupabaseClient,
    @Body() dto: CheckConflictsDto,
  ) {
    return this.eventsService.checkConflicts(supabase, dto);
  }

  @Post(':id/invite')
  invite(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('id') id: string,
    @Body() dto: InviteAttendeeDto,
  ) {
    return this.eventsService.invite(supabase, id, dto);
  }

  @Post(':id/respond')
  respond(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: RespondInviteDto,
  ) {
    return this.eventsService.respond(id, user.id, dto);
  }

  @Get(':id/attendees')
  listAttendees(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('id') id: string,
  ) {
    return this.eventsService.listAttendees(supabase, id);
  }

  @Patch(':id')
  update(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.update(supabase, id, dto, user.id);
  }

  @Patch(':id/series')
  updateSeries(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('scope') scope: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.updateSeries(
      supabase,
      id,
      dto,
      scope === 'all' ? 'all' : 'following',
      user.id,
    );
  }

  @Delete(':id')
  remove(@CurrentSupabase() supabase: SupabaseClient, @Param('id') id: string) {
    return this.eventsService.remove(supabase, id);
  }

  @Delete(':id/series')
  removeSeries(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('id') id: string,
    @Query('scope') scope: string,
  ) {
    return this.eventsService.removeSeries(supabase, id, scope === 'all' ? 'all' : 'following');
  }

  @Post(':id/restore')
  restore(@CurrentSupabase() supabase: SupabaseClient, @Param('id') id: string) {
    return this.eventsService.restore(supabase, id);
  }

  @Delete(':id/permanent')
  permanentDelete(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('id') id: string,
  ) {
    return this.eventsService.permanentDelete(supabase, id);
  }
}
