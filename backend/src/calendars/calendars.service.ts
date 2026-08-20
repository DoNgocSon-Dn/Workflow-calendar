import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient, User } from '@supabase/supabase-js';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateCalendarDto } from './dto/create-calendar.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { RespondCalendarInviteDto } from './dto/respond-calendar-invite.dto';
import { UpdateCalendarDto } from './dto/update-calendar.dto';
import {
  CalendarDto,
  CalendarInviteDto,
  CalendarInviteRow,
  CalendarRow,
  toCalendarDto,
  toCalendarInviteDto,
} from './calendar.mapper';

export interface CalendarMemberDto {
  userId: string;
  role: string;
}

@Injectable()
export class CalendarsService {
  constructor(private readonly realtimeGateway: RealtimeGateway) {}

  async findAllForUser(supabase: SupabaseClient): Promise<CalendarDto[]> {
    const { data, error } = await supabase
      .from('calendars')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw new InternalServerErrorException(error.message);
    return (data as CalendarRow[]).map(toCalendarDto);
  }

  async create(
    supabase: SupabaseClient,
    dto: CreateCalendarDto,
  ): Promise<CalendarDto> {
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id;

    // Try RPC first
    const { data, error } = await supabase
      .rpc('create_calendar_with_owner', {
        p_name: dto.name,
        p_color: dto.color,
      })
      .single();

    if (!error && data) {
      return toCalendarDto(data as CalendarRow);
    }

    // Fallback: direct insert if RPC function is missing or throws error
    if (!userId) {
      throw new InternalServerErrorException(
        error?.message || 'Không thể lấy thông tin người dùng',
      );
    }

    const calendarId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const { error: insertErr } = await supabase.from('calendars').insert({
      id: calendarId,
      owner_id: userId,
      name: dto.name,
      color: dto.color,
    });

    if (insertErr) {
      throw new InternalServerErrorException(
        insertErr.message || error?.message || 'Không thể tạo lịch mới',
      );
    }

    await supabase.from('calendar_members').insert({
      calendar_id: calendarId,
      user_id: userId,
      role: 'owner',
    });

    return toCalendarDto({
      id: calendarId,
      owner_id: userId,
      name: dto.name,
      color: dto.color,
      created_at: createdAt,
    } as any);
  }

  async update(
    supabase: SupabaseClient,
    id: string,
    dto: UpdateCalendarDto,
  ): Promise<CalendarDto> {
    const { data, error } = await supabase
      .from('calendars')
      .update(dto)
      .eq('id', id)
      .select('*');

    if (error) throw new InternalServerErrorException(error.message);
    const rows = data as CalendarRow[];
    if (rows.length === 0) {
      throw new NotFoundException(
        'Calendar not found or you do not have permission to edit it',
      );
    }
    return toCalendarDto(rows[0]);
  }

  async remove(supabase: SupabaseClient, id: string): Promise<void> {
    const { data, error } = await supabase
      .from('calendars')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) throw new InternalServerErrorException(error.message);
    if ((data as { id: string }[]).length === 0) {
      throw new NotFoundException(
        'Calendar not found or you do not have permission to delete it',
      );
    }
  }

  async listMembers(
    supabase: SupabaseClient,
    calendarId: string,
  ): Promise<CalendarMemberDto[]> {
    const { data, error } = await supabase
      .from('calendar_members')
      .select('user_id, role')
      .eq('calendar_id', calendarId);

    if (error) throw new InternalServerErrorException(error.message);
    return (data as { user_id: string; role: string }[]).map((row) => ({
      userId: row.user_id,
      role: row.role,
    }));
  }

  async invite(
    supabase: SupabaseClient,
    calendarId: string,
    inviter: User,
    dto: InviteMemberDto,
  ): Promise<CalendarInviteDto> {
    const { data: invitedUserId, error: lookupError } = await supabase.rpc(
      'find_user_id_by_email',
      { p_email: dto.email },
    );
    if (lookupError) throw new InternalServerErrorException(lookupError.message);
    if (!invitedUserId) {
      throw new NotFoundException('Không tìm thấy người dùng với email này');
    }
    if (invitedUserId === inviter.id) {
      throw new ConflictException('Không thể tự mời chính mình');
    }

    const { data: calendarRow, error: calendarError } = await supabase
      .from('calendars')
      .select('name, color')
      .eq('id', calendarId)
      .maybeSingle<{ name: string; color: string }>();
    if (calendarError) throw new InternalServerErrorException(calendarError.message);
    if (!calendarRow) throw new NotFoundException('Calendar not found');

    const { data: existingMember } = await supabase
      .from('calendar_members')
      .select('user_id')
      .eq('calendar_id', calendarId)
      .eq('user_id', invitedUserId)
      .maybeSingle();
    if (existingMember) {
      throw new ConflictException('Người này đã là thành viên của lịch này');
    }

    const { data, error } = await supabase
      .from('calendar_invites')
      .insert({
        calendar_id: calendarId,
        invited_user_id: invitedUserId,
        invited_by: inviter.id,
        role: dto.role ?? 'viewer',
      })
      .select('id, role, status, created_at')
      .single<{ id: string; role: string; status: string; created_at: string }>();

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException('Người này đã được mời rồi');
      }
      throw new InternalServerErrorException(error.message);
    }

    const invite = toCalendarInviteDto({
      id: data.id,
      calendar_id: calendarId,
      calendar_name: calendarRow.name,
      calendar_color: calendarRow.color,
      role: data.role,
      status: data.status,
      created_at: data.created_at,
      inviter_email: inviter.email ?? null,
    });

    this.realtimeGateway.emitToUser(invitedUserId as string, 'calendar:invited', { invite });
    return invite;
  }

  async listMyInvites(supabase: SupabaseClient): Promise<CalendarInviteDto[]> {
    const { data, error } = await supabase.rpc('list_my_calendar_invites');
    if (error) throw new InternalServerErrorException(error.message);
    return (data as CalendarInviteRow[]).map(toCalendarInviteDto);
  }

  async respondInvite(
    supabase: SupabaseClient,
    userId: string,
    inviteId: string,
    dto: RespondCalendarInviteDto,
  ): Promise<CalendarInviteDto> {
    const { data, error } = await supabase
      .rpc('respond_calendar_invite', {
        p_invite_id: inviteId,
        p_status: dto.status,
      })
      .single<Omit<CalendarInviteRow, 'inviter_email'>>();

    if (error) {
      if (error.message.includes('invite not found')) {
        throw new NotFoundException('Lời mời không tồn tại');
      }
      throw new InternalServerErrorException(error.message);
    }

    const invite = toCalendarInviteDto({ ...data, inviter_email: null });

    if (dto.status === 'accepted') {
      this.realtimeGateway.emitToCalendar(invite.calendarId, 'calendar:memberJoined', {
        calendarId: invite.calendarId,
        member: { userId, role: invite.role },
      });
    }

    return invite;
  }
}
