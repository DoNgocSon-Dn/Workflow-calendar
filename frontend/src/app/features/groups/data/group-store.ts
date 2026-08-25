import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Group,
  GroupInvite,
  GroupMember,
  GroupMessage,
  GroupMessageAttachment,
  GroupTask,
  GroupUpdate,
} from '../models/group.models';
import { GroupApiService } from '../services/group-api.service';
import { AuthStore } from '../../../core/auth/auth-store';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { SUPABASE_CLIENT } from '../../../core/supabase-client';
import { NotificationService } from '../../../core/services/notification.service';
import {
  DeadlinePhase,
  GroupMessageDraftInput,
  groupInvitationDraft,
  groupMentionDraft,
  groupMessageDraft,
  groupTaskAssignedDraft,
  groupTaskUpdatedDraft,
  systemNoticeDraft,
  taskDeadlineDraft,
} from '../../../core/services/notification-drafts';

/** Các tab của Group Workspace — khai báo ở store để luồng bên ngoài có thể
 *  yêu cầu mở đúng tab mà không phải import ngược vào component modal. */
export type WorkspaceTabRequest = 'members' | 'calendar' | 'tasks' | 'chat';

/** Thời gian bỏ qua tiếng vọng realtime của thao tác do chính mình gây ra. */
const SELF_ORIGIN_TTL_MS = 10_000;

