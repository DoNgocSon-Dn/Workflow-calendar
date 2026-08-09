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

  @Post()
  create(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Body() dto: CreateEventDto,
  ) {
    return this.eventsService.create(supabase, dto, user.id);
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
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: RespondInviteDto,
  ) {
    return this.eventsService.respond(supabase, id, user.id, dto);
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
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.update(supabase, id, dto);
  }

  @Delete(':id')
  remove(@CurrentSupabase() supabase: SupabaseClient, @Param('id') id: string) {
    return this.eventsService.remove(supabase, id);
  }
}
