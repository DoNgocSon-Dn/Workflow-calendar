import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient, User } from '@supabase/supabase-js';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateGroupDto } from './dto/create-group.dto';
import { InviteGroupMemberDto } from './dto/invite-group-member.dto';
import { UpdateGroupMemberRoleDto } from './dto/update-group-member-role.dto';
import { CreateGroupTaskDto } from './dto/create-group-task.dto';
import { UpdateGroupTaskDto } from './dto/update-group-task.dto';
import { SendGroupMessageDto } from './dto/send-group-message.dto';

export interface GroupDto {
  id: string;
  name: string;
  description?: string;
  color: string;
  ownerId: string;
  calendarId: string;
  createdAt: string;
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
  message: string;
  createdAt: string;
  senderEmail?: string;
}

@Injectable()
export class GroupsService {
  constructor(private readonly realtimeGateway: RealtimeGateway) {}

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
      .select('group_id')
      .eq('user_id', user.id);

    if (memErr) throw new InternalServerErrorException(memErr.message);

    const groupIds = (memberships || []).map((m) => m.group_id);
    if (groupIds.length === 0) return [];

    const { data: groups, error: groupErr } = await supabase
      .from('groups')
      .select('*')
      .in('id', groupIds)
      .order('created_at', { ascending: false });

    if (groupErr) throw new InternalServerErrorException(groupErr.message);

    return (groups || []).map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      color: g.color,
      ownerId: g.owner_id,
      calendarId: g.calendar_id,
      createdAt: g.created_at,
    }));
  }

  async findOne(supabase: SupabaseClient, groupId: string): Promise<{
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
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        color: group.color,
        ownerId: group.owner_id,
        calendarId: group.calendar_id,
        createdAt: group.created_at,
      },
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
  ): Promise<GroupMemberDto> {
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
    const { data: newMem, error: insertErr } = await supabase
      .from('group_members')
      .insert({
        group_id: groupId,
        user_id: invitedUserId,
        role,
      })
      .select('*')
      .single();

    if (insertErr || !newMem) {
      throw new InternalServerErrorException(
        insertErr?.message || 'Không thể thêm thành viên',
      );
    }

    // Also add to group calendar_members
    if (group.calendar_id) {
      await supabase.from('calendar_members').upsert({
        calendar_id: group.calendar_id,
        user_id: invitedUserId,
        role: role === 'admin' ? 'editor' : 'viewer',
      });
    }

    return {
      id: newMem.id,
      groupId: newMem.group_id,
      userId: newMem.user_id,
      role: newMem.role,
      createdAt: newMem.created_at,
      email: dto.email,
    };
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
      throw new ForbiddenException('Chỉ chủ nhóm mới có quyền phân quyền thành viên');
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
        error?.message || 'Không thể cập nhật quyền thành viên (có thể người này chưa ở trong nhóm)',
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

    this.realtimeGateway.emitToCalendar(group.calendar_id, 'group:memberRoleChanged', {
      groupId,
      member: memberDto,
    });

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
      throw new InternalServerErrorException(error?.message || 'Không thể tạo task');
    }

    return {
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

    return {
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

    return (data || []).map((m) => ({
      id: m.id,
      groupId: m.group_id,
      senderId: m.sender_id,
      message: m.message,
      createdAt: m.created_at,
      senderEmail: m.sender_email,
    }));
  }

  async sendMessage(
    supabase: SupabaseClient,
    user: User,
    groupId: string,
    dto: SendGroupMessageDto,
  ): Promise<GroupMessageDto> {
    const { data, error } = await supabase
      .from('group_messages')
      .insert({
        group_id: groupId,
        sender_id: user.id,
        message: dto.message,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message || 'Không thể gửi tin nhắn',
      );
    }

    const msgDto: GroupMessageDto = {
      id: data.id,
      groupId: data.group_id,
      senderId: data.sender_id,
      message: data.message,
      createdAt: data.created_at,
      senderEmail: user.email,
    };

    // Emit to both groupId and group.calendar_id
    this.realtimeGateway.emitToCalendar(groupId, 'group:messageSent', {
      groupId,
      message: msgDto,
    });

    const { data: group } = await supabase
      .from('groups')
      .select('calendar_id')
      .eq('id', groupId)
      .maybeSingle<{ calendar_id: string | null }>();

    if (group?.calendar_id) {
      this.realtimeGateway.emitToCalendar(group.calendar_id, 'group:messageSent', {
        groupId,
        message: msgDto,
      });
    }

    return msgDto;
  }
}
