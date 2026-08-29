import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient, User } from '@supabase/supabase-js';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { SetGroupHiddenDto } from './dto/set-group-hidden.dto';
import { InviteGroupMemberDto } from './dto/invite-group-member.dto';
import { UpdateGroupMemberRoleDto } from './dto/update-group-member-role.dto';
import { CreateGroupTaskDto } from './dto/create-group-task.dto';
import { UpdateGroupTaskDto } from './dto/update-group-task.dto';
import { UpsertGroupMeetingDto } from './dto/upsert-group-meeting.dto';
import {
  MessageMentionDto,
  SendGroupMessageDto,
} from './dto/send-group-message.dto';
import { UpdateGroupMessageDto } from './dto/update-group-message.dto';
import { RespondGroupInviteDto } from './dto/respond-group-invite.dto';
import { DecideJoinRequestDto } from './dto/decide-join-request.dto';
import {
  DEFAULT_GROUP_ROLE,
  GroupRole,
  canAssignRole,
  canChat,
  canInvite,
  canManage,
  normalizeGroupRole,
  toDbGroupRole,
} from './group-role';

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

/** Lời mời nhìn từ phía NGƯỜI MỜI (danh sách "đang chờ" trong workspace). */
export interface GroupPendingInviteDto {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
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

export interface GroupInviteLinkDto {
  token: string;
  groupId: string;
  role: string;
  createdBy: string | null;
  createdAt: string;
}

export interface GroupJoinRequestDto {
  id: string;
  groupId: string;
  userId: string;
  role: string;
  status: 'pending' | 'approved' | 'declined';
  createdAt: string;
  requesterEmail?: string;
  requesterName?: string;
}

export interface GroupInviteLinkPreviewDto {
  groupId: string;
  groupName: string;
  groupDescription?: string;
  groupColor: string;
  role: string;
  isMember: boolean;
  myPendingRequestId: string | null;
}

/** Hàng thô từ RPC list_group_join_requests. */
interface GroupJoinRequestRow {
  id: string;
  group_id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
  requester_email: string | null;
  requester_name: string | null;
}

function toGroupJoinRequestDto(row: GroupJoinRequestRow): GroupJoinRequestDto {
  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    role: normalizeGroupRole(row.role),
    status: row.status as GroupJoinRequestDto['status'],
    createdAt: row.created_at,
    requesterEmail: row.requester_email ?? undefined,
    requesterName: row.requester_name ?? undefined,
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
  /** Chỉ có khi migration 41 đã chạy. */
  joinCode?: string;
  requiresApproval?: boolean;
}

export interface GroupMemberDto {
  id: string;
  groupId: string;
  userId: string;
  role: string;
  createdAt: string;
  email?: string;
  name?: string;
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

export interface GroupMeetingDto {
  groupId: string;
  link: string;
  title?: string;
  startsAt?: string;
  durationMin?: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

/** Mention đã được backend xác thực: `user` luôn trỏ tới một thành viên có
 *  thật của nhóm, `all` là @All. */
export interface MessageMention {
  type: 'user' | 'all';
  userId?: string;
  label: string;
}

export interface GroupMessageDto {
  id: string;
  groupId: string;
  senderId: string;
  message: string | null;
  mentions?: MessageMention[];
  createdAt: string;
  editedAt?: string;
  deletedAt?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: number;
  senderEmail?: string;
  senderName?: string;
  replyToId?: string;
  replyPreview?: string;
  replySenderName?: string;
  replyDeleted?: boolean;
  pinnedAt?: string;
  pinnedBy?: string;
}

@Injectable()
export class GroupsService {
  private readonly logger = new Logger(GroupsService.name);

  constructor(
    private readonly realtimeGateway: RealtimeGateway,
    private readonly supabaseService: SupabaseService,
  ) {}

  // ============================================================
  // Đồng bộ calendar_members theo vai trò trong nhóm.
  //
  // BẮT BUỘC chạy bằng service-role: RLS calendar_members chỉ cho CHỦ lịch
  // (người tạo nhóm ban đầu, role = 'owner') sửa/xoá. Khi một quản trị viên —
  // hoặc trưởng nhóm MỚI sau khi chuyển quyền — đổi quyền / đá thành viên,
  // client theo JWT của họ bị RLS chặn IM LẶNG, làm quyền trên lịch nhóm trôi
  // khỏi vai trò trong nhóm (người bị đá vẫn xem được lịch; người vừa lên
  // admin vẫn không tạo được sự kiện). Ở đây kiểm lỗi và ghi log thay vì nuốt.
  // ============================================================

  /** Mọi thành viên nhóm (trưởng nhóm / quản trị / thành viên) đều tạo-sửa
   *  được sự kiện chung trên lịch nhóm — đúng như mô tả trong tab "Lịch Nhóm"
   *  ("Tất cả thành viên đều có quyền theo dõi và tạo sự kiện chung"). Trước
   *  đây RPC gán 'admin' -> editor, còn lại -> viewer, nên thành viên thường
   *  không thêm được sự kiện dù giao diện nói ngược lại. */
  /** Quyền trên LỊCH nhóm suy ra từ VAI TRÒ trong nhóm:
   *  Trưởng nhóm / Phó nhóm → 'editor' (thêm/sửa/xoá sự kiện chung),
   *  Thành viên thường     → 'viewer' (chỉ xem). */
  private groupCalendarRole(groupRole: GroupRole): 'editor' | 'viewer' {
    return groupRole === GroupRole.LEADER || groupRole === GroupRole.ADMIN
      ? 'editor'
      : 'viewer';
  }

  /** Đặt quyền lịch nhóm cho MỘT người theo đúng vai trò nhóm của họ. Không
   *  bao giờ đụng 'owner'. Chỉ ghi khi lệch. */
  private async upsertCalendarMember(
    calendarId: string | null,
    userId: string,
    groupRole: GroupRole,
  ): Promise<void> {
    if (!calendarId) return;
    const admin = this.supabaseService.getServiceRoleClient();

    const { data: existing } = await admin
      .from('calendar_members')
      .select('role')
      .eq('calendar_id', calendarId)
      .eq('user_id', userId)
      .maybeSingle<{ role: string }>();
    if (existing?.role === 'owner') return;

    const target = this.groupCalendarRole(groupRole);
    if (existing?.role === target) return;

    const { error } = await admin.from('calendar_members').upsert(
      { calendar_id: calendarId, user_id: userId, role: target },
      { onConflict: 'calendar_id,user_id' },
    );
    if (error) {
      this.logger.error(
        `upsertCalendarMember(cal=${calendarId} user=${userId}) thất bại: ${error.message}`,
      );
    }
  }

  /** Đồng bộ quyền lịch của TOÀN nhóm theo vai trò nhóm hiện tại. Tự chữa dữ
   *  liệu cũ (thành viên thường trước đây bị gán 'editor'). Fire-and-forget,
   *  chỉ ghi những hàng lệch. */
  private async syncGroupCalendarRoles(groupId: string): Promise<void> {
    const admin = this.supabaseService.getServiceRoleClient();
    const { data: grp } = await admin
      .from('groups')
      .select('calendar_id, owner_id')
      .eq('id', groupId)
      .maybeSingle<{ calendar_id: string | null; owner_id: string }>();
    if (!grp?.calendar_id) return;

    const [{ data: gm }, { data: cm }] = await Promise.all([
      admin.from('group_members').select('user_id, role').eq('group_id', groupId),
      admin.from('calendar_members').select('user_id, role').eq('calendar_id', grp.calendar_id),
    ]);
    const haveRole = new Map(
      ((cm ?? []) as { user_id: string; role: string }[]).map((r) => [r.user_id, r.role]),
    );

    for (const m of (gm ?? []) as { user_id: string; role: string }[]) {
      const effective =
        m.user_id === grp.owner_id ? GroupRole.LEADER : normalizeGroupRole(m.role);
      const want = this.groupCalendarRole(effective);
      const have = haveRole.get(m.user_id);
      if (have === 'owner' || have === want) continue;
      const { error } = await admin.from('calendar_members').upsert(
        { calendar_id: grp.calendar_id, user_id: m.user_id, role: want },
        { onConflict: 'calendar_id,user_id' },
      );
      if (error) {
        this.logger.error(`syncGroupCalendarRoles(${groupId}) upsert lỗi: ${error.message}`);
      }
    }
  }

  private async removeCalendarMember(
    calendarId: string | null,
    userId: string,
  ): Promise<void> {
    if (!calendarId) return;
    const { error } = await this.supabaseService
      .getServiceRoleClient()
      .from('calendar_members')
      .delete()
      .eq('calendar_id', calendarId)
      .eq('user_id', userId)
      // Đừng xoá chủ lịch khỏi chính lịch của họ.
      .neq('role', 'owner');
    if (error) {
      this.logger.error(
        `removeCalendarMember(cal=${calendarId} user=${userId}) thất bại: ${error.message}`,
      );
    }
  }

  /** calendar_id của lịch nhóm (đọc bằng service-role để không phụ thuộc RLS
   *  của người gọi). */
  private async groupCalendarId(groupId: string): Promise<string | null> {
    const { data } = await this.supabaseService
      .getServiceRoleClient()
      .from('groups')
      .select('calendar_id')
      .eq('id', groupId)
      .maybeSingle<{ calendar_id: string | null }>();
    return data?.calendar_id ?? null;
  }

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
      joinCode: row.join_code ?? undefined,
      requiresApproval: row.requires_approval ?? undefined,
    };
  }

