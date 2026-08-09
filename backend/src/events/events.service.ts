import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { AppConfig } from '../config/configuration';
import { MailService } from '../mail/mail.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AttendeeDto, AttendeeRow, toAttendeeDto } from './attendee.mapper';
import { CheckConflictsDto } from './dto/check-conflicts.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { InviteAttendeeDto } from './dto/invite-attendee.dto';
import { RespondInviteDto } from './dto/respond-invite.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import {
  ConflictEventDto,
  EventDto,
  EventRow,
  toConflictEventDto,
  toEventDto,
  toEventInsertRow,
  toEventUpdateRow,
} from './event.mapper';

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface InviteEventContext {
  title: string;
  location: string | null;
  start_at: string;
  end_at: string;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly realtimeGateway: RealtimeGateway,
    private readonly mailService: MailService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async findAll(
    supabase: SupabaseClient,
    calendarId?: string,
  ): Promise<EventDto[]> {
    let query = supabase
      .from('events')
      .select('*')
      .order('start_at', { ascending: true });
    if (calendarId) {
      query = query.eq('calendar_id', calendarId);
    }

    const { data, error } = await query;
    if (error) throw new InternalServerErrorException(error.message);
    return (data as EventRow[]).map(toEventDto);
  }

  async create(
    supabase: SupabaseClient,
    dto: CreateEventDto,
    createdBy: string,
  ): Promise<EventDto> {
    const { data, error } = await supabase
      .from('events')
      .insert(toEventInsertRow(dto, createdBy))
      .select('*')
      .returns<EventRow[]>()
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    const eventDto = toEventDto(data);
    this.realtimeGateway.emitToCalendar(
      eventDto.calendarId,
      'event:created',
      eventDto,
    );
    return eventDto;
  }

  async update(
    supabase: SupabaseClient,
    id: string,
    dto: UpdateEventDto,
  ): Promise<EventDto> {
    const { data, error } = await supabase
      .from('events')
      .update(toEventUpdateRow(dto))
      .eq('id', id)
      .select('*')
      .returns<EventRow[]>();

    if (error) throw new InternalServerErrorException(error.message);
    const rows = data;
    if (rows.length === 0) {
      throw new NotFoundException(
        'Event not found or you do not have permission to edit it',
      );
    }
    const eventDto = toEventDto(rows[0]);
    this.realtimeGateway.emitToCalendar(
      eventDto.calendarId,
      'event:updated',
      eventDto,
    );
    return eventDto;
  }

  async remove(supabase: SupabaseClient, id: string): Promise<void> {
    const { data, error } = await supabase
      .from('events')
      .delete()
      .eq('id', id)
      .select('id, calendar_id')
      .returns<{ id: string; calendar_id: string }[]>();

    if (error) throw new InternalServerErrorException(error.message);
    if (data.length === 0) {
      throw new NotFoundException(
        'Event not found or you do not have permission to delete it',
      );
    }
    this.realtimeGateway.emitToCalendar(data[0].calendar_id, 'event:deleted', {
      id: data[0].id,
    });
  }

  async checkConflicts(
    supabase: SupabaseClient,
    dto: CheckConflictsDto,
  ): Promise<ConflictEventDto[]> {
    let query = supabase
      .from('events')
      .select('*')
      .lt('start_at', dto.end)
      .gt('end_at', dto.start);
    if (dto.excludeEventId) {
      query = query.neq('id', dto.excludeEventId);
    }

    const { data, error } = await query;
    if (error) throw new InternalServerErrorException(error.message);
    return (data as EventRow[]).map(toConflictEventDto);
  }

  async invite(
    supabase: SupabaseClient,
    eventId: string,
    dto: InviteAttendeeDto,
  ): Promise<AttendeeDto> {
    const { data: eventRow, error: eventError } = await supabase
      .from('events')
      .select('id, calendar_id, title, location, start_at, end_at')
      .eq('id', eventId)
      .maybeSingle<{ id: string; calendar_id: string } & InviteEventContext>();
    if (eventError) throw new InternalServerErrorException(eventError.message);
    if (!eventRow) throw new NotFoundException('Event not found');

    const { data: userId, error: lookupError } = await supabase.rpc(
      'find_user_id_by_email',
      { p_email: dto.email },
    );
    if (lookupError) throw new InternalServerErrorException(lookupError.message);
    if (!userId) {
      throw new NotFoundException('Không tìm thấy người dùng với email này');
    }

    const respondToken = randomUUID();
    const tokenExpiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_MS).toISOString();

    const { data, error } = await supabase
      .from('event_attendees')
      .insert({
        event_id: eventId,
        user_id: userId,
        status: 'pending',
        respond_token: respondToken,
        token_expires_at: tokenExpiresAt,
      })
      .select('id, user_id, status')
      .single<{ id: string; user_id: string; status: AttendeeRow['status'] }>();

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException('Người này đã được mời tham gia sự kiện');
      }
      throw new InternalServerErrorException(error.message);
    }

    const attendeeDto = toAttendeeDto({
      id: data.id,
      user_id: data.user_id,
      email: dto.email,
      status: data.status,
    });

    this.realtimeGateway.emitToCalendar(eventRow.calendar_id, 'attendee:invited', {
      eventId,
      attendee: attendeeDto,
    });
    this.realtimeGateway.emitToUser(data.user_id, 'attendee:invited', {
      eventId,
      attendee: attendeeDto,
    });

    // Không chặn kết quả invite nếu gửi mail lỗi (VD thiếu GMAIL_* trong
    // .env) — lời mời trong app vẫn có giá trị dù email chưa gửi được.
    void this.sendInviteEmailSafely(eventRow, dto.email, respondToken, eventId);

    return attendeeDto;
  }

  private async sendInviteEmailSafely(
    eventRow: InviteEventContext,
    toEmail: string,
    token: string,
    eventId: string,
  ): Promise<void> {
    try {
      const baseUrl = this.configService.get('apiBaseUrl', { infer: true });
      await this.mailService.sendInviteEmail({
        to: toEmail,
        eventTitle: eventRow.title,
        startAt: eventRow.start_at,
        endAt: eventRow.end_at,
        location: eventRow.location ?? undefined,
        acceptUrl: `${baseUrl}/events/${eventId}/respond-via-email?token=${token}&action=accept`,
        declineUrl: `${baseUrl}/events/${eventId}/respond-via-email?token=${token}&action=decline`,
      });
    } catch (err) {
      this.logger.warn(`Failed to send invite email to ${toEmail}: ${(err as Error).message}`);
    }
  }

  async respond(
    supabase: SupabaseClient,
    eventId: string,
    userId: string,
    dto: RespondInviteDto,
  ): Promise<AttendeeDto> {
    const { data, error } = await supabase
      .from('event_attendees')
      .update({ status: dto.status })
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .select('id, user_id, status')
      .returns<{ id: string; user_id: string; status: AttendeeRow['status'] }[]>();

    if (error) throw new InternalServerErrorException(error.message);
    if (data.length === 0) {
      throw new NotFoundException('Lời mời không tồn tại');
    }

    const { data: eventRow } = await supabase
      .from('events')
      .select('calendar_id')
      .eq('id', eventId)
      .maybeSingle<{ calendar_id: string }>();

    const attendeeDto = toAttendeeDto({ ...data[0], email: '' });
    if (eventRow) {
      this.realtimeGateway.emitToCalendar(
        eventRow.calendar_id,
        'attendee:statusChanged',
        { eventId, attendee: attendeeDto },
      );
    }
    return attendeeDto;
  }

  async listAttendees(
    supabase: SupabaseClient,
    eventId: string,
  ): Promise<AttendeeDto[]> {
    const { data, error } = await supabase.rpc('list_event_attendees', {
      p_event_id: eventId,
    });
    if (error) throw new InternalServerErrorException(error.message);
    return (data as AttendeeRow[]).map(toAttendeeDto);
  }
}