/** Báo "sắp đến hạn" khi deadline còn trong khoảng này. */
const DEADLINE_SOON_MS = 24 * 60 * 60 * 1000;
/** Quét lại định kỳ để mốc deadline vẫn nổ khi tab mở lâu. */
const DEADLINE_SCAN_INTERVAL_MS = 5 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class GroupStore {
  private readonly api = inject(GroupApiService);
  private readonly authStore = inject(AuthStore);
  private readonly realtime = inject(RealtimeService);
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly notifications = inject(NotificationService);

  readonly groups = signal<Group[]>([]);
  readonly activeGroup = signal<Group | null>(null);
  readonly members = signal<GroupMember[]>([]);
  readonly tasks = signal<GroupTask[]>([]);
  readonly messages = signal<GroupMessage[]>([]);
  readonly loading = signal<boolean>(false);
  readonly activeWorkspaceModalOpen = signal<boolean>(false);
  /** Lời mời nhóm đang chờ mình phản hồi. */
  readonly pendingInvites = signal<GroupInvite[]>([]);

  /** Đặt bởi các luồng mở workspace từ bên ngoài (ví dụ click thông báo tin
   *  nhắn) để yêu cầu modal mở đúng tab thay vì tab mặc định. */
  readonly requestedWorkspaceTab = signal<WorkspaceTabRequest | null>(null);
  readonly activeWorkspaceTab = signal<WorkspaceTabRequest>('tasks');
  readonly unreadChatCount = signal<number>(0);
  /** Tin nhắn cần cuộn tới sau khi mở tab Trò chuyện. */
  readonly pendingChatMessageId = signal<string | null>(null);
  /** ID các nhóm có tin nhắn chưa đọc — cho sidebar "sáng lên" kiểu Messenger
   *  khi có người nhắn tới, kể cả nhóm không phải nhóm đang mở. Xoá khỏi set
   *  này khi người dùng mở nhóm đó (xem `selectGroup`). */
  readonly unreadMessageGroupIds = signal<ReadonlySet<string>>(new Set());

  private realtimeInitialized = false;
  private readonly selfOriginTaskIds = new Set<string>();

  constructor() {
    // Quét lại định kỳ để các mốc deadline đã qua vẫn được bắt khi tab mở lâu
    // — bổ trợ cho cron backend, không thay thế nó.
    setInterval(() => void this.scanMyTaskDeadlines(), DEADLINE_SCAN_INTERVAL_MS);
  }

  /**
   * Quét deadline của MỌI task được giao cho mình (không chỉ nhóm đang mở).
   *
   * FALLBACK, không phải realtime do server đẩy: nó bắt các mốc đã qua từ
   * trước khi người dùng mở app — lúc đó chưa có socket nên cron
   * `task:deadline` không tới được. Từ khi app mở, nguồn chính vẫn là cron
   * backend; hai đường dùng chung `id` ổn định nên không đẻ thông báo trùng.
   */
  private async scanMyTaskDeadlines(): Promise<void> {
    if (!this.authStore.session()) return;

    let tasks: GroupTask[];
    try {
      tasks = await this.api.getMyTasks();
    } catch (err) {
      console.error('Không tải được danh sách task để kiểm tra deadline:', err);
      return;
    }

    const now = Date.now();
    for (const task of tasks) {
      if (!task.dueDate || task.status === 'done') continue;

      const due = new Date(task.dueDate).getTime();
      if (Number.isNaN(due)) continue;
      if (due - now > DEADLINE_SOON_MS) continue;

      this.notifications.ingest(
        taskDeadlineDraft({
          taskId: task.id,
          groupId: task.groupId,
          groupName: this.groups().find((g) => g.id === task.groupId)?.name ?? null,
          title: task.title,
          dueDate: task.dueDate,
          phase: due < now ? 'overdue' : 'upcoming',
        }),
      );
    }
  }

  /** Lời mời nhóm đang chờ mình phản hồi. */
  async loadPendingInvites(): Promise<void> {
    if (!this.authStore.session()) return;
    try {
      const invites = await this.api.getMyInvites();
      const pendingList = invites.filter((i) => i.status === 'pending');
      this.pendingInvites.set(pendingList);

      for (const inv of pendingList) {
        this.notifications.ingest(
          groupInvitationDraft({
            inviteId: inv.id,
            groupId: inv.groupId,
            groupName: inv.groupName,
            inviterEmail: inv.inviterEmail,
            role: inv.role,
            status: inv.status,
            createdAt: inv.createdAt,
          }),
        );
      }
    } catch (err) {
      console.error('Không tải được lời mời nhóm:', err);
    }
  }

  async respondToInvite(inviteId: string, status: 'accepted' | 'declined'): Promise<void> {
    const invite = await this.api.respondInvite(inviteId, status);
    this.pendingInvites.update((list) => list.filter((i) => i.id !== inviteId));
    this.notifications.respond(`group-invitation-${inviteId}`, status);

    if (status === 'accepted') {
      // Vào nhóm rồi thì nhóm mới phải xuất hiện ở sidebar ngay, kèm join room
      // realtime để nhận tin nhắn/task từ lúc này.
      await this.loadGroups();
      const joined = this.groups().find((g) => g.id === invite.groupId);
      if (joined) {
        this.realtime.joinCalendar(joined.id);
        if (joined.calendarId) this.realtime.joinCalendar(joined.calendarId);
      }
    }
  }

  readonly activeGroupId = computed(() => this.activeGroup()?.id ?? null);

  readonly visibleGroups = computed(() => this.groups().filter((g) => !g.hidden));
  readonly hiddenGroups = computed(() => this.groups().filter((g) => g.hidden));

  private initRealtime(): void {
    if (this.realtimeInitialized) return;
    this.realtimeInitialized = true;
    this.realtime.connect();

    // Rejoin every known group's room after a reconnect (network blip, token
    // refresh) — join()s aren't remembered server-side across a fresh socket
    // handshake. Joining all groups (not just the active one) is what lets
    // message notifications keep arriving for groups the user isn't looking
    // at right now.
    this.realtime.onConnect(() => this.joinAllGroupRooms());

    // Mất mạng rồi nối lại: Socket.IO KHÔNG phát lại event đã lỡ, nên phải tự
    // kéo về phần bỏ sót. Dedupe theo id ổn định lo chuyện trùng lặp.
    this.realtime.onReconnect(() => {
      void this.loadPendingInvites();
      void this.scanMyTaskDeadlines();
      const activeId = this.activeGroupId();
      if (activeId) void this.loadMessages(activeId);
    });

    this.realtime.on<{ groupId: string; message: GroupMessage }>('group:messageSent', (payload) => {
      if (!payload?.message) return;
      const currentUser = this.authStore.user();
      const isFromOther = currentUser && payload.message.senderId !== currentUser.id;

      const targetGroupId = payload.groupId || payload.message.groupId;
      if (this.isActiveGroup(targetGroupId, payload.message.groupId)) {
        this.messages.update((list) => {
          if (list.some((m) => m.id === payload.message.id)) return list;
          return [...list, payload.message];
        });
        if (isFromOther && (!this.activeWorkspaceModalOpen() || this.activeWorkspaceTab() !== 'chat')) {
          this.unreadChatCount.update((count) => count + 1);
        }
      }
      this.notifyIncomingMessage(targetGroupId, payload.message);
    });

    // Supabase Realtime làm kênh dự phòng trực tiếp từ Cloud CSDL cho môi trường chạy nhiều backend local:
    // Vì CSDL Supabase là duy nhất, khi bất kỳ máy nào INSERT tin nhắn vào CSDL Supabase,
    // Supabase Cloud sẽ đẩy sự kiện trực tiếp về cho các client đang mở ở mọi máy.
    this.supabase
      .channel('supabase-realtime:group_messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages' },
        (payload) => {
          const row = payload.new as any;
          if (!row || !row.id || !row.group_id) return;
          const member = this.members().find((m) => m.userId === row.sender_id);
          const msg: GroupMessage = {
            id: row.id,
            groupId: row.group_id,
            senderId: row.sender_id,
            message: row.message ?? undefined,
            createdAt: row.created_at,
            editedAt: row.edited_at ?? undefined,
            deletedAt: row.deleted_at ?? undefined,
            attachmentUrl: row.attachment_url ?? undefined,
            attachmentName: row.attachment_name ?? undefined,
            attachmentType: row.attachment_type ?? undefined,
            attachmentSize: row.attachment_size ?? undefined,
            senderEmail: member?.email,
            senderName: member?.email ? member.email.split('@')[0] : undefined,
          };
          const currentUser = this.authStore.user();
          const isFromOther = currentUser && msg.senderId !== currentUser.id;

          if (this.isActiveGroup(msg.groupId)) {
            this.messages.update((list) => {
              if (list.some((m) => m.id === msg.id)) return list;
              return [...list, msg];
            });
            if (isFromOther && (!this.activeWorkspaceModalOpen() || this.activeWorkspaceTab() !== 'chat')) {
              this.unreadChatCount.update((count) => count + 1);
            }
          }
          this.notifyIncomingMessage(msg.groupId, msg);
        },
      )
      .subscribe();

    this.realtime.on<{ groupId: string; message: GroupMessage }>('group:messageUpdated', (payload) => {
      if (!payload?.message) return;
      if (!this.isActiveGroup(payload.groupId, payload.message.groupId)) return;
      this.messages.update((list) => list.map((m) => (m.id === payload.message.id ? payload.message : m)));
    });

    this.realtime.on<{ groupId: string; message: GroupMessage }>('group:messageDeleted', (payload) => {
      if (!payload?.message) return;
      if (!this.isActiveGroup(payload.groupId, payload.message.groupId)) return;
      this.messages.update((list) => list.map((m) => (m.id === payload.message.id ? payload.message : m)));
    });

    this.realtime.on<{ groupId: string; task: GroupTask }>('group:taskCreated', (payload) => {
      if (!payload?.task) return;
      if (this.isActiveGroup(payload.groupId, payload.task.groupId)) {
        this.tasks.update((list) => {
          if (list.some((t) => t.id === payload.task.id)) return list;
          return [payload.task, ...list];
        });
      }
      this.notifyTaskEvent(payload.groupId, payload.task, 'created');
    });

    this.realtime.on<{ groupId: string; task: GroupTask }>('group:taskUpdated', (payload) => {
      if (!payload?.task) return;
      if (this.isActiveGroup(payload.groupId, payload.task.groupId)) {
        this.tasks.update((list) => list.map((t) => (t.id === payload.task.id ? payload.task : t)));
      }
      this.notifyTaskEvent(payload.groupId, payload.task, 'updated');
    });

    this.realtime.on<{ groupId: string; taskId: string }>('group:taskDeleted', (payload) => {
      if (!payload?.taskId) return;
      if (this.isActiveGroup(payload.groupId)) {
        this.tasks.update((list) => list.filter((t) => t.id !== payload.taskId));
      }
    });

    // Ba sự kiện dưới đây đến từ room riêng của user (không phải room nhóm) nên
    // vẫn nhận được kể cả khi chưa mở nhóm — đó là điều kiện để nhóm đang ẩn tự
    // hiện lại lúc có tin nhắn mới.
    this.realtime.on<{ group: Group }>('group:updated', (payload) => {
      if (!payload?.group) return;
      this.groups.update((list) =>
        // `hidden` là trạng thái riêng của người nhận, còn payload phát cho cả
        // nhóm nên không mang nó theo — giữ nguyên giá trị đang có tại client.
        list.map((g) => (g.id === payload.group.id ? { ...payload.group, hidden: g.hidden } : g)),
      );
      if (this.activeGroupId() === payload.group.id) {
        this.activeGroup.update((g) => (g ? { ...payload.group, hidden: g.hidden } : g));
      }
    });

    this.realtime.on<{ groupId: string }>('group:deleted', (payload) => {
      if (!payload?.groupId) return;
      this.removeGroupLocally(payload.groupId);
    });

    this.realtime.on<{ groupId: string }>('group:unhidden', (payload) => {
      if (!payload?.groupId) return;
      this.setHiddenLocally(payload.groupId, false);
    });

    // ---- Ba listener dưới đây đăng ký CÙNG guard realtimeInitialized ở trên,
    // nên vẫn chỉ bind đúng một lần cho cả vòng đời ứng dụng. ----

    // Lời mời nhóm: bắn vào room riêng của người được mời (họ chưa là thành viên).
    this.realtime.on<{ invite: GroupInvite }>('group:invited', (payload) => {
      if (!payload?.invite) return;
      this.pendingInvites.update((list) => [
        payload.invite,
        ...list.filter((i) => i.id !== payload.invite.id),
      ]);
      this.notifications.ingest(
        groupInvitationDraft({
          inviteId: payload.invite.id,
          groupId: payload.invite.groupId,
          groupName: payload.invite.groupName,
          inviterEmail: payload.invite.inviterEmail,
          role: payload.invite.role,
          status: 'pending',
          createdAt: payload.invite.createdAt,
        }),
      );
    });

    // Deadline do cron backend đẩy (không phải tính ở client).
    this.realtime.on<{
      taskId: string;
      groupId: string;
      groupName: string | null;
      title: string;
      dueDate: string;
      phase: DeadlinePhase;
    }>('task:deadline', (payload) => {
      if (!payload?.taskId) return;
      this.notifications.ingest(taskDeadlineDraft(payload));
    });

    // Thông báo hệ thống: broadcast hoặc gửi riêng cho một user.
    this.realtime.on<{
      notification: {
        id: string;
        title: string;
        message: string;
        level: 'info' | 'warning' | 'maintenance';
        createdAt: string;
      };
    }>('system:notice', (payload) => {
      if (!payload?.notification) return;
      this.notifications.ingest(systemNoticeDraft(payload.notification));
    });
  }

  private setHiddenLocally(groupId: string, hidden: boolean): void {
    this.groups.update((list) => list.map((g) => (g.id === groupId ? { ...g, hidden } : g)));
  }

  private removeGroupLocally(groupId: string): void {
    this.groups.update((list) => list.filter((g) => g.id !== groupId));
    if (this.activeGroupId() === groupId) {
      this.activeGroup.set(null);
      this.activeWorkspaceModalOpen.set(false);
      this.members.set([]);
      this.tasks.set([]);
      this.messages.set([]);
    }
  }

  private isActiveGroup(groupId?: string, altGroupId?: string): boolean {
    const active = this.activeGroup();
    if (!active) return false;
    const g1 = (groupId || '').trim().toLowerCase();
    const g2 = (altGroupId || '').trim().toLowerCase();
    const activeId = (active.id || '').trim().toLowerCase();
    const activeCalId = (active.calendarId || '').trim().toLowerCase();

    if (!g1 && !g2) return true;

    return (
      (!!activeId && (g1 === activeId || g2 === activeId)) ||
      (!!activeCalId && (g1 === activeCalId || g2 === activeCalId)) ||
      (this.activeWorkspaceModalOpen() && (!g1 || g1 === activeId || g1 === activeCalId))
    );
  }

  /** Joins every group's socket room so realtime events (messages, tasks...)
   *  keep arriving even for groups whose workspace isn't currently open —
   *  required for the notification bell to see messages from other groups. */
  private joinAllGroupRooms(): void {
    for (const group of this.groups()) {
      this.realtime.joinCalendar(group.id);
      if (group.calendarId) this.realtime.joinCalendar(group.calendarId);
    }
  }

  private notifyIncomingMessage(groupId: string, message: GroupMessage): void {
    const currentUser = this.authStore.user();
    if (!currentUser || message.senderId === currentUser.id) return;

    this.markGroupUnread(groupId || message.groupId);

    const group = this.groups().find((g) => g.id === groupId || g.id === message.groupId);
    const text = message.message ?? (message.attachmentName ? `Đã gửi tệp: ${message.attachmentName}` : '');
    const input: GroupMessageDraftInput = {
      senderId: message.senderId,
      senderName: message.senderEmail ?? 'Một thành viên',
      groupId: group?.id ?? message.groupId,
      groupName: group?.name ?? 'nhóm của bạn',
      messageId: message.id,
      messageText: text,
      createdAt: message.createdAt,
    };

    // Tin nhắn của người khác LUÔN vào Notification Center — kể cả khi đang mở
    // đúng nhóm đó và đang nhìn thẳng vào khung chat. Chuông là nhật ký hoạt
    // động, không phải thứ chỉ để báo cái mình chưa thấy; điều kiện duy nhất
    // chặn thông báo là tin do chính mình gửi (đã lọc ở đầu hàm).
    if (this.mentionsCurrentUser(text, currentUser.email)) {
      this.notifications.ingest(groupMentionDraft(input));
      return;
    }

    this.notifications.ingest(groupMessageDraft(input));
  }

  /** Không đánh dấu unread nếu người dùng đang nhìn thẳng vào đúng tab Chat
   *  của đúng nhóm đó — mới nhắn xong đọc ngay thì đâu cần "sáng lên" báo lại. */
  private markGroupUnread(groupId: string): void {
    if (!groupId) return;
    if (this.activeGroupId() === groupId && this.activeWorkspaceModalOpen() && this.activeWorkspaceTab() === 'chat') {
      return;
    }
    this.unreadMessageGroupIds.update((ids) => (ids.has(groupId) ? ids : new Set(ids).add(groupId)));
  }

  /** Nhận diện "@tên" hoặc email đầy đủ của người dùng trong nội dung tin nhắn. */
  private mentionsCurrentUser(text: string, email: string | undefined): boolean {
    if (!text || !email) return false;
    const lower = text.toLowerCase();
    const localPart = email.split('@')[0].toLowerCase();
    return lower.includes(email.toLowerCase()) || lower.includes(`@${localPart}`);
  }

  private notifyTaskEvent(groupId: string, task: GroupTask, kind: 'created' | 'updated'): void {
    const currentUserId = this.authStore.user()?.id;
    if (!currentUserId) return;
    // Chỉ báo việc liên quan trực tiếp tới mình, và không báo lại thao tác do
    // chính mình vừa thực hiện.
    if (task.assignedTo !== currentUserId) return;
    if (this.selfOriginTaskIds.has(task.id)) {
      this.selfOriginTaskIds.delete(task.id);
      return;
    }

    const group = this.groups().find((g) => g.id === groupId || g.id === task.groupId);
    const input = {
      taskId: task.id,
      groupId: group?.id ?? task.groupId,
      groupName: group?.name ?? 'nhóm của bạn',
      title: task.title,
      status: task.status,
      assignedTo: task.assignedTo,
      createdAt: task.createdAt,
    };

    this.notifications.ingest(
      kind === 'created' ? groupTaskAssignedDraft(input) : groupTaskUpdatedDraft(input),
    );
  }

  /** Đánh dấu task vừa được chính người dùng này sửa, để bỏ qua tiếng vọng
   *  realtime của chính thao tác đó (server không gửi kèm "ai vừa sửa"). */
  private markTaskSelfOrigin(taskId: string): void {
    this.selfOriginTaskIds.add(taskId);
    setTimeout(() => this.selfOriginTaskIds.delete(taskId), SELF_ORIGIN_TTL_MS);
  }

  async loadGroups(): Promise<void> {
    if (!this.authStore.session()) return;
    try {
      this.loading.set(true);
      this.initRealtime();
      const list = await this.api.getGroups();
      this.groups.set(list);
      this.joinAllGroupRooms();
    } catch (err) {
      console.error('Lỗi khi tải danh sách nhóm:', err);
    } finally {
      this.loading.set(false);
    }

    // Bắt kịp những gì đã xảy ra lúc chưa mở app: lời mời đang chờ và các mốc
    // deadline mà cron đã bắn khi socket còn chưa kết nối.
    void this.loadPendingInvites();
    void this.scanMyTaskDeadlines();
  }

  async createGroup(name: string, description?: string, color?: string): Promise<Group> {
    const newGroup = await this.api.createGroup(name, description, color);
    this.groups.update((prev) => [newGroup, ...prev]);
    this.initRealtime();
    this.realtime.joinCalendar(newGroup.id);
    if (newGroup.calendarId) this.realtime.joinCalendar(newGroup.calendarId);
    return newGroup;
  }

  async updateGroup(groupId: string, updates: GroupUpdate): Promise<Group> {
    const updated = await this.api.updateGroup(groupId, updates);
    this.groups.update((list) =>
      list.map((g) => (g.id === groupId ? { ...updated, hidden: g.hidden } : g)),
    );
    if (this.activeGroupId() === groupId) {
      this.activeGroup.update((g) => (g ? { ...updated, hidden: g.hidden } : g));
    }
    return updated;
  }

  async deleteGroup(groupId: string): Promise<void> {
    await this.api.deleteGroup(groupId);
    this.removeGroupLocally(groupId);
  }

  async setGroupHidden(groupId: string, hidden: boolean): Promise<void> {
    // Cập nhật trước rồi mới gọi API: đây là thao tác một chạm trên sidebar nên
    // độ trễ mạng sẽ khiến nút trông như không ăn.
    this.setHiddenLocally(groupId, hidden);
    try {
      await this.api.setGroupHidden(groupId, hidden);
    } catch (err) {
      this.setHiddenLocally(groupId, !hidden);
      throw err;
    }
    if (hidden && this.activeGroupId() === groupId) {
      this.closeWorkspaceModal();
    }
  }

  /** Bỏ đúng một nhóm khỏi set "có tin chưa đọc" — gọi khi người dùng thực sự
   *  nhìn vào nhóm đó: lúc mở workspace (`selectGroup`) VÀ lúc chuyển sang tab
   *  Chat của nhóm đang mở sẵn (modal không đóng/mở lại nên `selectGroup`
   *  không chạy lại — thiếu chỗ gọi này thì sidebar cứ sáng dù đã đọc xong). */
  clearGroupUnread(groupId: string): void {
    this.unreadMessageGroupIds.update((ids) => {
      if (!ids.has(groupId)) return ids;
      const next = new Set(ids);
      next.delete(groupId);
      return next;
    });
  }

  /** Mở workspace của nhóm và nhảy thẳng vào tab Trò chuyện — dùng cho luồng
   *  click thông báo tin nhắn. `messageId` (nếu có) sẽ được cuộn tới. */
  async openGroupChat(groupId: string, messageId?: string): Promise<void> {
    const group = this.groups().find((g) => g.id === groupId);
    if (!group) return;
    this.requestedWorkspaceTab.set('chat');
    this.pendingChatMessageId.set(messageId ?? null);
    await this.selectGroup(group);
  }

  async selectGroup(group: Group): Promise<void> {
    this.activeGroup.set(group);
    this.activeWorkspaceModalOpen.set(true);
    this.clearGroupUnread(group.id);
    // Đọc rồi xoá ngay trong cùng chỗ — chỉ MỘT nơi tiêu thụ cờ này, tránh
    // hai chỗ khác nhau cùng đọc rồi dẫm lên nhau.
    const requestedTab = this.requestedWorkspaceTab();
    this.requestedWorkspaceTab.set(null);
    if (requestedTab === 'chat') {
      this.unreadChatCount.set(0);
      this.activeWorkspaceTab.set('chat');
    } else {
      this.activeWorkspaceTab.set('tasks');
    }

    this.initRealtime();
    this.realtime.joinCalendar(group.id);
    if (group.calendarId) {
      this.realtime.joinCalendar(group.calendarId);
    }

    await Promise.all([this.loadMembers(group.id), this.loadTasks(group.id), this.loadMessages(group.id)]);
  }

  async loadMembers(groupId: string): Promise<void> {
    try {
      const res = await this.api.getGroup(groupId);
      this.members.set(res.members);
    } catch (err) {
      console.error('Lỗi khi tải thành viên nhóm:', err);
    }
  }

  /** Gửi lời mời (pending). Người được mời chỉ thành thành viên sau khi họ
   *  chấp nhận, nên KHÔNG thêm vào `members` ở đây nữa. */
  async inviteMember(groupId: string, email: string, role?: string): Promise<GroupInvite> {
    return this.api.inviteMember(groupId, email, role);
  }

  async updateMemberRole(groupId: string, userId: string, role: string): Promise<GroupMember> {
    const updated = await this.api.updateMemberRole(groupId, userId, role);
    this.members.update((prev) =>
      prev.map((m) => (m.userId === userId ? { ...m, ...updated } : m)),
    );
    return updated;
  }

  /**
   * Chuyển quyền trưởng nhóm.
   *
   * Backend trả về TOÀN BỘ danh sách thành viên đã cập nhật vì thao tác này
   * đổi vai trò của HAI người cùng lúc (người nhận lên trưởng nhóm, người
   * giao xuống quản trị viên) — vá từng hàng một sẽ có khoảnh khắc danh sách
   * hiển thị hai trưởng nhóm.
   */
  async transferLeadership(groupId: string, userId: string): Promise<void> {
    const members = await this.api.transferLeadership(groupId, userId);
    this.members.set(members);

    // ownerId trên nhóm là nguồn xác định trưởng nhóm — không cập nhật thì
    // giao diện vẫn tưởng người cũ đang giữ ghế.
    this.groups.update((list) =>
      list.map((g) => (g.id === groupId ? { ...g, ownerId: userId } : g)),
    );
  }

  async removeMember(groupId: string, userId: string): Promise<void> {
    await this.api.removeMember(groupId, userId);
    this.members.update((prev) => prev.filter((m) => m.userId !== userId));
  }

  async loadTasks(groupId: string): Promise<void> {
    try {
      const list = await this.api.getTasks(groupId);
      this.tasks.set(list);
    } catch (err) {
      console.error('Lỗi khi tải task nhóm:', err);
    }
  }

  async createTask(
    groupId: string,
    title: string,
    description?: string,
    status?: string,
    assignedTo?: string,
    dueDate?: string,
  ): Promise<GroupTask> {
    const task = await this.api.createTask(groupId, title, description, status, assignedTo, dueDate);
    this.markTaskSelfOrigin(task.id);
    this.tasks.update((prev) => {
      if (prev.some((t) => t.id === task.id)) return prev;
      return [task, ...prev];
    });
    return task;
  }

  async updateTaskStatus(groupId: string, taskId: string, status: 'todo' | 'in_progress' | 'done'): Promise<void> {
    await this.updateTask(groupId, taskId, { status });
  }

  async updateTask(groupId: string, taskId: string, updates: Partial<GroupTask>): Promise<GroupTask> {
    this.markTaskSelfOrigin(taskId);
    const updated = await this.api.updateTask(groupId, taskId, updates);
    this.tasks.update((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    return updated;
  }

  async deleteTask(groupId: string, taskId: string): Promise<void> {
    await this.api.deleteTask(groupId, taskId);
    this.tasks.update((prev) => prev.filter((t) => t.id !== taskId));
  }

  async loadMessages(groupId: string): Promise<void> {
    try {
      const list = await this.api.getMessages(groupId);
      this.messages.set(list);
    } catch (err) {
      console.error('Lỗi khi tải tin nhắn nhóm:', err);
    }
  }

  async sendMessage(groupId: string, text: string, attachment?: GroupMessageAttachment): Promise<GroupMessage> {
    const msg = await this.api.sendMessage(groupId, text, attachment);
    this.messages.update((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
    return msg;
  }

  async editMessage(groupId: string, messageId: string, text: string): Promise<GroupMessage> {
    const msg = await this.api.editMessage(groupId, messageId, text);
    this.messages.update((prev) => prev.map((m) => (m.id === messageId ? msg : m)));
    return msg;
  }

  async deleteMessage(groupId: string, messageId: string): Promise<GroupMessage> {
    const msg = await this.api.deleteMessage(groupId, messageId);
    this.messages.update((prev) => prev.map((m) => (m.id === messageId ? msg : m)));
    return msg;
  }

  async uploadAttachment(groupId: string, file: File): Promise<GroupMessageAttachment> {
    const extension = file.name.split('.').pop() ?? 'bin';
    const path = `${groupId}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await this.supabase.storage
      .from('group-attachments')
      .upload(path, file);
    if (uploadError) throw uploadError;

    const { data } = this.supabase.storage.from('group-attachments').getPublicUrl(path);
    return {
      url: data.publicUrl,
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
    };
  }

  closeWorkspaceModal(): void {
    this.activeWorkspaceModalOpen.set(false);
  }
}