  /**
   * Vai trò hiệu lực của một người trong nhóm.
   *
   * `groups.owner_id` là nguồn xác định trưởng nhóm; hàng trong
   * `group_members` chỉ là bản sao. Ưu tiên owner_id để nếu hai chỗ lệch nhau
   * thì mọi đường kiểm tra quyền vẫn ra cùng một kết quả.
   *
   * Trả về `null` khi người này không ở trong nhóm.
   */
  private async getEffectiveRole(
    supabase: SupabaseClient,
    groupId: string,
    userId: string,
  ): Promise<GroupRole | null> {
    const { data: group, error } = await supabase
      .from('groups')
      .select('owner_id')
      .eq('id', groupId)
      .maybeSingle<{ owner_id: string }>();

    if (error || !group) throw new NotFoundException('Không tìm thấy nhóm');
    if (group.owner_id === userId) return GroupRole.LEADER;

    const { data: member } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle<{ role: string }>();

    return member ? normalizeGroupRole(member.role) : null;
  }

  /** Wrapper public của `getEffectiveRole` — để các module khác (vd AiController)
   *  tái dùng đúng nguồn-thật-duy-nhất xác định vai trò, không viết lại một bản
   *  riêng có thể lệch nhau theo thời gian. */
  async getViewerRole(
    supabase: SupabaseClient,
    groupId: string,
    userId: string,
  ): Promise<GroupRole | null> {
    return this.getEffectiveRole(supabase, groupId, userId);
  }

  /** Vai trò của người đang gọi API, ném lỗi nếu họ không thuộc nhóm. */
  private async requireRole(
    supabase: SupabaseClient,
    user: User,
    groupId: string,
  ): Promise<GroupRole> {
    const role = await this.getEffectiveRole(supabase, groupId, user.id);
    if (!role) throw new ForbiddenException('Bạn không thuộc nhóm này');
    return role;
  }

