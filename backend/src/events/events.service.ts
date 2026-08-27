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
import { SupabaseService } from '../supabase/supabase.service';
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
import { expandRecurrence } from './recurrence.util';

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SeriesEditScope = 'following' | 'all';

interface InviteEventContext {
  title: string;
  description: string | null;
  location: string | null;
  meet_link: string | null;
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
    private readonly supabaseService: SupabaseService,
  ) {}

  async findAll(
    supabase: SupabaseClient,
    calendarId?: string,
  ): Promise<EventDto[]> {
    let query = supabase
      .from('events')
      .select('*')
      .is('deleted_at', null)
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
    const row = toEventInsertRow(dto, createdBy);
    let { data, error } = await supabase
      .from('events')
      .insert(row)
      .select('*')
      .returns<EventRow[]>()
      .single();

    if (error) {
      this.logger.warn(`Insert event failed (${error.message}), retrying fallback without series_id/recurrence_rule/calendar_type...`);
      const { series_id, recurrence_rule, calendar_type, ...fallbackRow } = row;
      const res = await supabase
        .from('events')
        .insert(fallbackRow)
        .select('*')
        .returns<EventRow[]>()
        .single();
      if (res.error) throw new InternalServerErrorException(res.error.message);
      data = res.data;
    }

    const eventDto = toEventDto(data!);
    this.realtimeGateway.emitToCalendar(
      eventDto.calendarId,
      'event:created',
      eventDto,
    );
    void this.notifyConflictsSafely(supabase, createdBy, eventDto);
    return eventDto;
  }

  /**
   * Tạo nhiều sự kiện trong một lần (import file).
   *
   * Phát MỘT gói `events:bulk-created` cho mỗi lịch thay vì N gói
   * `event:created`: import 20 dòng mà bắn 20 gói thì client dựng 20 thông
   * báo "Sự kiện mới" và 20 popup nổi — đúng nội dung nhưng sai hình thức.
   * Người dùng chỉ cần biết "đã nhập 20 sự kiện".
   *
   * `batchId` do client sinh ra và được trả lại nguyên vẹn trong gói tin, để
   * chính người bấm import nhận ra tiếng vọng của mình dù gói socket về TRƯỚC
   * hay SAU phản hồi HTTP.
   */
  async bulkCreate(
    supabase: SupabaseClient,
    dtos: CreateEventDto[],
    createdBy: string,
    batchId?: string,
  ): Promise<EventDto[]> {
    if (dtos.length === 0) return [];
    const rows = dtos.map((dto) => toEventInsertRow(dto, createdBy));
    const { data, error } = await supabase
      .from('events')
      .insert(rows)
      .select('*')
      .returns<EventRow[]>();

    if (error) throw new InternalServerErrorException(error.message);
    const eventDtos = (data ?? []).map(toEventDto);

    // Gom theo lịch: một lô về nguyên tắc có thể chạm nhiều lịch, và mỗi phòng
    // chỉ được nhận đúng phần sự kiện của mình.
    const byCalendar = new Map<string, EventDto[]>();
    for (const dto of eventDtos) {
      const list = byCalendar.get(dto.calendarId);
      if (list) list.push(dto);
      else byCalendar.set(dto.calendarId, [dto]);
    }
    for (const [calendarId, events] of byCalendar) {
      this.realtimeGateway.emitToCalendar(calendarId, 'events:bulk-created', {
        calendarId,
        batchId,
        events,
      });
    }
    return eventDtos;
  }

  /**
   * Tạo một sự kiện, có thể lặp lại. Không lặp lại thì chỉ gọi create() như
   * cũ. Có lặp lại thì vật chất hoá mọi lần lặp thành các hàng events thật
   * cùng một series_id, insert một lượt và phát events:bulk-created — dùng
   * lại đúng khung của bulkCreate() (import file) thay vì tạo cơ chế song
   * song, để client không cần thêm handler realtime mới cho tạo mới.
   */
  async createSeries(
    supabase: SupabaseClient,
    dto: CreateEventDto,
    createdBy: string,
  ): Promise<EventDto[]> {
    if (!dto.recurrenceRule) {
      return [await this.create(supabase, dto, createdBy)];
    }

    const seriesId = randomUUID();
    const occurrences = expandRecurrence(
      new Date(dto.start),
      new Date(dto.end),
      dto.recurrenceRule,
    );
    const rows = occurrences.map((occ) =>
      toEventInsertRow(
        { ...dto, start: occ.start.toISOString(), end: occ.end.toISOString() },
        createdBy,
        { seriesId, recurrenceRule: dto.recurrenceRule ?? null },
      ),
    );

    let { data, error } = await supabase
      .from('events')
      .insert(rows)
      .select('*')
      .returns<EventRow[]>();

    if (error) {
      this.logger.warn(`Insert series failed (${error.message}), retrying fallback without series_id/recurrence_rule/calendar_type...`);
      const fallbackRows = rows.map(({ series_id, recurrence_rule, calendar_type, ...rest }) => rest);
      const res = await supabase
        .from('events')
        .insert(fallbackRows)
        .select('*')
        .returns<EventRow[]>();
      if (res.error) throw new InternalServerErrorException(res.error.message);
      data = res.data;
    }

    const eventDtos = (data ?? []).map(toEventDto);
    const byCalendar = new Map<string, EventDto[]>();
    for (const item of eventDtos) {
      const list = byCalendar.get(item.calendarId);
      if (list) list.push(item);
      else byCalendar.set(item.calendarId, [item]);
    }
    for (const [calendarId, events] of byCalendar) {
      this.realtimeGateway.emitToCalendar(calendarId, 'events:bulk-created', {
        calendarId,
        events,
      });
    }
    return eventDtos;
  }

  async update(
    supabase: SupabaseClient,
    id: string,
    dto: UpdateEventDto,
    userId: string,
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
    void this.notifyConflictsSafely(supabase, userId, eventDto);
    return eventDto;
  }

  /**
   * Sửa một lần lặp và lan ra các lần lặp khác trong cùng chuỗi.
   *
   * Không đổi start/end: mọi hàng khớp scope nhận CÙNG một giá trị, xong
   * trong một câu UPDATE. Có đổi start/end: mỗi hàng cần một ngày giờ tuyệt
   * đối khác nhau, nên tính độ lệch (delta) so với hàng đang sửa rồi cộng vào
   * từng hàng — phải update từng hàng một, nhưng số hàng luôn bị chặn bởi
   * RECURRENCE_MAX_OCCURRENCES nên vòng lặp này luôn nhỏ.
   */
  async updateSeries(
    supabase: SupabaseClient,
    id: string,
    dto: UpdateEventDto,
    scope: SeriesEditScope,
    userId: string,
  ): Promise<EventDto[]> {
    const { data: base, error: baseError } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle<EventRow>();
    if (baseError) throw new InternalServerErrorException(baseError.message);
    if (!base) {
      throw new NotFoundException('Event not found or you do not have permission to edit it');
    }
    if (!base.series_id) {
      return [await this.update(supabase, id, dto, userId)];
    }

    let siblingsQuery = supabase
      .from('events')
      .select('*')
      .eq('series_id', base.series_id)
      .is('deleted_at', null);
    if (scope === 'following') {
      siblingsQuery = siblingsQuery.gte('start_at', base.start_at);
    }
    const { data: siblings, error: siblingsError } = await siblingsQuery.returns<EventRow[]>();
    if (siblingsError) throw new InternalServerErrorException(siblingsError.message);

    const updateRow = toEventUpdateRow(dto);
    let updatedRows: EventRow[];

    if (dto.start === undefined && dto.end === undefined) {
      let query = supabase.from('events').update(updateRow).eq('series_id', base.series_id);
      if (scope === 'following') query = query.gte('start_at', base.start_at);
      const { data, error } = await query.select('*').returns<EventRow[]>();
      if (error) throw new InternalServerErrorException(error.message);
      updatedRows = data ?? [];
    } else {
      const startDeltaMs = dto.start
        ? new Date(dto.start).getTime() - new Date(base.start_at).getTime()
        : 0;
      const endDeltaMs = dto.end
        ? new Date(dto.end).getTime() - new Date(base.end_at).getTime()
        : 0;
      const results: EventRow[] = [];
      for (const row of siblings ?? []) {
        const rowUpdate = { ...updateRow };
        if (dto.start) {
          rowUpdate['start_at'] = new Date(new Date(row.start_at).getTime() + startDeltaMs).toISOString();
        }
        if (dto.end) {
          rowUpdate['end_at'] = new Date(new Date(row.end_at).getTime() + endDeltaMs).toISOString();
        }
        const { data, error } = await supabase
          .from('events')
          .update(rowUpdate)
          .eq('id', row.id)
          .select('*')
          .returns<EventRow[]>();
        if (error) throw new InternalServerErrorException(error.message);
        if (data?.[0]) results.push(data[0]);
      }
      updatedRows = results;
    }

    const eventDtos = updatedRows.map(toEventDto);
    const byCalendar = new Map<string, EventDto[]>();
    for (const eventDto of eventDtos) {
      const list = byCalendar.get(eventDto.calendarId);
      if (list) list.push(eventDto);
      else byCalendar.set(eventDto.calendarId, [eventDto]);
    }
    for (const [calendarId, events] of byCalendar) {
      this.realtimeGateway.emitToCalendar(calendarId, 'events:bulk-updated', {
        calendarId,
        events,
      });
    }
    // Chỉ kiểm tra trùng lịch cho ĐÚNG lần lặp người dùng đang mở sửa — kiểm
    // tra cả chuỗi (có thể hàng chục lần lặp) sẽ dội hàng loạt cảnh báo cho
    // một thao tác sửa.
    const editedEventDto = eventDtos.find((e) => e.id === id) ?? eventDtos[0];
    if (editedEventDto) {
      void this.notifyConflictsSafely(supabase, userId, editedEventDto);
    }
    return eventDtos;
  }

  // Xoá "mềm" — chuyển sự kiện vào thùng rác thay vì xoá hẳn, cho phép
  // khôi phục. Xoá hẳn nằm ở permanentDelete().
  async remove(supabase: SupabaseClient, id: string): Promise<void> {
    const { data, error } = await supabase
      .from('events')
      .update({ deleted_at: new Date().toISOString() })
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

  /** Xoá "mềm" một lần lặp và lan ra các lần lặp khác trong cùng chuỗi — luôn
   *  là một thao tác đồng nhất (cùng đánh deleted_at) nên chỉ cần MỘT câu
   *  UPDATE, không cần vòng lặp như updateSeries(). */
  async removeSeries(
    supabase: SupabaseClient,
    id: string,
    scope: SeriesEditScope,
  ): Promise<{ ids: string[]; calendarId: string | null }> {
    const { data: base, error: baseError } = await supabase
      .from('events')
      .select('id, calendar_id, series_id, start_at')
      .eq('id', id)
      .maybeSingle<{ id: string; calendar_id: string; series_id: string | null; start_at: string }>();
    if (baseError) throw new InternalServerErrorException(baseError.message);
    if (!base) {
      throw new NotFoundException('Event not found or you do not have permission to delete it');
    }
    if (!base.series_id) {
      await this.remove(supabase, id);
      return { ids: [id], calendarId: base.calendar_id };
    }

    let query = supabase
      .from('events')
      .update({ deleted_at: new Date().toISOString() })
      .eq('series_id', base.series_id)
      .is('deleted_at', null);
    if (scope === 'following') query = query.gte('start_at', base.start_at);
    const { data, error } = await query
      .select('id, calendar_id')
      .returns<{ id: string; calendar_id: string }[]>();
    if (error) throw new InternalServerErrorException(error.message);

    const ids = (data ?? []).map((r) => r.id);
    const calendarId = data?.[0]?.calendar_id ?? null;
    if (calendarId) {
      this.realtimeGateway.emitToCalendar(calendarId, 'events:bulk-deleted', {
        calendarId,
        ids,
      });
    }
    return { ids, calendarId };
  }

  async listTrash(
    supabase: SupabaseClient,
    calendarId?: string,
  ): Promise<EventDto[]> {
    let query = supabase
      .from('events')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    if (calendarId) {
      query = query.eq('calendar_id', calendarId);
    }

    const { data, error } = await query;
    if (error) throw new InternalServerErrorException(error.message);
    return (data as EventRow[]).map(toEventDto);
  }

  async restore(supabase: SupabaseClient, id: string): Promise<EventDto> {
    const { data, error } = await supabase
      .from('events')
      .update({ deleted_at: null })
      .eq('id', id)
      .select('*')
      .returns<EventRow[]>();

    if (error) throw new InternalServerErrorException(error.message);
    if (data.length === 0) {
      throw new NotFoundException(
        'Event not found or you do not have permission to restore it',
      );
    }
    const eventDto = toEventDto(data[0]);
    this.realtimeGateway.emitToCalendar(
      eventDto.calendarId,
      'event:created',
      eventDto,
    );
    return eventDto;
  }

  async permanentDelete(supabase: SupabaseClient, id: string): Promise<void> {
    const { data, error } = await supabase
      .from('events')
      .delete()
      .eq('id', id)
      .not('deleted_at', 'is', null)
      .select('id')
      .returns<{ id: string }[]>();

    if (error) throw new InternalServerErrorException(error.message);
    if (data.length === 0) {
      throw new NotFoundException(
        'Event not found in trash or you do not have permission to delete it',
      );
    }
  }

  async checkConflicts(
    supabase: SupabaseClient,
    dto: CheckConflictsDto,
  ): Promise<ConflictEventDto[]> {
    let query = supabase
      .from('events')
      .select('*')
      .is('deleted_at', null)
      .lt('start_at', dto.end)
      .gt('end_at', dto.start);
    if (dto.excludeEventId) {
      query = query.neq('id', dto.excludeEventId);
    }

    const { data, error } = await query;
    if (error) throw new InternalServerErrorException(error.message);
    return (data as EventRow[]).map(toConflictEventDto);
  }

  /**
   * Báo cho người vừa lưu sự kiện biết nó đang trùng giờ với sự kiện khác —
   * chỉ CẢNH BÁO qua chuông thông báo trong app, không chặn việc lưu (đã lưu
   * xong rồi mới kiểm tra). Lỗi kiểm tra trùng lịch không được làm hỏng thao
   * tác tạo/sửa sự kiện chính, nên nuốt lỗi ở đây thay vì để nó văng lên.
   */
  private async notifyConflictsSafely(
    supabase: SupabaseClient,
    userId: string,
    eventDto: EventDto,
  ): Promise<void> {
    try {
      const conflicts = await this.checkConflicts(supabase, {
        start: eventDto.start,
        end: eventDto.end,
        excludeEventId: eventDto.id,
      });
      if (conflicts.length === 0) return;
      this.realtimeGateway.emitToUser(userId, 'event:conflict', {
        event: eventDto,
        conflicts,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to check conflicts for event ${eventDto.id}: ${(err as Error).message}`,
      );
    }
  }

  async invite(
    supabase: SupabaseClient,
    eventId: string,
    dto: InviteAttendeeDto,
  ): Promise<AttendeeDto> {
    const { data: eventRow, error: eventError } = await supabase
      .from('events')
      .select('id, calendar_id, title, description, location, meet_link, start_at, end_at, created_by')
      .eq('id', eventId)
      .maybeSingle<
        { id: string; calendar_id: string; created_by: string | null } & InviteEventContext
      >();
    if (eventError) throw new InternalServerErrorException(eventError.message);
    if (!eventRow) throw new NotFoundException('Event not found');

    // Không mời chính người đã tạo sự kiện — họ mặc nhiên đã có mặt, mời thêm
    // chỉ tạo ra một dòng attendee vô nghĩa và một email thừa gửi cho chính họ.
    // Đây chỉ là một lớp bảo vệ PHỤ — lỗi ở bước tra cứu này (mạng, admin API
    // chập chờn...) không được phép làm hỏng cả thao tác mời chính, nên nuốt
    // lỗi và coi như "không phải tự mời" thay vì để nó văng lên 500.
    if (eventRow.created_by) {
      try {
        const admin = this.supabaseService.getServiceRoleClient();
        const { data: creator } = await admin.auth.admin.getUserById(eventRow.created_by);
        if (creator?.user?.email?.toLowerCase() === dto.email.toLowerCase()) {
          throw new ConflictException('Không thể mời chính người tổ chức sự kiện');
        }
      } catch (err) {
        if (err instanceof ConflictException) throw err;
        this.logger.warn(
          `Failed to check event creator email for self-invite guard (event ${eventId}): ${(err as Error).message}`,
        );
      }
    }

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
        description: eventRow.description ?? undefined,
        startAt: eventRow.start_at,
        endAt: eventRow.end_at,
        location: eventRow.location ?? undefined,
        meetLink: eventRow.meet_link ?? undefined,
        acceptUrl: `${baseUrl}/events/${eventId}/respond-via-email?token=${token}&action=accept`,
        declineUrl: `${baseUrl}/events/${eventId}/respond-via-email?token=${token}&action=decline`,
      });
    } catch (err) {
      this.logger.warn(`Failed to send invite email to ${toEmail}: ${(err as Error).message}`);
    }
  }

  /**
   * Người được mời chấp nhận / từ chối tham gia sự kiện.
   *
   * Dùng service-role + tự chốt `event_id` (từ URL) và `user_id` (từ JWT đã
   * xác thực) — người dùng chỉ có thể đổi ĐÚNG hàng attendee của chính mình
   * cho sự kiện đó. Không đi qua RLS client vì `event_attendees` khi cập nhật
   * phải soi policy `event_attendees_write_editor` (subquery `events`), và với
   * người CHƯA là thành viên lịch thì chuỗi policy này đệ quy nếu DB chưa apply
   * migration 23 → lỗi 500 "Không thể xử lý lời mời".
   */
  async respond(
    eventId: string,
    userId: string,
    dto: RespondInviteDto,
  ): Promise<AttendeeDto> {
    const admin = this.supabaseService.getServiceRoleClient();
    const { data, error } = await admin
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

    const { data: eventRow } = await admin
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

  /**
   * Sự kiện mà người gọi đang được mời và CHƯA phản hồi (status = 'pending').
   *
   * Dùng service-role client + tự lọc `user_id = userId` (userId lấy từ JWT đã
   * xác thực ở guard, KHÔNG phải id do client gửi). Lý do không dùng RLS
   * client: người được mời thường CHƯA là thành viên lịch, nên policy
   * `events_select_invited` phải chạy — nếu DB chưa apply migration 23 thì
   * policy đó đệ quy với `event_attendees` và toàn bộ luồng mời/nhận lời mời
   * văng lỗi 500. Đi vòng qua RLS ở đây khiến tính năng chạy độc lập với
   * trạng thái migration.
   *
   * Client gọi lúc mở app + mỗi lần socket kết nối lại để không bỏ lỡ lời mời
   * tới trong lúc offline.
   */
  async listMyInvites(userId: string): Promise<
    {
      attendeeId: string;
      eventId: string;
      title: string;
      start: string;
      end: string;
      calendarId: string;
    }[]
  > {
    const admin = this.supabaseService.getServiceRoleClient();
    const { data, error } = await admin
      .from('event_attendees')
      .select('id, status, event:events!inner(id, title, start_at, end_at, calendar_id)')
      .eq('user_id', userId)
      .eq('status', 'pending');
    if (error) throw new InternalServerErrorException(error.message);

    type Row = {
      id: string;
      event: {
        id: string;
        title: string;
        start_at: string;
        end_at: string;
        calendar_id: string;
      } | null;
    };
    return ((data ?? []) as unknown as Row[])
      .filter((r): r is Row & { event: NonNullable<Row['event']> } => !!r.event)
      .map((r) => ({
        attendeeId: r.id,
        eventId: r.event.id,
        title: r.event.title,
        start: r.event.start_at,
        end: r.event.end_at,
        calendarId: r.event.calendar_id,
      }));
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
