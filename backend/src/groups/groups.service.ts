import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient, User } from '@supabase/supabase-js';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { SetGroupHiddenDto } from './dto/set-group-hidden.dto';
import { InviteGroupMemberDto } from './dto/invite-group-member.dto';
import { UpdateGroupMemberRoleDto } from './dto/update-group-member-role.dto';
import { CreateGroupTaskDto } from './dto/create-group-task.dto';
import { UpdateGroupTaskDto } from './dto/update-group-task.dto';
import { SendGroupMessageDto } from './dto/send-group-message.dto';
import { UpdateGroupMessageDto } from './dto/update-group-message.dto';
import { RespondGroupInviteDto } from './dto/respond-group-invite.dto';

export interface GroupInviteDto {
  id: string;
  groupId: string;
  groupName: string;
  groupColor: string;
  role: string;
  status: string;
  createdAt: string;
  inviterEmail: string | null;
}

/** Hàng thô từ RPC list_my_group_invites / respond_group_invite. */
export interface GroupInviteRow {
  id: string;
  group_id: string;
  group_name: string;
  group_color: string;
  role: string;
  status: string;
  created_at: string;
  inviter_email: string | null;
}

function toGroupInviteDto(row: GroupInviteRow): GroupInviteDto {
  return {
    id: row.id,
    groupId: row.group_id,
    groupName: row.group_name,
    groupColor: row.group_color,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    inviterEmail: row.inviter_email,
  };
}

export interface GroupDto {
  id: string;
  name: string;
  description?: string;
  color: string;
  ownerId: string;
  calendarId: string;
  createdAt: string;
  /** Ẩn/hiện là trạng thái riêng của người đang gọi, không phải của cả nhóm. */
  hidden?: boolean;
}

export interface GroupMemberDto {
  id: string;
  groupId: string;
  userId: string;
  role: string;
  createdAt: string;
  email?: string;
}

export interface GroupTaskDto {
  id: string;
  groupId: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done';
  assignedTo?: string;
  dueDate?: string;
  createdBy?: string;
  createdAt: string;
}

export interface GroupMessageDto {
  id: string;
  groupId: string;
  senderId: string;
  message: string | null;
  createdAt: string;
  editedAt?: string;
  deletedAt?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: number;
  senderEmail?: string;
}

@Injectable()
export class GroupsService {
  constructor(private readonly realtimeGateway: RealtimeGateway) {}

  // Phát realtime cho cả room theo groupId lẫn room theo lịch nhóm
  // (group_workspace_modal join cả 2, còn view lịch chỉ join theo calendar).
  private async emitToGroupRooms(
    supabase: SupabaseClient,
    groupId: string,
    event: string,
    payload: unknown,
  ): Promise<void> {
    this.realtimeGateway.emitToCalendar(groupId, event, payload);

    const { data: group } = await supabase
      .from('groups')
      .select('calendar_id')
      .eq('id', groupId)
      .maybeSingle<{ calendar_id: string | null }>();

    if (group?.calendar_id) {
      this.realtimeGateway.emitToCalendar(group.calendar_id, event, payload);
    }
  }

  // Các room "calendar:" chỉ có người đang MỞ nhóm, nên không dùng được cho
  // những thay đổi phải tới cả người chỉ đang nhìn sidebar (đổi tên, xoá nhóm,
  // gỡ ẩn). Những sự kiện đó bắn thẳng vào room riêng của từng thành viên.
  private async emitToGroupMembers(
    supabase: SupabaseClient,
    groupId: string,
    event: string,
    payload: unknown,
    userIds?: string[],
  ): Promise<void> {
    const targets =
      userIds ?? (await this.listMemberUserIds(supabase, groupId));
    for (const userId of targets) {
      this.realtimeGateway.emitToUser(userId, event, payload);
    }
  }

  private async listMemberUserIds(
    supabase: SupabaseClient,
    groupId: string,
  ): Promise<string[]> {
    const { data } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId);