  /**
   * Chốt chặn thứ bậc cho mọi thao tác lên một thành viên khác.
   *
   * Đây là nơi DUY NHẤT quyết định "ai quản lý được ai", để giao diện và API
   * không thể lệch nhau. Trước đây removeMember không kiểm tra gì cả — ẩn nút
   * trên UI nhưng gọi thẳng API thì vẫn xoá được cả trưởng nhóm.
   */
  private async assertCanManageMember(
    supabase: SupabaseClient,
    actor: User,
    groupId: string,
    targetUserId: string,
  ): Promise<{ actorRole: GroupRole; targetRole: GroupRole }> {
    const actorRole = await this.requireRole(supabase, actor, groupId);
    const targetRole = await this.getEffectiveRole(supabase, groupId, targetUserId);
    if (!targetRole) throw new NotFoundException('Người này không ở trong nhóm');

    if (targetRole === GroupRole.LEADER) {
      throw new ForbiddenException(
        'Không thể thao tác lên trưởng nhóm. Trưởng nhóm phải chuyển quyền trước.',
      );
    }
    if (!canManage(actorRole, targetRole)) {
      throw new ForbiddenException(
        'Bạn không có quyền quản lý thành viên này',
      );
    }
    return { actorRole, targetRole };
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

  /** Dựng phần "reply_*" cho payload realtime của tin vừa gửi — hàng insert
   *  không có sẵn (đến từ JOIN trong RPC). Trả rỗng nếu không trả lời ai / cột
   *  chưa có (migration 43 chưa chạy). */
  private async buildReplySnippet(
    supabase: SupabaseClient,
    replyToId?: string,
  ): Promise<Partial<GroupMessageDto>> {
    if (!replyToId) return {};
    const { data } = await supabase
      .from('group_messages')
      .select('message, attachment_type, attachment_url, deleted_at, sender_id')
      .eq('id', replyToId)
      .maybeSingle<{
        message: string | null;
        attachment_type: string | null;
        attachment_url: string | null;
        deleted_at: string | null;
        sender_id: string;
      }>();
    if (!data) return { replyToId };

    let preview: string | undefined;
    if (data.deleted_at) preview = undefined;
    else if (data.message?.trim()) preview = data.message.slice(0, 90);
    else if (data.attachment_type?.startsWith('image/')) preview = '[Hình ảnh]';
    else if (data.attachment_type?.startsWith('audio/')) preview = '[Tin nhắn thoại]';
    else if (data.attachment_url) preview = '[Tệp đính kèm]';

    let replySenderName: string | undefined;
    const admin = this.supabaseService.getServiceRoleClient();
    const { data: u } = await admin.auth.admin.getUserById(data.sender_id);
    const meta = u?.user?.user_metadata as Record<string, unknown> | undefined;
    replySenderName =
      (meta?.['full_name'] as string | undefined) ||
      u?.user?.email?.split('@')[0] ||
      undefined;

    return {
      replyToId,
      replyPreview: preview,
      replySenderName,
      replyDeleted: !!data.deleted_at,
    };
  }

  private mapMessageRow(row: any): GroupMessageDto {
    return {
      id: row.id,
      groupId: row.group_id,
      senderId: row.sender_id,
      message: row.message,
      mentions: this.normalizeMentionRow(row.mentions),
      createdAt: row.created_at,
      editedAt: row.edited_at ?? undefined,
      deletedAt: row.deleted_at ?? undefined,
      attachmentUrl: row.attachment_url ?? undefined,
      attachmentName: row.attachment_name ?? undefined,
      attachmentType: row.attachment_type ?? undefined,
      attachmentSize: row.attachment_size ?? undefined,
      senderEmail: row.sender_email,
      senderName: row.sender_name ?? undefined,
      replyToId: row.reply_to_id ?? undefined,
      replyPreview: row.reply_preview ?? undefined,
      replySenderName: row.reply_sender_name ?? undefined,
      replyDeleted: row.reply_deleted ?? undefined,
      pinnedAt: row.pinned_at ?? undefined,
      pinnedBy: row.pinned_by ?? undefined,
    };
  }

  /**
   * Chuẩn hoá cột `mentions` đọc từ DB.
   *
   * Cột là jsonb tự do nên phải lọc lại: tin nhắn cũ (trước migration 20) có
   * giá trị null, và không có gì bảo đảm hàng cũ đúng hình dạng. Trả về
   * undefined thay vì mảng rỗng để payload realtime khỏi mang theo trường vô
   * nghĩa.
   */
  private normalizeMentionRow(value: unknown): MessageMention[] | undefined {
    if (!Array.isArray(value)) return undefined;

    const list = value
      .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
      .filter((m) => m['type'] === 'user' || m['type'] === 'all')
      .map((m) => ({
        type: m['type'] as 'user' | 'all',
        userId: typeof m['userId'] === 'string' ? m['userId'] : undefined,
        label: typeof m['label'] === 'string' ? m['label'] : '',
      }))
      .filter((m) => (m.type === 'all' ? true : !!m.userId));

    return list.length > 0 ? list : undefined;
  }

  /**
   * Lọc mention do client gửi lên trước khi lưu.
   *
   * Client là nguồn KHÔNG tin được: nó có thể gửi userId của người ngoài nhóm
   * (hoặc bịa ra) và biến mention thành đường bắn thông báo tới người lạ. Chỉ
   * giữ lại userId thật sự là thành viên của nhóm này, bỏ trùng, và bỏ luôn
   * mention trỏ tới chính người gửi (không ai tự nhắc mình).
   */
  private async sanitizeMentions(
    supabase: SupabaseClient,
    groupId: string,
    senderId: string,
    mentions: MessageMentionDto[] | undefined,
  ): Promise<MessageMention[] | undefined> {
    if (!mentions?.length) return undefined;

    const memberIds = new Set(await this.listMemberUserIds(supabase, groupId));
    const seen = new Set<string>();
    const result: MessageMention[] = [];

    for (const m of mentions) {
      const label = m.label?.trim();
      if (!label) continue;

      if (m.type === 'all') {
        if (seen.has('all')) continue;
        seen.add('all');
        result.push({ type: 'all', label });
        continue;
      }

      if (!m.userId || m.userId === senderId) continue;
      if (!memberIds.has(m.userId)) continue;
      if (seen.has(m.userId)) continue;
      seen.add(m.userId);
      result.push({ type: 'user', userId: m.userId, label });
    }

    return result.length > 0 ? result : undefined;
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

    // Add owner to calendar_members. Kiểm lỗi: nếu hàng này không được ghi thì
    // is_calendar_member() = false, người tạo không thấy được LỊCH của chính
    // nhóm mình và không quản lý được thành viên lịch.
    const { error: calMemberError } = await supabase
      .from('calendar_members')
      .insert({ calendar_id: calendarId, user_id: user.id, role: 'owner' });

    if (calMemberError) {
      await supabase.from('calendars').delete().eq('id', calendarId);
      throw new InternalServerErrorException(
        calMemberError.message || 'Không thể tạo lịch nhóm',
      );
    }

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
      // Dọn lịch vừa tạo — groups.calendar_id là "on delete set null" nên lịch
      // không tự biến mất theo nhóm; không dọn ở đây thì mỗi lần tạo nhóm hỏng
      // để lại một lịch mồ côi kèm calendar_members của nó.
      await supabase.from('calendars').delete().eq('id', calendarId);
      throw new InternalServerErrorException(
        groupError.message || 'Không thể tạo nhóm mới',
      );
    }

    // 3. Hàng thành viên cho chính người tạo, với vai trò trưởng nhóm.
    //
    // PHẢI đi qua toDbGroupRole(), không ghi thẳng chuỗi. Trước đây chỗ này ghi
    // cứng 'owner' — giá trị đó đã bị migration 15 loại khỏi ràng buộc CHECK
    // (chỉ còn 'leader'/'admin'/'member'), nên lệnh insert luôn bị từ chối.
    //
    // Và vì kết quả KHÔNG được kiểm tra, nó hỏng trong IM LẶNG: nhóm vẫn tạo
    // xong, API vẫn trả về thành công, nhưng người tạo không có hàng nào trong
    // group_members. Đến lúc mời bạn thì policy group_invites_insert đòi
    // is_group_member(...) = true, nên báo "new row violates row-level security
    // policy for table group_invites" — lỗi lộ ra ở một chỗ hoàn toàn khác với
    // chỗ thật sự hỏng. Kiểm tra error ngay tại đây để không tái diễn.
    const { error: memberError } = await supabase.from('group_members').insert({
      group_id: groupId,
      user_id: user.id,
      role: toDbGroupRole(GroupRole.LEADER),
    });

    // Bắt buộc phải kiểm lỗi ở đây: trước đây kết quả bị bỏ qua, nên khi insert
    // thất bại thì API vẫn báo tạo nhóm thành công, để lại một nhóm không ai
    // quản lý được — không xoá được, không mời được, không đổi quyền được.
    if (memberError) {
      await supabase.from('groups').delete().eq('id', groupId);
      await supabase.from('calendars').delete().eq('id', calendarId);
      throw new InternalServerErrorException(
        memberError.message || 'Không thể thêm người tạo vào nhóm',
      );
    }

    // Công tắc "yêu cầu phê duyệt" — best-effort: cột chỉ có sau migration 41,
    // nếu chưa chạy thì bỏ qua chứ không làm hỏng việc tạo nhóm. Mặc định DB là
    // true nên chỉ cần ghi khi người tạo TẮT phê duyệt.
    let requiresApproval = true;
    if (dto.requiresApproval === false) {
      const { error } = await supabase
        .from('groups')
        .update({ requires_approval: false })
        .eq('id', groupId);
      if (!error) requiresApproval = false;
    }

    return {
      id: groupId,
      name: dto.name,
      description: dto.description || undefined,
      color,
      ownerId: user.id,
      calendarId,
      createdAt,
      requiresApproval,
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
    if (dto.requiresApproval !== undefined)
      updateData.requires_approval = dto.requiresApproval;

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
    // Dùng service-role: sau khi chuyển quyền, trưởng nhóm mới có thể không
    // còn quyền ghi bảng calendars theo RLS.
    if (
      existing.calendar_id &&
      (dto.name !== undefined || dto.color !== undefined)
    ) {
      const calendarUpdate: Record<string, unknown> = {};
      if (dto.name !== undefined)
        calendarUpdate.name = `${data.name} (Lịch nhóm)`;
      if (dto.color !== undefined) calendarUpdate.color = dto.color;
      const { error: calErr } = await this.supabaseService
        .getServiceRoleClient()
        .from('calendars')
        .update(calendarUpdate)
        .eq('id', existing.calendar_id);
      if (calErr) {
        this.logger.error(
          `updateGroup: đồng bộ tên/màu lịch nhóm ${existing.calendar_id} thất bại: ${calErr.message}`,
        );
      }
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
    //
    // Service-role: RLS calendars_delete_owner chỉ cho CHỦ lịch xoá. Sau khi
    // chuyển quyền, trưởng nhóm mới (người gọi deleteGroup) không phải chủ
    // lịch nữa -> lệnh xoá bị chặn IM LẶNG, để lại lịch + toàn bộ sự kiện mồ côi.
    if (group.calendar_id) {
      const { error: calErr } = await this.supabaseService
        .getServiceRoleClient()
        .from('calendars')
        .delete()
        .eq('id', group.calendar_id);
      if (calErr) {
        this.logger.error(
          `deleteGroup: xoá lịch nhóm ${group.calendar_id} thất bại: ${calErr.message}`,
        );
      }
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
      members: this.mapMemberRows(members, group.owner_id),
    };
  }

  /** Danh sách thành viên kèm vai trò đã chuẩn hoá. */
  async getMembers(
    supabase: SupabaseClient,
    groupId: string,
  ): Promise<GroupMemberDto[]> {
    const { data: group } = await supabase
      .from('groups')
      .select('owner_id')
      .eq('id', groupId)
      .maybeSingle<{ owner_id: string }>();

    if (!group) throw new NotFoundException('Không tìm thấy nhóm');

    const { data, error } = await supabase.rpc('list_group_members', {
      p_group_id: groupId,
    });
    if (error) throw new InternalServerErrorException(error.message);

    // Tự chữa dữ liệu cũ: thành viên thường trước đây bị gán 'editor' trên lịch
    // nhóm. Chạy nền, chỉ ghi hàng lệch — mở workspace một lần là chuẩn lại.
    void this.syncGroupCalendarRoles(groupId).catch(() => undefined);

    return this.mapMemberRows(data, group.owner_id);
  }

  /**
   * Chuyển hàng thô từ DB sang DTO, và ép vai trò về đúng ba khoá ứng dụng.
   *
   * `owner_id` được ưu tiên hơn cột role: nếu hai chỗ lệch nhau (dữ liệu cũ,
   * hoặc migration chưa chạy) thì giao diện vẫn chỉ ra đúng một trưởng nhóm,
   * khớp với thứ bậc mà backend dùng để kiểm tra quyền.
   */
  private mapMemberRows(rows: any[] | null, ownerId: string): GroupMemberDto[] {
    return (rows || []).map((m) => ({
      id: m.id,
      groupId: m.group_id,
      userId: m.user_id,
      role:
        m.user_id === ownerId
          ? GroupRole.LEADER
          : normalizeGroupRole(m.role),
      createdAt: m.created_at,
      email: m.email,
      name: m.full_name,
    }));
  }

  /**
   * Trần số thành viên một nhóm.
   *
   * Đặt ở tầng service để báo lỗi bằng câu tiếng Việt rõ ràng ngay tại thao tác
   * người dùng vừa làm, thay vì để RPC ném ra một lỗi Postgres khó hiểu.
   */
  private static readonly MAX_MEMBERS = 50;

  /**
   * Chặn trước khi nhóm vượt trần.
   *
   * Gọi ở CẢ BA đường thêm người — mời qua email, chấp nhận lời mời, duyệt yêu
   * cầu qua link. Chỉ chặn ở đường mời là hở: lời mời gửi lúc nhóm còn chỗ có
   * thể nằm đó hàng ngày, tới lúc bấm chấp nhận thì nhóm đã đầy.
   *
   * head: true + count: 'exact' chỉ lấy CON SỐ, không kéo hàng nào về.
   */
  private async assertGroupHasRoom(
    supabase: SupabaseClient,
    groupId: string,
  ): Promise<void> {
    const { count, error } = await supabase
      .from('group_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('group_id', groupId);

    // Không đếm được thì KHÔNG chặn: thà cho qua còn hơn khoá người dùng ra
    // khỏi nhóm vì một lỗi mạng. RPC vẫn là lớp cuối.
    if (error || count === null) return;

    if (count >= GroupsService.MAX_MEMBERS) {
      throw new ConflictException(
        `Nhóm đã đạt giới hạn ${GroupsService.MAX_MEMBERS} thành viên`,
      );
    }
  }

  async inviteMember(
    supabase: SupabaseClient,
    inviter: User,
    groupId: string,
    dto: InviteGroupMemberDto,
  ): Promise<GroupInviteDto> {
    // Trước đây route này không kiểm tra gì: bất kỳ thành viên nào cũng mời
    // được người khác vào nhóm.
    const inviterRole = await this.requireRole(supabase, inviter, groupId);
    if (!canInvite(inviterRole)) {
      throw new ForbiddenException(
        'Chỉ trưởng nhóm và quản trị viên mới được mời thành viên',
      );
    }

    await this.assertGroupHasRoom(supabase, groupId);

    const role = normalizeGroupRole(dto.role ?? DEFAULT_GROUP_ROLE);
    if (!canAssignRole(inviterRole, role)) {
      throw new ForbiddenException(
        'Bạn không thể mời người khác với vai trò cao hơn hoặc ngang bằng mình',
      );
    }

    const { data: invitedUserId, error: lookupError } = await supabase.rpc(
      'find_user_id_by_email',
      { p_email: dto.email },
    );

    if (lookupError || !invitedUserId) {
      throw new NotFoundException('Không tìm thấy người dùng với email này');
    }

    if (invitedUserId === inviter.id) {
      throw new ConflictException('Bạn đã ở trong nhóm này rồi');
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



    // Tạo LỜI MỜI ở trạng thái pending thay vì thêm thẳng vào nhóm — người được
    // mời tự quyết định Chấp nhận / Từ chối (giống luồng calendar_invites).
    //
    // Mời LẠI một người đã từ chối (hoặc từng bị đá khỏi nhóm): bảng có ràng
    // buộc unique(group_id, invited_user_id). Trước đây dùng `upsert onConflict`
    // → Postgres chạy UPDATE trên hàng 'declined'/'accepted' cũ, mà policy RLS
    // cho UPDATE nằm ở migration 13 — DB nào chưa chạy migration đó thì "mời
    // lại" luôn báo lỗi "row-level security policy".
    //
    // Nay: xoá hàng KHÔNG-pending rồi INSERT mới (chỉ cần policy DELETE + INSERT
    // ở migration 07, chắc chắn có). Nếu đã có lời mời pending thì coi như mời
    // rồi — trả lại nguyên trạng, không spam thông báo lần hai.
    const { error: cleanupErr } = await supabase
      .from('group_invites')
      .delete()
      .eq('group_id', groupId)
      .eq('invited_user_id', invitedUserId)
      .neq('status', 'pending');
    if (cleanupErr) {
      throw new InternalServerErrorException(
        cleanupErr.message || 'Không thể làm mới lời mời',
      );
    }

    type InviteRowShape = {
      id: string;
      role: string;
      status: string;
      created_at: string;
    };

    const { data: stillPending } = await supabase
      .from('group_invites')
      .select('id, role, status, created_at')
      .eq('group_id', groupId)
      .eq('invited_user_id', invitedUserId)
      .eq('status', 'pending')
      .maybeSingle<InviteRowShape>();

    let inviteRow = stillPending;
    if (!inviteRow) {
      const { data, error: inviteErr } = await supabase
        .from('group_invites')
        .insert({
          group_id: groupId,
          invited_user_id: invitedUserId,
          invited_by: inviter.id,
          role: toDbGroupRole(role),
          status: 'pending',
        })
        .select('id, role, status, created_at')
        .single<InviteRowShape>();

      if (inviteErr || !data) {
        throw new InternalServerErrorException(
          inviteErr?.message || 'Không thể tạo lời mời',
        );
      }
      inviteRow = data;
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
      role: normalizeGroupRole(inviteRow.role),
      status: inviteRow.status,
      createdAt: inviteRow.created_at,
      inviterEmail: inviter.email ?? null,
    };

    // Bắn thẳng vào room riêng của người được mời: họ chưa phải thành viên nên
    // không có mặt trong bất kỳ room nhóm nào.
    this.realtimeGateway.emitToUser(invitedUserId as string, 'group:invited', {
      invite,
    });
    // Báo cho quản trị nhóm để danh sách "Lời mời đang chờ" của họ tự cập nhật.
    await this.emitToGroupMembers(supabase, groupId, 'group:inviteCreated', {
      groupId,
      invite: {
        id: inviteRow.id,
        email: dto.email,
        role: normalizeGroupRole(inviteRow.role),
        status: inviteRow.status,
        createdAt: inviteRow.created_at,
      },
    });

    return invite;
  }

  /**
   * Danh sách lời mời ĐANG CHỜ của một nhóm — để trưởng/phó nhóm thấy mình đã
   * mời ai, ai chưa trả lời, và huỷ lại được. Trước đây không có endpoint này
   * nên lời mời gửi đi xong là "biến mất" khỏi mắt người mời.
   */
  async listGroupInvites(
    supabase: SupabaseClient,
    actor: User,
    groupId: string,
  ): Promise<GroupPendingInviteDto[]> {
    const role = await this.requireRole(supabase, actor, groupId);
    if (!canInvite(role)) {
      throw new ForbiddenException('Chỉ trưởng nhóm và quản trị viên mới xem được lời mời');
    }

    const { data, error } = await supabase
      .from('group_invites')
      .select('id, invited_user_id, role, status, created_at')
      .eq('group_id', groupId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .returns<
        {
          id: string;
          invited_user_id: string;
          role: string;
          status: string;
          created_at: string;
        }[]
      >();
    if (error) throw new InternalServerErrorException(error.message);

    return Promise.all(
      (data ?? []).map(async (row) => {
        const { data: email } = await supabase.rpc('get_user_email_by_id', {
          p_user_id: row.invited_user_id,
        });
        return {
          id: row.id,
          email: (email as string | null) ?? row.invited_user_id,
          role: normalizeGroupRole(row.role),
          status: row.status,
          createdAt: row.created_at,
        };
      }),
    );
  }

  /** Huỷ một lời mời đang chờ. Chỉ trưởng/phó nhóm. */
  async cancelGroupInvite(
    supabase: SupabaseClient,
    actor: User,
    groupId: string,
    inviteId: string,
  ): Promise<void> {
    const role = await this.requireRole(supabase, actor, groupId);
    if (!canInvite(role)) {
      throw new ForbiddenException('Chỉ trưởng nhóm và quản trị viên mới huỷ được lời mời');
    }

    const { data: deleted, error } = await supabase
      .from('group_invites')
      .delete()
      .eq('id', inviteId)
      .eq('group_id', groupId)
      .select('id, invited_user_id')
      .returns<{ id: string; invited_user_id: string }[]>();
    if (error) throw new InternalServerErrorException(error.message);
    if (!deleted || deleted.length === 0) {
      throw new NotFoundException('Lời mời không tồn tại');
    }

    // Người được mời: gỡ thẻ lời mời khỏi màn hình họ ngay.
    this.realtimeGateway.emitToUser(deleted[0].invited_user_id, 'group:inviteRevoked', {
      inviteId,
      groupId,
    });
    // Quản trị nhóm khác: cập nhật danh sách "đang chờ".
    await this.emitToGroupMembers(supabase, groupId, 'group:inviteRemoved', {
      groupId,
      inviteId,
    });
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
    // Chỉ kiểm khi ĐỒNG Ý. Từ chối thì không thêm ai nên nhóm đầy cũng mặc kệ,
    // chặn ở đây sẽ khoá luôn cả đường dọn lời mời cũ.
    if (dto.status === 'accepted') {
      const { data: inv } = await supabase
        .from('group_invites')
        .select('group_id')
        .eq('id', inviteId)
        .maybeSingle<{ group_id: string }>();
      if (inv) await this.assertGroupHasRoom(supabase, inv.group_id);
    }

    const { data, error } = await supabase
      .rpc('respond_group_invite', {
        p_invite_id: inviteId,
        p_status: dto.status,
      })
      .single<Omit<GroupInviteRow, 'inviter_email'>>();

    let invite: GroupInviteDto;
    if (error) {
      if (error.message.includes('invite not found')) {
        throw new NotFoundException('Lời mời không tồn tại');
      }
      if (error.message.includes('already handled')) {
        throw new ConflictException('Lời mời này đã được xử lý');
      }
      // Hàm RPC respond_group_invite trong DB cloud có thể là bản CŨ chưa vá
      // #variable_conflict (migration 28) → "column reference group_id is
      // ambiguous", chặn MỌI accept/decline. Trong lúc migration chưa chạy,
      // làm tay bằng service-role để người dùng không bị kẹt.
      if (error.message.includes('ambiguous')) {
        this.logger.warn(
          'respond_group_invite RPC là bản cũ (ambiguous group_id) — dùng fallback service-role. HÃY CHẠY migration 28 trên Supabase.',
        );
        invite = await this.respondGroupInviteFallback(userId, inviteId, dto.status);
      } else {
        throw new InternalServerErrorException(error.message);
      }
    } else {
      invite = toGroupInviteDto({ ...data, inviter_email: null });
    }

    // Đặt quyền lịch nhóm theo VAI TRÒ nhóm: Trưởng/Phó nhóm → editor, thành
    // viên thường → viewer (chỉ xem sự kiện chung, không thêm/sửa/xoá).
    if (dto.status === 'accepted') {
      await this.upsertCalendarMember(
        await this.groupCalendarId(invite.groupId),
        userId,
        normalizeGroupRole(invite.role),
      );
    }

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

  /**
   * Thay cho RPC respond_group_invite() khi hàm trong DB còn là bản cũ dính
   * lỗi "ambiguous group_id" (migration 28 chưa chạy). Làm đúng các bước của
   * RPC nhưng bằng service-role client ở tầng ứng dụng.
   */
  private async respondGroupInviteFallback(
    userId: string,
    inviteId: string,
    status: 'accepted' | 'declined',
  ): Promise<GroupInviteDto> {
    const admin = this.supabaseService.getServiceRoleClient();

    const { data: inv } = await admin
      .from('group_invites')
      .select('id, group_id, role, status, created_at, invited_user_id')
      .eq('id', inviteId)
      .maybeSingle<{
        id: string;
        group_id: string;
        role: string;
        status: string;
        created_at: string;
        invited_user_id: string;
      }>();

    if (!inv || inv.invited_user_id !== userId) {
      throw new NotFoundException('Lời mời không tồn tại');
    }
    if (inv.status !== 'pending') {
      throw new ConflictException('Lời mời này đã được xử lý');
    }

    const { error: updErr } = await admin
      .from('group_invites')
      .update({ status })
      .eq('id', inviteId);
    if (updErr) throw new InternalServerErrorException(updErr.message);

    const { data: grp } = await admin
      .from('groups')
      .select('name, color, calendar_id')
      .eq('id', inv.group_id)
      .maybeSingle<{ name: string; color: string; calendar_id: string | null }>();

    if (status === 'accepted') {
      await admin
        .from('group_members')
        .upsert(
          { group_id: inv.group_id, user_id: userId, role: inv.role },
          { onConflict: 'group_id,user_id', ignoreDuplicates: true },
        );
      if (grp?.calendar_id) {
        await admin.from('calendar_members').upsert(
          {
            calendar_id: grp.calendar_id,
            user_id: userId,
            role: inv.role === 'admin' ? 'editor' : 'viewer',
          },
          { onConflict: 'calendar_id,user_id', ignoreDuplicates: true },
        );
      }
    }

    return toGroupInviteDto({
      id: inv.id,
      group_id: inv.group_id,
      group_name: grp?.name ?? '',
      group_color: grp?.color ?? 'blue',
      role: inv.role,
      status,
      created_at: inv.created_at,
      inviter_email: null,
    });
  }

  /**
   * LEADER/ADMIN của một nhóm — dùng để báo tin có yêu cầu tham gia mới.
   * Lọc lại từ getMembers() thay vì tự truy vấn, để không lệch khỏi cách
   * mapMemberRows() đã chuẩn hoá vai trò (owner_id ưu tiên hơn cột role).
   */
  private async listAdminUserIds(
    supabase: SupabaseClient,
    groupId: string,
  ): Promise<string[]> {
    const members = await this.getMembers(supabase, groupId);
    return members
      .filter((m) => m.role === GroupRole.LEADER || m.role === GroupRole.ADMIN)
      .map((m) => m.userId);
  }

  async getInviteLink(
    supabase: SupabaseClient,
    actor: User,
    groupId: string,
  ): Promise<GroupInviteLinkDto | null> {
    const actorRole = await this.requireRole(supabase, actor, groupId);
    if (!canInvite(actorRole)) {
      throw new ForbiddenException(
        'Chỉ trưởng nhóm và quản trị viên mới xem được link mời',
      );
    }

    const { data, error } = await supabase
      .from('group_invite_links')
      .select('token, group_id, role, created_by, created_at')
      .eq('group_id', groupId)
      .is('revoked_at', null)
      .maybeSingle<{
        token: string;
        group_id: string;
        role: string;
        created_by: string | null;
        created_at: string;
      }>();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) return null;

    return {
      token: data.token,
      groupId: data.group_id,
      role: normalizeGroupRole(data.role),
      createdBy: data.created_by,
      createdAt: data.created_at,
    };
  }

  async createOrRegenerateInviteLink(
    supabase: SupabaseClient,
    actor: User,
    groupId: string,
    role?: string,
  ): Promise<GroupInviteLinkDto> {
    const actorRole = await this.requireRole(supabase, actor, groupId);
    if (!canInvite(actorRole)) {
      throw new ForbiddenException(
        'Chỉ trưởng nhóm và quản trị viên mới được tạo link mời',
      );
    }

    const linkRole = normalizeGroupRole(role ?? DEFAULT_GROUP_ROLE);
    if (!canAssignRole(actorRole, linkRole)) {
      throw new ForbiddenException(
        'Bạn không thể tạo link mời với vai trò cao hơn hoặc ngang bằng mình',
      );
    }

    const { error: revokeErr } = await supabase
      .from('group_invite_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('group_id', groupId)
      .is('revoked_at', null);

    if (revokeErr) throw new InternalServerErrorException(revokeErr.message);

    const { data, error } = await supabase
      .from('group_invite_links')
      .insert({
        group_id: groupId,
        role: toDbGroupRole(linkRole),
        created_by: actor.id,
      })
      .select('token, group_id, role, created_by, created_at')
      .single<{
        token: string;
        group_id: string;
        role: string;
        created_by: string | null;
        created_at: string;
      }>();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message || 'Không thể tạo link mời',
      );
    }

    return {
      token: data.token,
      groupId: data.group_id,
      role: normalizeGroupRole(data.role),
      createdBy: data.created_by,
      createdAt: data.created_at,
    };
  }

  async getInviteLinkPreview(
    supabase: SupabaseClient,
    token: string,
  ): Promise<GroupInviteLinkPreviewDto> {
    const { data, error } = await supabase
      .rpc('get_group_invite_link_preview', { p_token: token })
      .single<{
        group_id: string;
        group_name: string;
        group_description: string | null;
        group_color: string;
        role: string;
        is_member: boolean;
        my_pending_request_id: string | null;
      }>();

    if (error) {
      if (error.message.includes('link not found')) {
        throw new NotFoundException(
          'Link mời không hợp lệ hoặc đã bị thu hồi',
        );
      }
      throw new InternalServerErrorException(error.message);
    }

    return {
      groupId: data.group_id,
      groupName: data.group_name,
      groupDescription: data.group_description ?? undefined,
      groupColor: data.group_color,
      role: normalizeGroupRole(data.role),
      isMember: data.is_member,
      myPendingRequestId: data.my_pending_request_id,
    };
  }

  async requestToJoin(
    supabase: SupabaseClient,
    requester: User,
    token: string,
  ): Promise<GroupJoinRequestDto> {
    const { data, error } = await supabase
      .rpc('request_join_group', { p_token: token })
      .single<{
        id: string;
        group_id: string;
        user_id: string;
        role: string;
        status: string;
        created_at: string;
      }>();

    if (error) {
      if (error.message.includes('link not found')) {
        throw new NotFoundException(
          'Link mời không hợp lệ hoặc đã bị thu hồi',
        );
      }
      if (error.message.includes('already a member')) {
        throw new ConflictException('Bạn đã ở trong nhóm này rồi');
      }
      if (error.message.includes('request already pending')) {
        throw new ConflictException(
          'Bạn đã gửi yêu cầu tham gia nhóm này rồi',
        );
      }
      throw new InternalServerErrorException(error.message);
    }

    const request = toGroupJoinRequestDto({
      id: data.id,
      group_id: data.group_id,
      user_id: data.user_id,
      role: data.role,
      status: data.status,
      created_at: data.created_at,
      requester_email: requester.email ?? null,
      requester_name: null,
    });

    // Báo cho LEADER/ADMIN của nhóm — họ chưa ở trong bất kỳ room nào của
    // requester nên phải bắn thẳng vào room riêng từng người.
    const adminIds = await this.listAdminUserIds(supabase, request.groupId);
    for (const adminId of adminIds) {
      this.realtimeGateway.emitToUser(adminId, 'group:joinRequested', {
        groupId: request.groupId,
        request,
      });
    }

    return request;
  }

  /**
   * Tham gia nhóm bằng MÃ NGẮN (từ màn hình Dashboard).
   *
   * RPC `join_group_by_code` (migration 41) làm phần DB nguyên tử; ở đây lo
   * phần realtime + dòng chào. Dùng service-role cho tra cứu vì người gọi chưa
   * chắc đã là thành viên (trường hợp chờ duyệt).
   */
  async joinByCode(
    supabase: SupabaseClient,
    user: User,
    code: string,
  ): Promise<
    | { status: 'joined'; group: GroupDto }
    | { status: 'pending'; groupId: string }
  > {
    const { data, error } = await supabase
      .rpc('join_group_by_code', { p_code: code })
      .single<{ outcome: string; group_id: string; request_id: string | null }>();

    if (error) {
      const m = error.message || '';
      if (m.includes('group not found')) {
        throw new NotFoundException('Không tìm thấy nhóm với mã này');
      }
      if (m.includes('already a member')) {
        throw new ConflictException('Bạn đã ở trong nhóm này rồi');
      }
      if (m.includes('request already pending')) {
        throw new ConflictException('Bạn đã gửi yêu cầu tham gia nhóm này rồi');
      }
      if (error.code === '42883' || m.includes('join_group_by_code')) {
        throw new InternalServerErrorException(
          'Tính năng tham gia bằng mã cần chạy migration 41_group_join_code.sql trên Supabase',
        );
      }
      throw new InternalServerErrorException(m);
    }

    const admin = this.supabaseService.getServiceRoleClient();
    const groupId = data.group_id;

    if (data.outcome === 'pending') {
      const { data: reqRow } = await admin
        .from('group_join_requests')
        .select('id, group_id, user_id, role, status, created_at')
        .eq('id', data.request_id)
        .maybeSingle();
      const request = toGroupJoinRequestDto({
        id: reqRow?.id ?? data.request_id!,
        group_id: reqRow?.group_id ?? groupId,
        user_id: reqRow?.user_id ?? user.id,
        role: reqRow?.role ?? 'member',
        status: reqRow?.status ?? 'pending',
        created_at: reqRow?.created_at ?? new Date().toISOString(),
        requester_email: user.email ?? null,
        requester_name:
          ((user.user_metadata as Record<string, unknown> | undefined)?.[
            'full_name'
          ] as string | undefined) ?? null,
      });
      const { data: adminRows } = await admin
        .from('group_members')
        .select('user_id, role')
        .eq('group_id', groupId);
      for (const m of (adminRows ?? []) as { user_id: string; role: string }[]) {
        if (normalizeGroupRole(m.role) === GroupRole.MEMBER) continue;
        this.realtimeGateway.emitToUser(m.user_id, 'group:joinRequested', {
          groupId,
          request,
        });
      }
      return { status: 'pending', groupId };
    }

    // outcome === 'joined'
    const { data: groupRow } = await admin
      .from('groups')
      .select('*')
      .eq('id', groupId)
      .single();
    const group = this.mapGroupRow(groupRow);

    const actor =
      ((user.user_metadata as Record<string, unknown> | undefined)?.[
        'full_name'
      ] as string | undefined) ||
      user.email?.split('@')[0] ||
      'Một thành viên';
    const { data: welcome } = await admin
      .from('group_messages')
      .insert({
        group_id: groupId,
        sender_id: user.id,
        message: `👋 ${actor} vừa tham gia nhóm`,
      })
      .select('*')
      .single();
    if (welcome) {
      const msgDto: GroupMessageDto = {
        ...this.mapMessageRow(welcome),
        senderEmail: user.email,
      };
      await this.emitToGroupRooms(admin, groupId, 'group:messageSent', {
        groupId,
        message: msgDto,
      });
      await this.emitToGroupMembers(admin, groupId, 'group:messageSent', {
        groupId,
        message: msgDto,
      });
    }

    // Đồng bộ quyền lịch nhóm cho người mới + báo thành viên hiện có.
    void this.syncGroupCalendarRoles(groupId).catch(() => undefined);
    await this.emitToGroupMembers(admin, groupId, 'group:memberJoined', {
      groupId,
    });

    return { status: 'joined', group };
  }

  async getJoinCode(
    supabase: SupabaseClient,
    actor: User,
    groupId: string,
  ): Promise<{ code: string; requiresApproval: boolean }> {
    const role = await this.requireRole(supabase, actor, groupId);
    if (!canInvite(role)) {
      throw new ForbiddenException(
        'Chỉ Trưởng nhóm hoặc Phó nhóm mới xem được mã nhóm',
      );
    }
    const { data, error } = await supabase
      .from('groups')
      .select('join_code, requires_approval')
      .eq('id', groupId)
      .single<{ join_code: string | null; requires_approval: boolean | null }>();
    if (error) {
      if (error.code === '42703') {
        throw new InternalServerErrorException(
          'Tính năng mã nhóm cần chạy migration 41_group_join_code.sql trên Supabase',
        );
      }
      throw new InternalServerErrorException(error.message);
    }
    return {
      code: data.join_code ?? '',
      requiresApproval: data.requires_approval ?? true,
    };
  }

  async regenerateJoinCode(
    supabase: SupabaseClient,
    actor: User,
    groupId: string,
  ): Promise<{ code: string }> {
    const role = await this.requireRole(supabase, actor, groupId);
    if (!canInvite(role)) {
      throw new ForbiddenException(
        'Chỉ Trưởng nhóm hoặc Phó nhóm mới tạo lại được mã nhóm',
      );
    }
    const { data, error } = await supabase
      .rpc('regenerate_group_join_code', { p_group_id: groupId })
      .single<string>();
    if (error) throw new InternalServerErrorException(error.message);
    return { code: (data as unknown as string) ?? '' };
  }

  async listJoinRequests(
    supabase: SupabaseClient,
    actor: User,
    groupId: string,
  ): Promise<GroupJoinRequestDto[]> {
    const actorRole = await this.requireRole(supabase, actor, groupId);
    if (actorRole !== GroupRole.LEADER) {
      throw new ForbiddenException(
        'Chỉ trưởng nhóm mới xem được yêu cầu tham gia',
      );
    }

    const { data, error } = await supabase.rpc('list_group_join_requests', {
      p_group_id: groupId,
    });
    if (error) throw new InternalServerErrorException(error.message);
    return (data as GroupJoinRequestRow[]).map(toGroupJoinRequestDto);
  }

  async decideJoinRequest(
    supabase: SupabaseClient,
    actor: User,
    groupId: string,
    requestId: string,
    dto: DecideJoinRequestDto,
  ): Promise<GroupJoinRequestDto> {
    const actorRole = await this.requireRole(supabase, actor, groupId);
    if (actorRole !== GroupRole.LEADER) {
      throw new ForbiddenException(
        'Chỉ trưởng nhóm mới được duyệt yêu cầu tham gia',
      );
    }

    let request: GroupJoinRequestDto;

    if (dto.status === 'approved') {
      await this.assertGroupHasRoom(supabase, groupId);

      const { data, error } = await supabase
        .rpc('approve_group_join_request', { p_request_id: requestId })
        .single<{
          id: string;
          group_id: string;
          user_id: string;
          role: string;
          status: string;
          created_at: string;
          decided_by: string | null;
          decided_at: string | null;
        }>();

      if (error) {
        if (error.message.includes('request not found')) {
          throw new NotFoundException('Yêu cầu không tồn tại');
        }
        if (error.message.includes('already handled')) {
          throw new ConflictException('Yêu cầu này đã được xử lý');
        }
        if (error.message.includes('not authorized')) {
          throw new ForbiddenException(
            'Bạn không có quyền duyệt yêu cầu này',
          );
        }
        throw new InternalServerErrorException(error.message);
      }

      request = toGroupJoinRequestDto({
        id: data.id,
        group_id: data.group_id,
        user_id: data.user_id,
        role: data.role,
        status: data.status,
        created_at: data.created_at,
        requester_email: null,
        requester_name: null,
      });
    } else {
      const { data, error } = await supabase
        .from('group_join_requests')
        .update({
          status: 'declined',
          decided_by: actor.id,
          decided_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .eq('group_id', groupId)
        .eq('status', 'pending')
        .select('id, group_id, user_id, role, status, created_at')
        .maybeSingle<{
          id: string;
          group_id: string;
          user_id: string;
          role: string;
          status: string;
          created_at: string;
        }>();

      if (error) throw new InternalServerErrorException(error.message);
      if (!data) {
        throw new ConflictException(
          'Yêu cầu không tồn tại hoặc đã được xử lý',
        );
      }

      request = toGroupJoinRequestDto({
        ...data,
        requester_email: null,
        requester_name: null,
      });
    }

    if (dto.status === 'approved') {
      // Người duyệt qua link luôn vào với vai trò MEMBER → chỉ xem lịch nhóm.
      await this.upsertCalendarMember(
        await this.groupCalendarId(groupId),
        request.userId,
        GroupRole.MEMBER,
      );

      const member = await this.getMembers(supabase, groupId).then((members) =>
        members.find((m) => m.userId === request.userId),
      );
      await this.emitToGroupMembers(supabase, groupId, 'group:memberJoined', {
        groupId,
        member,
      });
    }

    this.realtimeGateway.emitToUser(request.userId, 'group:joinRequestDecided', {
      groupId,
      requestId: request.id,
      status: dto.status,
    });

    return request;
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

    const nextRole = normalizeGroupRole(dto.role);
    const { actorRole } = await this.assertCanManageMember(
      supabase,
      requester,
      groupId,
      targetUserId,
    );

    // Chặn cả việc TỰ NÂNG mình lên và việc nâng người khác lên ngang/cao hơn
    // mình — nếu không, một quản trị viên có thể tự phong trưởng nhóm.
    if (!canAssignRole(actorRole, nextRole)) {
      throw new ForbiddenException(
        'Bạn không thể gán vai trò này. Quyền trưởng nhóm chỉ đổi qua chức năng chuyển quyền.',
      );
    }

    const { data: updated, error } = await supabase
      .from('group_members')
      .update({ role: toDbGroupRole(nextRole) })
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

    // Đồng bộ quyền trên lịch nhóm theo vai trò MỚI: Trưởng/Phó nhóm → editor
    // (thêm/sửa/xoá sự kiện chung), hạ xuống Thành viên → viewer (chỉ xem).
    await this.upsertCalendarMember(group.calendar_id, targetUserId, nextRole);

    const members = await this.getMembers(supabase, groupId);
    const memberDto: GroupMemberDto = members.find((m) => m.userId === targetUserId) || {
      id: updated.id,
      groupId: updated.group_id,
      userId: updated.user_id,
      role: normalizeGroupRole(updated.role),
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
    // Người bị đổi quyền chưa chắc đang mở nhóm này (phòng "calendar:" ở
    // trên chỉ tới người đang xem) — bắn thêm vào room riêng của MỌI thành
    // viên để chính họ biết ngay, không phải đợi mở lại nhóm mới thấy.
    await this.emitToGroupMembers(supabase, groupId, 'group:memberRoleChanged', {
      groupId,
      member: memberDto,
    });

    return memberDto;
  }

  /**
   * Xoá một người khỏi nhóm, hoặc tự rời nhóm.
   *
   * Trước đây hàm này KHÔNG nhận người gọi và KHÔNG kiểm tra gì — ẩn nút trên
   * giao diện nhưng gọi thẳng API thì thành viên thường vẫn xoá được cả trưởng
   * nhóm.
   */
  async removeMember(
    supabase: SupabaseClient,
    actor: User,
    groupId: string,
    userId: string,
  ): Promise<void> {
    const { data: group } = await supabase
      .from('groups')
      .select('owner_id, calendar_id')
      .eq('id', groupId)
      .maybeSingle<{ owner_id: string; calendar_id: string | null }>();

    if (!group) throw new NotFoundException('Không tìm thấy nhóm');

    if (userId === actor.id) {
      // Tự rời nhóm. Trưởng nhóm rời đi mà chưa chuyển quyền sẽ để lại một
      // nhóm không ai quản lý được, nên phải chặn.
      if (group.owner_id === actor.id) {
        throw new ConflictException(
          'Bạn đang là trưởng nhóm. Hãy chuyển quyền trưởng nhóm cho người khác trước khi rời nhóm.',
        );
      }
      await this.requireRole(supabase, actor, groupId);
    } else {
      await this.assertCanManageMember(supabase, actor, groupId, userId);
    }

    // Chốt danh sách người cần báo TRƯỚC khi xoá — sau delete(), người vừa bị
    // xoá không còn nằm trong group_members nữa nên emitToGroupMembers() (tự
    // truy vấn lại danh sách) sẽ bỏ sót đúng người cần biết nhất.
    const targetUserIds = await this.listMemberUserIds(supabase, groupId);

    const { error: delErr } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);
    if (delErr) {
      throw new InternalServerErrorException(
        delErr.message || 'Không thể xoá thành viên khỏi nhóm',
      );
    }

    // Gỡ khỏi lịch nhóm bằng service-role: RLS calendar_members chỉ cho CHỦ
    // lịch xoá, nên nếu người thực hiện là quản trị viên (hoặc trưởng nhóm mới
    // sau chuyển quyền) thì lệnh xoá qua client thường bị chặn im lặng và
    // người vừa bị đá KHỎI NHÓM vẫn xem/sửa được lịch nhóm.
    await this.removeCalendarMember(group.calendar_id, userId);

    if (group.calendar_id) {
      this.realtimeGateway.emitToCalendar(group.calendar_id, 'group:memberRemoved', {
        groupId,
        userId,
      });
    }
    // Người bị xoá chưa chắc đang mở nhóm (phòng "calendar:" chỉ tới người
    // đang xem) — họ cần biết mình vừa mất quyền truy cập NGAY, không phải
    // đợi thao tác tiếp theo thất bại rồi mới hiểu vì sao.
    await this.emitToGroupMembers(
      supabase,
      groupId,
      'group:memberRemoved',
      { groupId, userId },
      targetUserIds,
    );
  }

  /**
   * Chuyển ghế trưởng nhóm sang một thành viên khác.
   *
   * Đây là đường DUY NHẤT để đổi trưởng nhóm — cố ý tách khỏi updateMemberRole
   * để không ai vô tình (hoặc cố ý) tự phong bằng cách gán role LEADER.
   * Người đang giữ ghế bị hạ xuống quản trị viên chứ không bị đẩy khỏi nhóm.
   */
  async transferLeadership(
    supabase: SupabaseClient,
    actor: User,
    groupId: string,
    targetUserId: string,
  ): Promise<GroupMemberDto[]> {
    const { data: group, error: groupErr } = await supabase
      .from('groups')
      .select('owner_id, calendar_id')
      .eq('id', groupId)
      .maybeSingle<{ owner_id: string; calendar_id: string | null }>();

    if (groupErr || !group) throw new NotFoundException('Không tìm thấy nhóm');
    if (group.owner_id !== actor.id) {
      throw new ForbiddenException(
        'Chỉ trưởng nhóm mới được chuyển quyền trưởng nhóm',
      );
    }
    if (targetUserId === actor.id) {
      throw new ConflictException('Bạn đã là trưởng nhóm');
    }

    const targetRole = await this.getEffectiveRole(supabase, groupId, targetUserId);
    if (!targetRole) {
      throw new NotFoundException(
        'Chỉ có thể chuyển quyền cho người đã ở trong nhóm',
      );
    }

    // Một RPC nguyên tử thay vì ba lệnh UPDATE rời.
    //
    // Ba lệnh rời buộc phải nới policy RLS group_members_update từ > xuống >=
    // để chúng đi lọt, mà nới thế là mở đường cho một quản trị viên hạ quyền
    // quản trị viên khác. Hàm SECURITY DEFINER giữ policy ở mức chặt nhất, và
    // nếu hỏng giữa chừng thì cả ba thay đổi cùng rollback — nhóm không bao
    // giờ rơi vào cảnh có hai trưởng nhóm hoặc không có ai.
    const { error: rpcError } = await supabase.rpc('transfer_group_leadership', {
      p_group_id: groupId,
      p_new_leader: targetUserId,
    });

    if (rpcError) {
      const msg = rpcError.message || '';
      if (msg.includes('not authorized')) {
        throw new ForbiddenException(
          'Chỉ trưởng nhóm mới được chuyển quyền trưởng nhóm',
        );
      }
      if (msg.includes('already leader')) {
        throw new ConflictException('Bạn đã là trưởng nhóm');
      }
      if (msg.includes('not a group member')) {
        throw new NotFoundException(
          'Chỉ có thể chuyển quyền cho người đã ở trong nhóm',
        );
      }
      if (msg.includes('group not found')) {
        throw new NotFoundException('Không tìm thấy nhóm');
      }
      throw new InternalServerErrorException(
        msg || 'Không thể chuyển quyền trưởng nhóm',
      );
    }

    // Chuyển quyền sở hữu LỊCH nhóm theo ghế trưởng nhóm. RPC
    // transfer_group_leadership chỉ đổi groups.owner_id + hàng group_members;
    // không đụng tới calendars/calendar_members. Bỏ bước này thì "chủ lịch"
    // kẹt vĩnh viễn ở người tạo nhóm đầu tiên: trưởng nhóm mới không quản lý
    // được thành viên lịch, không xoá được lịch khi xoá nhóm, và người tạo cũ
    // vẫn là chủ lịch kể cả sau khi rời nhóm. Service-role vì RLS
    // calendars/calendar_members chỉ cho chủ lịch hiện tại ghi.
    if (group.calendar_id) {
      const admin = this.supabaseService.getServiceRoleClient();
      const calId = group.calendar_id;

      // Người nhận -> chủ lịch TRƯỚC (tránh khoảnh khắc lịch không có chủ nào).
      // upsert phòng khi họ chưa có hàng calendar_members nào.
      const { error: e1 } = await admin.from('calendar_members').upsert(
        { calendar_id: calId, user_id: targetUserId, role: 'owner' },
        { onConflict: 'calendar_id,user_id' },
      );
      // Người giao -> editor (vẫn ở trong nhóm, chỉ mất ghế chủ).
      const { error: e2 } = await admin
        .from('calendar_members')
        .update({ role: 'editor' })
        .eq('calendar_id', calId)
        .eq('user_id', actor.id);
      // calendars.owner_id là cột thật, dùng ở canEdit và RLS xoá lịch.
      const { error: e3 } = await admin
        .from('calendars')
        .update({ owner_id: targetUserId })
        .eq('id', calId);
      const err = e1 || e2 || e3;
      if (err) {
        this.logger.error(
          `transferLeadership: chuyển chủ lịch nhóm ${calId} thất bại: ${err.message}`,
        );
      }
    }
    const members = await this.getMembers(supabase, groupId);
    if (group.calendar_id) {
      this.realtimeGateway.emitToCalendar(group.calendar_id, 'group:leadershipTransferred', {
        groupId,
        newLeaderId: targetUserId,
        previousLeaderId: actor.id,
        members,
      });
    }
    // Người nhận/người giao ghế trưởng nhóm chưa chắc đang mở nhóm này.
    await this.emitToGroupMembers(supabase, groupId, 'group:leadershipTransferred', {
      groupId,
      newLeaderId: targetUserId,
      previousLeaderId: actor.id,
      members,
    });
    return members;
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
    await this.emitToGroupMembers(supabase, groupId, 'group:taskCreated', {
      groupId,
      task: taskDto,
    });

    if (taskDto.assignedTo) {
      this.realtimeGateway.emitToUser(taskDto.assignedTo, 'task:assigned', {
        groupId,
        task: taskDto,
      });
    }

    return taskDto;
  }

  async updateTask(
    supabase: SupabaseClient,
    user: User,
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

    // Phân quyền: Trưởng nhóm / Phó nhóm sửa được mọi thứ. Thành viên thường
    // CHỈ được đổi `status` và CHỈ trên task giao cho chính mình — kéo-thả task
    // của người khác (hoặc đổi tiêu đề/người phụ trách) bị chặn tại đây, không
    // chỉ ẩn nút trên giao diện.
    const role = await this.requireRole(supabase, user, groupId);
    if (!canManage(role, GroupRole.MEMBER)) {
      const onlyStatus =
        Object.keys(updateData).length > 0 &&
        Object.keys(updateData).every((k) => k === 'status');
      if (!onlyStatus) {
        throw new ForbiddenException(
          'Chỉ Trưởng nhóm hoặc Phó nhóm mới được sửa nội dung hoặc người phụ trách của công việc',
        );
      }
      const { data: current } = await supabase
        .from('group_tasks')
        .select('assigned_to')
        .eq('id', taskId)
        .eq('group_id', groupId)
        .maybeSingle<{ assigned_to: string | null }>();
      if (!current) throw new NotFoundException('Không tìm thấy công việc');
      if (current.assigned_to !== user.id) {
        throw new ForbiddenException(
          'Bạn chỉ được chuyển trạng thái công việc được giao cho mình',
        );
      }
    }

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
    await this.emitToGroupMembers(supabase, groupId, 'group:taskUpdated', {
      groupId,
      task: taskDto,
    });

    // Chỉ bắn 'task:assigned' khi request này THỰC SỰ gán/đổi người phụ trách
    // (dto.assignedTo có mặt) — không phải mỗi lần cập nhật bất kỳ trường nào
    // (vd. kéo-thả đổi trạng thái), kẻo người được giao nhận nhầm thông báo
    // "nhiệm vụ mới" cho một task họ đã được giao từ trước.
    if (dto.assignedTo !== undefined && taskDto.assignedTo) {
      this.realtimeGateway.emitToUser(taskDto.assignedTo, 'task:assigned', {
        groupId,
        task: taskDto,
      });
    }

    return taskDto;
  }

  async deleteTask(
    supabase: SupabaseClient,
    groupId: string,
    taskId: string,
  ): Promise<{ id: string }> {
    const { data, error } = await supabase
      .from('group_tasks')
      .delete()
      .eq('id', taskId)
      .eq('group_id', groupId)
      .select('id, title, assigned_to')
      .single<{ id: string; title: string; assigned_to: string | null }>();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message || 'Không thể xoá task',
      );
    }

    // Kèm title/assignedTo trong payload (khác createTask/updateTask, hàng đã
    // bị xoá nên không thể tra lại sau) — client cần 2 trường này để biết
    // task có liên quan tới người nhận không và hiển thị tên task trong
    // thông báo, kể cả khi họ chưa từng mở nhóm này để có sẵn task trong bộ
    // nhớ cục bộ.
    const payload = {
      groupId,
      taskId: data.id,
      title: data.title,
      assignedTo: data.assigned_to ?? undefined,
    };
    await this.emitToGroupRooms(supabase, groupId, 'group:taskDeleted', payload);
    await this.emitToGroupMembers(supabase, groupId, 'group:taskDeleted', payload);

    return { id: data.id };
  }

  // ---- Phòng họp của nhóm (1 phòng / nhóm, CRUD cho LEADER/ADMIN) ----

  private mapMeetingRow(row: any): GroupMeetingDto {
    return {
      groupId: row.group_id,
      link: row.link,
      title: row.title ?? undefined,
      startsAt: row.starts_at ?? undefined,
      durationMin: row.duration_min ?? undefined,
      createdBy: row.created_by ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async getMeeting(
    supabase: SupabaseClient,
    groupId: string,
  ): Promise<GroupMeetingDto | null> {
    // Đọc bằng client của người gọi — RLS `group_meetings_select` chỉ cho thành
    // viên nhóm thấy, người ngoài nhận về rỗng.
    const { data, error } = await supabase
      .from('group_meetings')
      .select('*')
      .eq('group_id', groupId)
      .maybeSingle();
    if (error) {
      // 42P01 = bảng chưa tạo (migration 40 chưa chạy) → coi như chưa có phòng.
      if (error.code === '42P01') return null;
      throw new InternalServerErrorException(error.message);
    }
    return data ? this.mapMeetingRow(data) : null;
  }

  async upsertMeeting(
    supabase: SupabaseClient,
    user: User,
    groupId: string,
    dto: UpsertGroupMeetingDto,
  ): Promise<GroupMeetingDto> {
    const role = await this.requireRole(supabase, user, groupId);
    if (!canInvite(role)) {
      throw new ForbiddenException(
        'Chỉ Trưởng nhóm hoặc Phó nhóm mới đặt được phòng họp',
      );
    }

    const existing = await supabase
      .from('group_meetings')
      .select('link')
      .eq('group_id', groupId)
      .maybeSingle<{ link: string }>();
    const isNewOrChangedLink = existing.data?.link !== dto.link;

    const row = {
      group_id: groupId,
      link: dto.link.trim(),
      title: dto.title?.trim() || null,
      starts_at: dto.startsAt ?? null,
      duration_min: dto.durationMin ?? null,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('group_meetings')
      .upsert(row, { onConflict: 'group_id' })
      .select('*')
      .single();
    if (error || !data) {
      if (error?.code === '42P01') {
        throw new InternalServerErrorException(
          'Tính năng phòng họp cần chạy migration 40_group_meetings.sql trên Supabase',
        );
      }
      throw new InternalServerErrorException(
        error?.message || 'Không thể lưu phòng họp',
      );
    }

    const meeting = this.mapMeetingRow(data);
    await this.emitToGroupRooms(supabase, groupId, 'group:meetingChanged', {
      groupId,
      meeting,
    });

    // Đăng một dòng vào khung chat khi link MỚI (tạo lần đầu, hoặc đổi link) —
    // không spam mỗi lần chỉ sửa tiêu đề / giờ.
    if (isNewOrChangedLink) {
      const actor =
        ((user.user_metadata as Record<string, unknown> | undefined)?.[
          'full_name'
        ] as string | undefined) ||
        user.email?.split('@')[0] ||
        'Một thành viên';
      const text = `📹 ${actor} đã mở phòng họp: ${meeting.link}`;
      const { data: msg } = await supabase
        .from('group_messages')
        .insert({ group_id: groupId, sender_id: user.id, message: text })
        .select('*')
        .single();
      if (msg) {
        const msgDto: GroupMessageDto = {
          ...this.mapMessageRow(msg),
          senderEmail: user.email,
        };
        await this.emitToGroupRooms(supabase, groupId, 'group:messageSent', {
          groupId,
          message: msgDto,
        });
        await this.emitToGroupMembers(supabase, groupId, 'group:messageSent', {
          groupId,
          message: msgDto,
        });
      }
    }

    return meeting;
  }

  async deleteMeeting(
    supabase: SupabaseClient,
    user: User,
    groupId: string,
  ): Promise<void> {
    const role = await this.requireRole(supabase, user, groupId);
    if (!canInvite(role)) {
      throw new ForbiddenException(
        'Chỉ Trưởng nhóm hoặc Phó nhóm mới gỡ được phòng họp',
      );
    }
    const { error } = await supabase
      .from('group_meetings')
      .delete()
      .eq('group_id', groupId);
    if (error && error.code !== '42P01') {
      throw new InternalServerErrorException(error.message);
    }
    await this.emitToGroupRooms(supabase, groupId, 'group:meetingChanged', {
      groupId,
      meeting: null,
    });
  }

  // ---- "Đã xem" cho chat nhóm (bảng group_message_reads, migration 42) ----

  async getMessageReads(
    supabase: SupabaseClient,
    groupId: string,
  ): Promise<{ userId: string; at: string }[]> {
    const { data, error } = await supabase
      .from('group_message_reads')
      .select('user_id, last_read_at')
      .eq('group_id', groupId);
    if (error) {
      if (error.code === '42P01') return []; // migration 42 chưa chạy
      throw new InternalServerErrorException(error.message);
    }
    return ((data ?? []) as { user_id: string; last_read_at: string }[]).map((r) => ({
      userId: r.user_id,
      at: r.last_read_at,
    }));
  }

  async markMessagesRead(
    supabase: SupabaseClient,
    user: User,
    groupId: string,
  ): Promise<{ at: string }> {
    await this.requireRole(supabase, user, groupId);
    const at = new Date().toISOString();
    const { error } = await supabase
      .from('group_message_reads')
      .upsert(
        { group_id: groupId, user_id: user.id, last_read_at: at },
        { onConflict: 'group_id,user_id' },
      );
    if (error) {
      if (error.code === '42P01') return { at }; // degrade: migration chưa chạy
      throw new InternalServerErrorException(error.message);
    }
    await this.emitToGroupRooms(supabase, groupId, 'group:messageRead', {
      groupId,
      userId: user.id,
      at,
    });
    return { at };
  }

  // ---- Thả cảm xúc / reactions (bảng group_message_reactions, migration 44) ----

  private static readonly ALLOWED_REACTIONS = ['❤️', '😆', '👍', '😮', '😢', '🙏'];

  async listReactions(
    supabase: SupabaseClient,
    groupId: string,
  ): Promise<{ messageId: string; emoji: string; userIds: string[] }[]> {
    const { data, error } = await supabase.rpc('list_group_message_reactions', {
      p_group_id: groupId,
    });
    if (error) {
      if (error.code === '42P01' || error.code === '42883') return [];
      throw new InternalServerErrorException(error.message);
    }
    return ((data ?? []) as { message_id: string; emoji: string; user_ids: string[] }[]).map(
      (r) => ({ messageId: r.message_id, emoji: r.emoji, userIds: r.user_ids }),
    );
  }

  async toggleReaction(
    supabase: SupabaseClient,
    user: User,
    groupId: string,
    messageId: string,
    emoji: string,
  ): Promise<{ added: boolean }> {
    await this.requireRole(supabase, user, groupId);
    if (!GroupsService.ALLOWED_REACTIONS.includes(emoji)) {
      throw new BadRequestException('Biểu cảm không hợp lệ');
    }

    // Tin nhắn phải thuộc đúng nhóm này.
    const { data: msg } = await supabase
      .from('group_messages')
      .select('id, group_id')
      .eq('id', messageId)
      .maybeSingle<{ id: string; group_id: string }>();
    if (!msg || msg.group_id !== groupId) {
      throw new NotFoundException('Không tìm thấy tin nhắn');
    }

    const { data: existing } = await supabase
      .from('group_message_reactions')
      .select('emoji')
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .eq('emoji', emoji)
      .maybeSingle();

    let added: boolean;
    if (existing) {
      const { error } = await supabase
        .from('group_message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', user.id)
        .eq('emoji', emoji);
      if (error) throw new InternalServerErrorException(error.message);
      added = false;
    } else {
      const { error } = await supabase
        .from('group_message_reactions')
        .insert({ message_id: messageId, user_id: user.id, emoji });
      if (error) {
        if (error.code === '42P01') {
          throw new InternalServerErrorException(
            'Tính năng thả cảm xúc cần chạy migration 44_group_message_reactions.sql',
          );
        }
        throw new InternalServerErrorException(error.message);
      }
      added = true;
    }

    await this.emitToGroupRooms(supabase, groupId, 'group:messageReaction', {
      groupId,
      messageId,
      emoji,
      userId: user.id,
      added,
    });
    return { added };
  }

  // ---- Ghim tin nhắn (Trưởng/Phó nhóm, migration 45) ----

  async setPinned(
    supabase: SupabaseClient,
    user: User,
    groupId: string,
    messageId: string,
    pinned: boolean,
  ): Promise<{ pinned: boolean }> {
    const role = await this.requireRole(supabase, user, groupId);
    if (!canInvite(role)) {
      throw new ForbiddenException(
        'Chỉ Trưởng nhóm hoặc Phó nhóm mới ghim được tin nhắn',
      );
    }

    const { data, error } = await supabase
      .from('group_messages')
      .update({
        pinned_at: pinned ? new Date().toISOString() : null,
        pinned_by: pinned ? user.id : null,
      })
      .eq('id', messageId)
      .eq('group_id', groupId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();
    if (error) {
      if (error.code === '42703') {
        throw new InternalServerErrorException(
          'Tính năng ghim tin cần chạy migration 45_group_message_pin.sql',
        );
      }
      throw new InternalServerErrorException(error.message);
    }
    if (!data) throw new NotFoundException('Không tìm thấy tin nhắn');

    await this.emitToGroupRooms(supabase, groupId, 'group:messagePinned', {
      groupId,
      messageId,
      pinned,
      pinnedBy: pinned ? user.id : null,
    });
    return { pinned };
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
    const senderRole = await this.requireRole(supabase, user, groupId);
    if (!canChat(senderRole)) {
      throw new ForbiddenException('Khách chỉ được xem, không thể nhắn tin');
    }

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

    const mentions = await this.sanitizeMentions(
      supabase,
      groupId,
      user.id,
      dto.mentions,
    );

    const insertRow: Record<string, unknown> = {
      group_id: groupId,
      sender_id: user.id,
      message: text || null,
      mentions: mentions ?? null,
      attachment_url: dto.attachmentUrl || null,
      attachment_name: dto.attachmentName || null,
      attachment_type: dto.attachmentType || null,
      attachment_size: dto.attachmentSize ?? null,
    };
    // Cột chỉ có sau migration 43 — gửi kèm chỉ khi có replyToId, để DB cũ vẫn
    // gửi tin thường được (PostgREST báo lỗi nếu key trỏ cột không tồn tại).
    if (dto.replyToId) insertRow['reply_to_id'] = dto.replyToId;

    const { data, error } = await supabase
      .from('group_messages')
      .insert(insertRow)
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
      senderName: (user.user_metadata as Record<string, unknown> | undefined)?.[
        'full_name'
      ] as string | undefined,
      ...(await this.buildReplySnippet(supabase, dto.replyToId)),
    };

    await this.emitToGroupRooms(supabase, groupId, 'group:messageSent', {
      groupId,
      message: msgDto,
    });
    await this.emitToGroupMembers(supabase, groupId, 'group:messageSent', {
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
    // Cùng lý do với sendMessage(): thành viên đang ẩn nhóm/chưa mở phòng
    // "calendar:" này sẽ không thấy bản sửa nếu chỉ bắn qua emitToGroupRooms.
    await this.emitToGroupMembers(supabase, groupId, 'group:messageUpdated', {
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
    // Cùng lý do với sendMessage()/editMessage(): thành viên đang ẩn nhóm sẽ
    // không thấy tin nhắn biến mất nếu chỉ bắn qua emitToGroupRooms.
    await this.emitToGroupMembers(supabase, groupId, 'group:messageDeleted', {
      groupId,
      message: msgDto,
    });

    return msgDto;
  }
}