    return (data || []).map((m: { user_id: string }) => m.user_id);
  }

  private mapGroupRow(row: any, hidden?: boolean): GroupDto {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      color: row.color,
      ownerId: row.owner_id,
      calendarId: row.calendar_id,
      createdAt: row.created_at,
      hidden,
    };
  }

  private async assertOwner(
    supabase: SupabaseClient,
    user: User,
    groupId: string,
  ): Promise<{ owner_id: string; calendar_id: string | null }> {
    const { data: group, error } = await supabase
      .from('groups')
      .select('owner_id, calendar_id')
      .eq('id', groupId)
      .maybeSingle<{ owner_id: string; calendar_id: string | null }>();

    if (error || !group) throw new NotFoundException('Không tìm thấy nhóm');
    if (group.owner_id !== user.id) {
      throw new ForbiddenException(
        'Chỉ người tạo nhóm mới có quyền thực hiện thao tác này',
      );
    }
    return group;
  }

  private mapMessageRow(row: any): GroupMessageDto {
    return {
      id: row.id,
      groupId: row.group_id,
      senderId: row.sender_id,
      message: row.message,
      createdAt: row.created_at,
      editedAt: row.edited_at ?? undefined,
      deletedAt: row.deleted_at ?? undefined,
      attachmentUrl: row.attachment_url ?? undefined,
      attachmentName: row.attachment_name ?? undefined,
      attachmentType: row.attachment_type ?? undefined,
      attachmentSize: row.attachment_size ?? undefined,
      senderEmail: row.sender_email,
    };
  }

  private mapMessageRpcError(
    error: { message?: string } | null | undefined,
  ): Error {
    const msg = error?.message || '';
    if (msg.includes('not authorized')) {
      return new ForbiddenException(
        'Bạn không có quyền thực hiện thao tác này',
      );
    }
    if (msg.includes('not found')) {
      return new NotFoundException('Không tìm thấy tin nhắn');
    }
    if (msg.includes('already deleted')) {
      return new ConflictException('Tin nhắn đã bị xoá');
    }
    if (msg.includes('must not be empty')) {
      return new BadRequestException('Nội dung tin nhắn không được để trống');
    }
    return new InternalServerErrorException(msg || 'Không thể xử lý tin nhắn');
  }

  async createGroup(
    supabase: SupabaseClient,
    user: User,
    dto: CreateGroupDto,
  ): Promise<GroupDto> {
    const color = dto.color ?? 'blue';
    const calendarId = crypto.randomUUID();
    const groupId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    // 1. Create a dedicated group calendar
    const { error: calError } = await supabase.from('calendars').insert({
      id: calendarId,
      owner_id: user.id,
      name: `${dto.name} (Lịch nhóm)`,
      color,
    });

    if (calError) {
      throw new InternalServerErrorException(
        calError.message || 'Không thể tạo lịch nhóm',
      );
    }

    // Add owner to calendar_members
    await supabase.from('calendar_members').insert({
      calendar_id: calendarId,
      user_id: user.id,
      role: 'owner',
    });

    // 2. Insert into groups table
    const { error: groupError } = await supabase.from('groups').insert({
      id: groupId,
      name: dto.name,
      description: dto.description || null,
      color,
      owner_id: user.id,
      calendar_id: calendarId,
    });

    if (groupError) {
      throw new InternalServerErrorException(
        groupError.message || 'Không thể tạo nhóm mới',
      );
    }

    // 3. Insert owner into group_members
    await supabase.from('group_members').insert({
      group_id: groupId,
      user_id: user.id,
      role: 'owner',
    });

    return {
      id: groupId,
      name: dto.name,
      description: dto.description || undefined,
      color,
      ownerId: user.id,
      calendarId,
      createdAt,
    };
  }

  async findAllForUser(
    supabase: SupabaseClient,
    user: User,
  ): Promise<GroupDto[]> {
    // Find group IDs where user is member
    const { data: memberships, error: memErr } = await supabase
      .from('group_members')
      .select('group_id, hidden_at')
      .eq('user_id', user.id);

    if (memErr) throw new InternalServerErrorException(memErr.message);

    const groupIds = (memberships || []).map((m) => m.group_id);
    if (groupIds.length === 0) return [];

    const hiddenGroupIds = new Set(
      (memberships || []).filter((m) => m.hidden_at).map((m) => m.group_id),
    );

    const { data: groups, error: groupErr } = await supabase
      .from('groups')
      .select('*')
      .in('id', groupIds)
      .order('created_at', { ascending: false });

    if (groupErr) throw new InternalServerErrorException(groupErr.message);

    // Nhóm đã ẩn vẫn trả về — client cần chúng để dựng mục "Nhóm đã ẩn", và để
    // gỡ ẩn tại chỗ khi có tin nhắn mới mà không phải gọi lại API.
    return (groups || []).map((g) =>
      this.mapGroupRow(g, hiddenGroupIds.has(g.id)),
    );
  }

  async updateGroup(
    supabase: SupabaseClient,
    user: User,
    groupId: string,
    dto: UpdateGroupDto,
  ): Promise<GroupDto> {
    const existing = await this.assertOwner(supabase, user, groupId);

    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData.name = dto.name.trim();
    if (dto.description !== undefined)
      updateData.description = dto.description.trim() || null;
    if (dto.color !== undefined) updateData.color = dto.color;

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('Không có thông tin nào để cập nhật');
    }

    const { data, error } = await supabase
      .from('groups')
      .update(updateData)
      .eq('id', groupId)
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message || 'Không thể cập nhật nhóm',
      );
    }

    // Lịch nhóm được đặt tên theo nhóm lúc tạo, nên đổi tên/màu nhóm phải kéo
    // theo lịch — nếu không, sidebar sẽ hiện tên nhóm mới cạnh lịch tên cũ.
    if (
      existing.calendar_id &&
      (dto.name !== undefined || dto.color !== undefined)
    ) {
      const calendarUpdate: Record<string, unknown> = {};
      if (dto.name !== undefined)
        calendarUpdate.name = `${data.name} (Lịch nhóm)`;
      if (dto.color !== undefined) calendarUpdate.color = dto.color;
      await supabase
        .from('calendars')
        .update(calendarUpdate)
        .eq('id', existing.calendar_id);
    }

    const groupDto = this.mapGroupRow(data);
    await this.emitToGroupMembers(supabase, groupId, 'group:updated', {
      group: groupDto,
    });

    return groupDto;
  }

  async deleteGroup(
    supabase: SupabaseClient,
    user: User,
    groupId: string,
  ): Promise<void> {
    const group = await this.assertOwner(supabase, user, groupId);

    // Lấy danh sách thành viên TRƯỚC khi xoá — group_members cascade theo nhóm
    // nên sau lệnh delete thì không còn ai để bắn realtime tới.
    const memberIds = await this.listMemberUserIds(supabase, groupId);

    const { error } = await supabase.from('groups').delete().eq('id', groupId);
    if (error) {
      throw new InternalServerErrorException(
        error.message || 'Không thể xóa nhóm',
      );
    }

    // group_tasks/group_messages/group_members đi theo cascade của groups; lịch
    // nhóm thì không (calendar_id là "on delete set null") nên phải xoá tay,
    // kéo theo events + calendar_members của lịch đó qua cascade của calendars.
    if (group.calendar_id) {
      await supabase.from('calendars').delete().eq('id', group.calendar_id);
    }

    await this.emitToGroupMembers(
      supabase,
      groupId,
      'group:deleted',
      { groupId, calendarId: group.calendar_id },
      memberIds,
    );
  }

  async setHidden(
    supabase: SupabaseClient,
    groupId: string,
    dto: SetGroupHiddenDto,
  ): Promise<{ groupId: string; hidden: boolean }> {
    const { error } = await supabase.rpc('set_group_hidden', {
      p_group_id: groupId,
      p_hidden: dto.hidden,
    });

    if (error) {
      const msg = error.message || '';
      if (msg.includes('not authorized')) {
        throw new ForbiddenException('Bạn không phải thành viên của nhóm này');
      }
      if (msg.includes('not found')) {
        throw new NotFoundException('Không tìm thấy nhóm');
      }
      throw new InternalServerErrorException(
        msg || 'Không thể cập nhật trạng thái hiển thị nhóm',
      );
    }

    return { groupId, hidden: dto.hidden };
  }

  async findOne(
    supabase: SupabaseClient,
    groupId: string,
  ): Promise<{
    group: GroupDto;
    members: GroupMemberDto[];
  }> {
    const { data: group, error: groupErr } = await supabase
      .from('groups')
      .select('*')
      .eq('id', groupId)
      .single();

    if (groupErr || !group) throw new NotFoundException('Không tìm thấy nhóm');

    const { data: members, error: memErr } = await supabase.rpc(
      'list_group_members',
      { p_group_id: groupId },
    );

    if (memErr) throw new InternalServerErrorException(memErr.message);

    return {
      group: this.mapGroupRow(group),
      members: (members || []).map((m) => ({
        id: m.id,
        groupId: m.group_id,
        userId: m.user_id,
        role: m.role,
        createdAt: m.created_at,
        email: m.email,
      })),
    };
  }

  async inviteMember(
    supabase: SupabaseClient,
    inviter: User,
    groupId: string,
    dto: InviteGroupMemberDto,
  ): Promise<GroupInviteDto> {
    const { data: invitedUserId, error: lookupError } = await supabase.rpc(
      'find_user_id_by_email',
      { p_email: dto.email },
    );

    if (lookupError || !invitedUserId) {
      throw new NotFoundException('Không tìm thấy người dùng với email này');
    }

    const { data: group } = await supabase
      .from('groups')
      .select('calendar_id')
      .eq('id', groupId)
      .single();

    if (!group) throw new NotFoundException('Không tìm thấy nhóm');

    // Check existing
    const { data: existing } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', invitedUserId)
      .maybeSingle();

    if (existing) {
      throw new ConflictException('Người này đã là thành viên trong nhóm');
    }

    const role = dto.role || 'member';

    // Tạo LỜI MỜI ở trạng thái pending thay vì thêm thẳng vào nhóm — người được
    // mời tự quyết định Chấp nhận / Từ chối (giống luồng calendar_invites).
    const { data: inviteRow, error: inviteErr } = await supabase
      .from('group_invites')
      .upsert(
        {
          group_id: groupId,
          invited_user_id: invitedUserId,
          invited_by: inviter.id,
          role,
          status: 'pending',
        },
        { onConflict: 'group_id,invited_user_id' },
      )
      .select('id, role, status, created_at')
      .single<{
        id: string;
        role: string;
        status: string;
        created_at: string;
      }>();

    if (inviteErr || !inviteRow) {
      throw new InternalServerErrorException(
        inviteErr?.message || 'Không thể tạo lời mời',
      );
    }

    const { data: groupRow } = await supabase
      .from('groups')
      .select('name, color')
      .eq('id', groupId)
      .maybeSingle<{ name: string; color: string }>();

    const invite: GroupInviteDto = {
      id: inviteRow.id,
      groupId,
      groupName: groupRow?.name ?? 'Nhóm',
      groupColor: groupRow?.color ?? 'blue',
      role: inviteRow.role,
      status: inviteRow.status,
      createdAt: inviteRow.created_at,
      inviterEmail: inviter.email ?? null,
    };

    // Bắn thẳng vào room riêng của người được mời: họ chưa phải thành viên nên
    // không có mặt trong bất kỳ room nhóm nào.
    this.realtimeGateway.emitToUser(invitedUserId as string, 'group:invited', {
      invite,
    });

    return invite;
  }

  /** Task được giao cho người gọi trên MỌI nhóm — Notification Center dùng để
   *  theo dõi deadline mà không phải mở từng nhóm một. */
  async listMyTasks(supabase: SupabaseClient): Promise<GroupTaskDto[]> {
    const { data, error } = await supabase.rpc('list_my_group_tasks');
    if (error) throw new InternalServerErrorException(error.message);

    return (
      data as {
        id: string;
        group_id: string;
        title: string;
        description: string | null;
        status: GroupTaskDto['status'];
        assigned_to: string | null;
        due_date: string | null;
        created_by: string | null;
        created_at: string;
      }[]
    ).map((row) => ({
      id: row.id,
      groupId: row.group_id,
      title: row.title,
      description: row.description ?? undefined,
      status: row.status,
      assignedTo: row.assigned_to ?? undefined,
      dueDate: row.due_date ?? undefined,
      createdBy: row.created_by ?? undefined,
      createdAt: row.created_at,
    }));
  }

  async listMyInvites(supabase: SupabaseClient): Promise<GroupInviteDto[]> {
    const { data, error } = await supabase.rpc('list_my_group_invites');
    if (error) throw new InternalServerErrorException(error.message);
    return (data as GroupInviteRow[]).map(toGroupInviteDto);
  }

  async respondInvite(
    supabase: SupabaseClient,
    userId: string,
    inviteId: string,
    dto: RespondGroupInviteDto,
  ): Promise<GroupInviteDto> {
    const { data, error } = await supabase
      .rpc('respond_group_invite', {
        p_invite_id: inviteId,
        p_status: dto.status,
      })
      .single<Omit<GroupInviteRow, 'inviter_email'>>();

    if (error) {
      if (error.message.includes('invite not found')) {
        throw new NotFoundException('Lời mời không tồn tại');
      }
      if (error.message.includes('already handled')) {
        throw new ConflictException('Lời mời này đã được xử lý');
      }
      throw new InternalServerErrorException(error.message);
    }

    const invite = toGroupInviteDto({ ...data, inviter_email: null });

    // Báo cho cả nhóm biết kết quả, để danh sách thành viên của họ tự cập nhật.
    await this.emitToGroupMembers(
      supabase,
      invite.groupId,
      dto.status === 'accepted'
        ? 'group:invitationAccepted'
        : 'group:invitationDeclined',
      { inviteId: invite.id, groupId: invite.groupId, userId, role: invite.role },
    );

    return invite;
  }

  async updateMemberRole(
    supabase: SupabaseClient,
    requester: User,
    groupId: string,
    targetUserId: string,
    dto: UpdateGroupMemberRoleDto,
  ): Promise<GroupMemberDto> {
    const { data: group, error: groupErr } = await supabase
      .from('groups')
      .select('owner_id, calendar_id')
      .eq('id', groupId)
      .single();

    if (groupErr || !group) throw new NotFoundException('Không tìm thấy nhóm');
    if (group.owner_id !== requester.id) {
      throw new ForbiddenException(
        'Chỉ chủ nhóm mới có quyền phân quyền thành viên',
      );
    }
    if (targetUserId === group.owner_id) {
      throw new ConflictException('Không thể đổi quyền của chủ nhóm');
    }

    const { data: updated, error } = await supabase
      .from('group_members')
      .update({ role: dto.role })
      .eq('group_id', groupId)
      .eq('user_id', targetUserId)
      .select('*')
      .single();

    if (error || !updated) {
      throw new InternalServerErrorException(
        error?.message ||
          'Không thể cập nhật quyền thành viên (có thể người này chưa ở trong nhóm)',
      );
    }

    if (group.calendar_id) {
      await supabase
        .from('calendar_members')
        .update({ role: dto.role === 'admin' ? 'editor' : 'viewer' })
        .eq('calendar_id', group.calendar_id)
        .eq('user_id', targetUserId);
    }

    const memberDto: GroupMemberDto = {
      id: updated.id,
      groupId: updated.group_id,
      userId: updated.user_id,
      role: updated.role,
      createdAt: updated.created_at,
    };

    this.realtimeGateway.emitToCalendar(
      group.calendar_id,
      'group:memberRoleChanged',
      {
        groupId,
        member: memberDto,
      },
    );

    return memberDto;
  }

  async removeMember(
    supabase: SupabaseClient,
    groupId: string,
    userId: string,
  ): Promise<void> {
    const { data: group } = await supabase
      .from('groups')
      .select('calendar_id')
      .eq('id', groupId)
      .single();

    await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);

    if (group?.calendar_id) {
      await supabase
        .from('calendar_members')
        .delete()
        .eq('calendar_id', group.calendar_id)
        .eq('user_id', userId);
    }
  }

  // Task Management
  async getTasks(
    supabase: SupabaseClient,
    groupId: string,
  ): Promise<GroupTaskDto[]> {
    const { data, error } = await supabase
      .from('group_tasks')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });

    if (error) throw new InternalServerErrorException(error.message);

    return (data || []).map((t) => ({
      id: t.id,
      groupId: t.group_id,
      title: t.title,
      description: t.description,
      status: t.status,
      assignedTo: t.assigned_to,
      dueDate: t.due_date,
      createdBy: t.created_by,
      createdAt: t.created_at,
    }));
  }

  async createTask(
    supabase: SupabaseClient,
    user: User,
    groupId: string,
    dto: CreateGroupTaskDto,
  ): Promise<GroupTaskDto> {
    const { data, error } = await supabase
      .from('group_tasks')
      .insert({
        group_id: groupId,
        title: dto.title,
        description: dto.description || null,
        status: dto.status || 'todo',
        assigned_to: dto.assignedTo || null,
        due_date: dto.dueDate || null,
        created_by: user.id,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message || 'Không thể tạo task',
      );
    }

    const taskDto: GroupTaskDto = {
      id: data.id,
      groupId: data.group_id,
      title: data.title,
      description: data.description,
      status: data.status,
      assignedTo: data.assigned_to,
      dueDate: data.due_date,
      createdBy: data.created_by,
      createdAt: data.created_at,
    };

    await this.emitToGroupRooms(supabase, groupId, 'group:taskCreated', {
      groupId,
      task: taskDto,
    });

    return taskDto;
  }

  async updateTask(
    supabase: SupabaseClient,
    groupId: string,
    taskId: string,
    dto: UpdateGroupTaskDto,
  ): Promise<GroupTaskDto> {
    const updateData: any = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.assignedTo !== undefined) updateData.assigned_to = dto.assignedTo;
    if (dto.dueDate !== undefined) updateData.due_date = dto.dueDate;

    const { data, error } = await supabase
      .from('group_tasks')
      .update(updateData)
      .eq('id', taskId)
      .eq('group_id', groupId)
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message || 'Không thể cập nhật task',
      );
    }

    const taskDto: GroupTaskDto = {
      id: data.id,
      groupId: data.group_id,
      title: data.title,
      description: data.description,
      status: data.status,
      assignedTo: data.assigned_to,
      dueDate: data.due_date,
      createdBy: data.created_by,
      createdAt: data.created_at,
    };

    await this.emitToGroupRooms(supabase, groupId, 'group:taskUpdated', {
      groupId,
      task: taskDto,
    });

    return taskDto;
  }

  // Realtime Group Messages
  async getMessages(
    supabase: SupabaseClient,
    groupId: string,
  ): Promise<GroupMessageDto[]> {
    const { data, error } = await supabase.rpc('list_group_messages', {
      p_group_id: groupId,
    });

    if (error) throw new InternalServerErrorException(error.message);

    return (data || []).map((m) => this.mapMessageRow(m));
  }

  async sendMessage(
    supabase: SupabaseClient,
    user: User,
    groupId: string,
    dto: SendGroupMessageDto,
  ): Promise<GroupMessageDto> {
    const text = dto.message?.trim();
    if (!text && !dto.attachmentUrl) {
      throw new BadRequestException('Tin nhắn không được để trống');
    }

    // Phải đọc trước khi insert: trigger group_messages_unhide xoá sạch hidden_at
    // ngay khi tin nhắn được ghi, nên sau đó không còn biết ai vừa được gỡ ẩn.
    const { data: hiddenRows } = await supabase.rpc(
      'list_group_hidden_members',
      {
        p_group_id: groupId,
      },
    );
    const unhiddenUserIds = ((hiddenRows || []) as { user_id: string }[]).map(
      (r) => r.user_id,
    );

    const { data, error } = await supabase
      .from('group_messages')
      .insert({
        group_id: groupId,
        sender_id: user.id,
        message: text || null,
        attachment_url: dto.attachmentUrl || null,
        attachment_name: dto.attachmentName || null,
        attachment_type: dto.attachmentType || null,
        attachment_size: dto.attachmentSize ?? null,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message || 'Không thể gửi tin nhắn',
      );
    }

    const msgDto: GroupMessageDto = {
      ...this.mapMessageRow(data),
      senderEmail: user.email,
    };

    await this.emitToGroupRooms(supabase, groupId, 'group:messageSent', {
      groupId,
      message: msgDto,
    });

    // Người đang ẩn nhóm không ở trong room "calendar:" (họ chưa mở nhóm), nên
    // sự kiện gỡ ẩn phải đi thẳng vào room riêng của họ.
    if (unhiddenUserIds.length > 0) {
      await this.emitToGroupMembers(
        supabase,
        groupId,
        'group:unhidden',
        { groupId },
        unhiddenUserIds,
      );
    }

    return msgDto;
  }

  async editMessage(
    supabase: SupabaseClient,
    groupId: string,
    messageId: string,
    dto: UpdateGroupMessageDto,
  ): Promise<GroupMessageDto> {
    const { data, error } = await supabase.rpc('edit_group_message', {
      p_message_id: messageId,
      p_message: dto.message,
    });

    const row = data?.[0];
    if (error || !row) {
      throw this.mapMessageRpcError(error);
    }

    const msgDto = this.mapMessageRow(row);
    await this.emitToGroupRooms(supabase, groupId, 'group:messageUpdated', {
      groupId,
      message: msgDto,
    });

    return msgDto;
  }

  async deleteMessage(
    supabase: SupabaseClient,
    groupId: string,
    messageId: string,
  ): Promise<GroupMessageDto> {
    const { data, error } = await supabase.rpc('delete_group_message', {
      p_message_id: messageId,
    });

    const row = data?.[0];
    if (error || !row) {
      throw this.mapMessageRpcError(error);
    }

    const msgDto = this.mapMessageRow(row);
    await this.emitToGroupRooms(supabase, groupId, 'group:messageDeleted', {
      groupId,
      message: msgDto,
    });

    return msgDto;
  }
}
