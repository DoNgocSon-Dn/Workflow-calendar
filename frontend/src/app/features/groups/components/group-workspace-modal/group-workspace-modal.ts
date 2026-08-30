import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { AuthStore } from '../../../../core/auth/auth-store';
import { Clock } from '../../../../core/clock';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { DialogService } from '../../../../core/services/dialog.service';
import { NotificationQueue } from '../../../../core/realtime/notification-queue';
import { Icon } from '../../../../shared/components/icon/icon';
import { CharCounter } from '../../../../shared/components/char-counter/char-counter';
import { CalendarStore } from '../../../calendar/data/calendar-store';
import {
  addMinutes,
  formatTime24,
  fromDateInputValue,
  parseTime24,
  toDateInputValue,
} from '../../../calendar/utils/date-utils';
import { GroupStore } from '../../data/group-store';
import {
  ASSIGNABLE_GROUP_ROLES,
  DEFAULT_GROUP_ROLE,
  GroupRole,
  canAssignRole,
  canApproveJoinRequests,
  canChat,
  canInvite,
  canManage,
  canSeeGroupCalendar,
  canSeeGroupChat,
  canSeeGroupMembers,
  canSeeGroupTasks,
  canTransferLeadership,
  groupRoleLabelKey,
  normalizeGroupRole,
} from '../../models/group-role';
import {
  GROUP_COLOR_HEX,
  GROUP_COLORS,
  GroupColor,
  GroupJoinRequest,
  GroupMember,
  GroupMessage,
  GroupMessageAttachment,
  GroupMessageMention,
  GroupTask,
  PollDetail,
} from '../../models/group.models';
import { MentionOption, MentionPopup } from '../mention-popup/mention-popup';
import { ForwardTargetModal } from '../forward-target-modal/forward-target-modal';
import { CreatePollModal } from '../create-poll-modal/create-poll-modal';
import { createMeetingRoomLink } from '../../../../shared/utils/meeting-link.util';
import {
  ActiveMentionQuery,
  MENTION_ALL_LABEL,
  MessageSegment,
  findActiveMention,
  formatExternalUrl,
  insertMention,
  normalizeForMentionSearch,
  parseTextUrls,
  splitMessageSegments,
} from '../../utils/mention.util';

type WorkspaceTab = 'members' | 'calendar' | 'tasks' | 'chat';

/** Làm tròn lên mốc 15 phút gần nhất — giờ gợi ý cho một cuộc họp nên là mốc
 *  tròn, không phải "14:37". */
function nextQuarterHour(now: Date): Date {
  const rounded = new Date(now);
  rounded.setSeconds(0, 0);
  rounded.setMinutes(Math.ceil(rounded.getMinutes() / 15) * 15);
  return rounded;
}

/**
 * Nội dung tin nhắn báo phòng họp vào chat nhóm.
 *
 * Gộp thành MỘT tin nhắn thay vì ba tin rời (tiêu đề / giờ / link): mỗi tin
 * nhắn là một lượt thông báo tới mọi thành viên, ba tin liên tiếp cho cùng
 * một cuộc họp là ba lần rung máy vô cớ.
 */
function meetAnnouncement(
  title: string,
  start: Date,
  end: Date,
  link: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const day = start.toLocaleDateString(t('common.dateLocale'), {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return [
    title,
    t('meet.announceTime', { time: `${day}, ${formatTime24(start)} - ${formatTime24(end)}` }),
    t('meet.announceJoin', { link }),
  ].join('\n');
}

@Component({
  selector: 'app-group-workspace-modal',
  templateUrl: './group-workspace-modal.html',
  styleUrl: './group-workspace-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Icon, MentionPopup, CharCounter, ForwardTargetModal, CreatePollModal],
})
export class GroupWorkspaceModal {
  protected readonly store = inject(GroupStore);
  private readonly authStore = inject(AuthStore);
  protected readonly i18n = inject(TranslationService);
  private readonly dialog = inject(DialogService);
  private readonly calendarStore = inject(CalendarStore);
  private readonly clock = inject(Clock);
  private readonly notificationQueue = inject(NotificationQueue);

  readonly closed = output<void>();

  // Mirror store.activeWorkspaceTab() thay vì giữ signal riêng rồi tự đồng bộ
  // hai chiều — component chỉ mount SAU khi selectGroup() đã set xong tab
  // (activeWorkspaceModalOpen chỉ bật ở cuối selectGroup), nên đọc thẳng từ
  // store là đủ và tránh được một nguồn lệch trạng thái.
  protected readonly activeTab = computed(() => this.store.activeWorkspaceTab());
  protected readonly updatingRoleUserId = signal<string | null>(null);
  protected readonly transferringUserId = signal<string | null>(null);
  protected readonly openRoleMenuUserId = signal<string | null>(null);
  protected readonly inviteRoleMenuOpen = signal<boolean>(false);

  protected readonly currentUserId = computed(() => this.authStore.user()?.id ?? null);

  /**
   * Vai trò của người đang xem.
   *
   * `ownerId` của nhóm được ưu tiên hơn hàng trong danh sách thành viên: nếu
   * hai chỗ lệch nhau thì giao diện vẫn khớp với thứ bậc mà backend dùng để
   * kiểm tra quyền, thay vì hiện nút rồi bị API từ chối.
   */
  protected readonly currentRole = computed<GroupRole | null>(() => {
    const userId = this.currentUserId();
    if (!userId) return null;
    if (this.store.activeGroup()?.ownerId === userId) return GroupRole.LEADER;
    const rawRole = this.store.members().find((m) => m.userId === userId)?.role;
    if (!rawRole) return null;
    return normalizeGroupRole(rawRole);
  });

  protected readonly isLeader = computed(() => this.currentRole() === GroupRole.LEADER);
  protected readonly canInviteMembers = computed(() => canInvite(this.currentRole()));
  protected readonly canTransfer = computed(() => canTransferLeadership(this.currentRole()));
  protected readonly canUserChat = computed(() => canChat(this.currentRole()));
  protected readonly canUserSeeGroupCalendar = computed(() => canSeeGroupCalendar(this.currentRole()));
  protected readonly canUserSeeTasks = computed(() => canSeeGroupTasks(this.currentRole()));
  protected readonly canUserSeeMembers = computed(() => canSeeGroupMembers(this.currentRole()));
  protected readonly canUserSeeChat = computed(() => canSeeGroupChat(this.currentRole()));
  protected readonly canUserApproveJoinRequests = computed(() => canApproveJoinRequests(this.currentRole()));

  /** Có hiện cột thao tác trong danh sách thành viên không. Thành viên thường
   *  không quản lý được ai nên cả cột bị ẩn. */
  protected readonly canManageAnyone = computed(() =>
    canManage(this.currentRole(), GroupRole.MEMBER),
  );

  protected readonly canModerateChat = computed(() => canInvite(this.currentRole()));

  /** Vai trò chọn được — luôn là ADMIN/MEMBER, và lọc thêm theo cấp người dùng. */
  protected readonly assignableRoles = computed(() =>
    ASSIGNABLE_GROUP_ROLES.filter((r) => canAssignRole(this.currentRole(), r)),
  );

  protected roleLabel(role: GroupRole): string {
    return this.i18n.t(groupRoleLabelKey(role));
  }

  protected roleHint(role: GroupRole): string {
    return this.i18n.t(`groupRole.${role.toLowerCase()}Hint`);
  }

  /** `m` có nằm dưới quyền của người đang xem không. */
  protected canManageMember(m: GroupMember): boolean {
    if (m.userId === this.currentUserId()) return false;
    return canManage(this.currentRole(), m.role);
  }

  /** Chuyển quyền chỉ dành cho trưởng nhóm, và chỉ nhắm vào người khác. */
  protected canTransferTo(m: GroupMember): boolean {
    return this.canTransfer() && m.role !== GroupRole.LEADER;
  }

  /** Tên hiển thị cho một thành viên — ưu tiên tên thật, rồi mới tới phần
   *  trước "@" của email (KHÔNG BAO GIỜ email đầy đủ: lộ cả @gmail.com trong
   *  danh sách chọn người phụ trách thì vừa dài dòng vừa không phải là tên).
   *  Cùng thứ tự ưu tiên với `senderDisplayName` bên khung chat. */
  protected memberDisplayName(
    member: Pick<GroupMember, 'name' | 'email'> | undefined,
    fallback = this.i18n.t('group.memberFallback'),
  ): string {
    return member?.name || member?.email?.split('@')[0] || fallback;
  }


  protected readonly todoTasks = computed(() => this.store.tasks().filter((t) => t.status === 'todo'));
  protected readonly inProgressTasks = computed(() =>
    this.store.tasks().filter((t) => t.status === 'in_progress'),
  );
  protected readonly doneTasks = computed(() => this.store.tasks().filter((t) => t.status === 'done'));

  // Member invite form
  private static readonly EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  protected readonly copyFeedback = signal<string | null>(null);
  protected readonly inviteEmail = signal('');
  protected readonly inviteRole = signal<GroupRole>(DEFAULT_GROUP_ROLE);
  protected readonly inviting = signal(false);
  protected readonly inviteError = signal<string | null>(null);
  protected readonly inviteSuccess = signal<string | null>(null);
  protected readonly inviteEmailValid = computed(() =>
    GroupWorkspaceModal.EMAIL_PATTERN.test(this.inviteEmail().trim()),
  );

  // Task form
  protected readonly taskTitle = signal('');
  protected readonly taskDescription = signal('');
  protected readonly taskAssignedTo = signal('');
  protected readonly taskDueDate = signal('');
  protected readonly creatingTask = signal(false);

  // Ô chọn người phụ trách khi tạo task — dropdown tự build (không dùng
  // <select> gốc của trình duyệt) vì phần danh sách xổ ra của <select> do hệ
  // điều hành vẽ, CSS không đổi màu/theme được, luôn ra nền sáng lạc quẻ.
  protected readonly assigneeMenuOpen = signal(false);
  protected readonly assigneeLabel = computed(() => {
    const id = this.taskAssignedTo();
    if (!id) return this.i18n.t('group.selectAssignee');
    const member = this.store.members().find((m) => m.userId === id);
    return this.memberDisplayName(member, id);
  });

  toggleAssigneeMenu(): void {
    this.assigneeMenuOpen.update((open) => !open);
  }

  closeAssigneeMenu(): void {
    this.assigneeMenuOpen.set(false);
  }

  selectAssignee(userId: string): void {
    this.taskAssignedTo.set(userId);
    this.closeAssigneeMenu();
  }

  // Chat form
  protected readonly chatInput = viewChild<ElementRef<HTMLTextAreaElement>>('chatInput');
  protected readonly chatMessage = signal('');
  protected readonly sendingChat = signal(false);
  protected readonly uploadingAttachment = signal(false);
  protected readonly attachmentFile = signal<File | null>(null);
  protected readonly attachmentError = signal<string | null>(null);

  // Chat message edit
  protected readonly editingMessageId = signal<string | null>(null);
  protected readonly editingText = signal('');

  // Chat: trả lời / trích dẫn + menu chuột phải + thả cảm xúc
  protected readonly replyingTo = signal<GroupMessage | null>(null);
  /** Menu ngữ cảnh: chuột phải (desktop) hoặc nhấn giữ (mobile) một tin nhắn. */
  protected readonly msgMenu = signal<{ msg: GroupMessage; x: number; y: number } | null>(null);
  /** Độ dịch ngang khi đang vuốt-để-trả-lời (mobile). */
  protected readonly swipeDx = signal<{ id: string; dx: number } | null>(null);
  private swipeState: {
    id: string;
    startX: number;
    startY: number;
    active: boolean;
    holdTimer: number | null;
  } | null = null;

  /** Bộ biểu cảm cố định — khớp danh sách backend (ALLOWED_REACTIONS). */
  protected readonly REACTION_EMOJIS = ['❤️', '😆', '👍', '😮', '😢', '🙏'] as const;

  // Chat: cuộn thông minh + vạch chia ngày
  private prevChatMsgCount = 0;
  /** Số tin mới tới trong lúc người dùng đang cuộn lên đọc tin cũ. */
  protected readonly newChatMessages = signal(0);
  /** Nhãn ngày ghim dính mép trên khung chat (null = đang ở đầu, tự ẩn). */
  protected readonly stickyDay = signal<string | null>(null);
  private stickyRaf = 0;

  // Task reassignment
  protected readonly reassigningTaskId = signal<string | null>(null);

  // Group edit / delete / hide
  protected readonly groupColors = GROUP_COLORS;
  protected readonly groupColorHex = GROUP_COLOR_HEX;
  protected readonly editingGroup = signal(false);
  protected readonly editName = signal('');
  protected readonly editDescription = signal('');
  protected readonly editColor = signal<GroupColor>('blue');
  protected readonly savingGroup = signal(false);
  protected readonly groupError = signal<string | null>(null);
  protected readonly deletingGroup = signal(false);
  protected readonly isHidden = computed(() => this.store.activeGroup()?.hidden === true);

  private static readonly MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

  constructor() {
    // Đang nhìn tab Chat + có tin → đánh dấu đã đọc (store tự bóp ga 3s).
    effect(() => {
      const msgs = this.store.messages();
      const group = this.store.activeGroup();
      if (!group || this.activeTab() !== 'chat' || msgs.length === 0) return;
      untracked(() => this.store.markGroupMessagesRead(group.id));
    });

    // Nạp chi tiết cho các bình chọn vừa xuất hiện trong dòng chat.
    effect(() => {
      const msgs = this.store.messages();
      const group = this.store.activeGroup();
      if (!group) return;
      const loaded = untracked(() => this.store.polls());
      for (const m of msgs) {
        if (m.pollId && !loaded[m.pollId]) {
          untracked(() => void this.store.loadPoll(group.id, m.pollId!));
        }
      }
    });

    effect(() => {
      const msgs = this.store.messages();
      if (this.activeTab() !== 'chat' || msgs.length === 0) return;

      const targetId = untracked(() => this.store.pendingChatMessageId());
      const prevCount = untracked(() => this.prevChatMsgCount);
      const lastMsg = msgs[msgs.length - 1];
      const lastIsMine = lastMsg?.senderId === untracked(() => this.currentUserId());
      const added = msgs.length - prevCount;
      this.prevChatMsgCount = msgs.length;

      setTimeout(() => {
        const container = document.querySelector('.chat-messages') as HTMLElement | null;
        if (!container) return;

        // Có tin nhắn cần focus (mở từ thông báo) → nhảy tới đúng nó.
        const target = targetId ? document.getElementById(`chat-msg-${targetId}`) : null;
        if (target) {
          target.scrollIntoView({ block: 'center' });
          target.classList.add('chat-msg-row--focused');
          setTimeout(() => target.classList.remove('chat-msg-row--focused'), 2000);
          if (targetId) this.store.pendingChatMessageId.set(null);
          return;
        }

        const distanceFromBottom =
          container.scrollHeight - container.scrollTop - container.clientHeight;
        const nearBottom = distanceFromBottom < 140;

        // Auto-scroll CHỈ khi: đang ở gần đáy sẵn, hoặc chính mình vừa gửi, hoặc
        // đây là lần nạp đầu (prevCount 0). Đang cuộn lên đọc tin cũ mà người
        // khác nhắn → KHÔNG giật xuống, chỉ đếm vào nút "↓ tin nhắn mới".
        if (prevCount === 0 || nearBottom || lastIsMine) {
          container.scrollTop = container.scrollHeight;
          this.newChatMessages.set(0);
        } else if (added > 0) {
          this.newChatMessages.update((n) => n + added);
        }
        this.updateStickyDay(container);
      }, 50);
    });

    // Link mời + yêu cầu tham gia chỉ admin/leader xem được (backend trả 403
    // cho người khác) — chỉ tải khi mở đúng tab Thành viên với đúng quyền,
    // tránh gọi API thừa (và lỗi 403 vô ích) cho thành viên thường.
    effect(() => {
      const group = this.store.activeGroup();
      if (this.activeTab() !== 'members' || !this.canInviteMembers() || !group) return;

      const groupId = untracked(() => group.id);
      void this.store.loadInviteLink(groupId);
      void this.store.loadGroupInvites(groupId);
      void this.loadJoinCode(groupId);
      if (this.canUserApproveJoinRequests()) {
        void this.store.loadPendingJoinRequests(groupId);
      }
    });

    // Đá người dùng khỏi tab họ không có quyền xem, về tab an toàn nhất.
    effect(() => {
      // CHỜ tới khi biết chắc vai trò. Ngay sau khi mở workspace, danh sách
      // thành viên chưa tải xong nên currentRole() = null với người KHÔNG phải
      // trưởng nhóm; lúc đó mọi canUserSee*() đều false và hai nhánh
      // calendar <-> chat set qua set lại nhau thành VÒNG LẶP VÔ TẬN, treo cả
      // tab (chỉ trưởng nhóm thoát vì role của họ suy được từ ownerId ngay).
      if (!this.currentRole()) return;

      const tab = this.activeTab();
      if (tab === 'calendar' && !this.canUserSeeGroupCalendar()) {
        this.store.activeWorkspaceTab.set('tasks');
      } else if (tab === 'tasks' && !this.canUserSeeTasks()) {
        this.store.activeWorkspaceTab.set('chat');
      } else if (tab === 'members' && !this.canUserSeeMembers()) {
        this.store.activeWorkspaceTab.set('chat');
      } else if (tab === 'chat' && !this.canUserSeeChat()) {
        this.store.activeWorkspaceTab.set('tasks');
      }
    });
  }

  setTab(tab: WorkspaceTab): void {
    if (tab === 'calendar' && !this.canUserSeeGroupCalendar()) return;
    if (tab === 'tasks' && !this.canUserSeeTasks()) return;
    if (tab === 'members' && !this.canUserSeeMembers()) return;
    if (tab === 'chat' && !this.canUserSeeChat()) return;
    this.store.activeWorkspaceTab.set(tab);
    if (tab === 'chat') {
      this.store.unreadChatCount.set(0);
      const groupId = this.store.activeGroup()?.id;
      if (groupId) this.store.clearGroupUnread(groupId);
    }
  }

  startEditGroup(): void {
    const group = this.store.activeGroup();
    if (!group) return;
    this.editName.set(group.name);
    this.editDescription.set(group.description ?? '');
    this.editColor.set(group.color);
    this.groupError.set(null);
    this.editingGroup.set(true);
  }

  cancelEditGroup(): void {
    this.editingGroup.set(false);
    this.groupError.set(null);
  }

  async saveGroup(): Promise<void> {
    const group = this.store.activeGroup();
    const name = this.editName().trim();
    if (!group || this.savingGroup() || !this.isLeader()) return;
    if (!name) {
      this.groupError.set(this.i18n.t('group.nameRequired'));
      return;
    }

    const oldColor = group.color;
    const newColor = this.editColor();
    const colorChanged = oldColor !== newColor;

    this.savingGroup.set(true);
    this.groupError.set(null);
    try {
      await this.store.updateGroup(group.id, {
        name,
        description: this.editDescription().trim(),
        color: newColor,
      });
      this.editingGroup.set(false);

      if (colorChanged) {
        try {
          await this.store.sendMessage(
            group.id,
            this.i18n.t('group.colorChangedAnnouncement'),
          );
        } catch {
          // Announcement failure shouldn't block group save
        }
      }
    } catch (err: any) {
      this.groupError.set(err?.error?.message || this.i18n.t('group.updateGroupError'));
    } finally {
      this.savingGroup.set(false);
    }
  }

  // Xoá nhóm kéo theo task, tin nhắn và cả lịch nhóm — chỉ cần xác nhận
  // Đồng ý/Hủy qua DialogService dùng chung toàn app, không dùng
  // window.confirm() gốc của trình duyệt (xấu, không theo theme, có thể bị chặn).
  async deleteGroup(): Promise<void> {
    const group = this.store.activeGroup();
    if (!group || this.deletingGroup()) return;

    const ok = await this.dialog.confirm(
      this.i18n.t('group.deleteGroupConfirmBody'),
      {
        title: this.i18n.t('group.deleteGroupConfirmTitle', { name: group.name }),
        confirmLabel: this.i18n.t('group.deleteGroupConfirmYes'),
        danger: true,
      },
    );
    if (!ok) return;

    this.deletingGroup.set(true);
    try {
      // store.deleteGroup() tự tắt activeWorkspaceModalOpen khi đây là nhóm
      // đang mở — @if ở calendar-page tự đóng modal, không cần tự đóng ở đây.
      await this.store.deleteGroup(group.id);
    } catch (err: any) {
      await this.dialog.alert(err?.error?.message || this.i18n.t('group.deleteGroupError'));
    } finally {
      this.deletingGroup.set(false);
    }
  }

  async toggleHidden(): Promise<void> {
    const group = this.store.activeGroup();
    if (!group) return;
    try {
      await this.store.setGroupHidden(group.id, !group.hidden);
    } catch (err: any) {
      await this.dialog.alert(err?.error?.message || this.i18n.t('group.toggleHiddenError'));
    }
  }

  onInviteEmailInput(value: string): void {
    this.inviteEmail.set(value);
    this.inviteSuccess.set(null);
  }

  async invite(): Promise<void> {
    const group = this.store.activeGroup();
    const email = this.inviteEmail().trim();
    if (!group || !email || this.inviting()) return;

    this.inviteError.set(null);
    this.inviteSuccess.set(null);
    if (!this.inviteEmailValid()) {
      this.inviteError.set(this.i18n.t('group.inviteInvalidEmail'));
      return;
    }

    this.inviting.set(true);
    try {
      const created = await this.store.inviteMember(group.id, email, this.inviteRole());
      this.inviteEmail.set('');
      this.inviteSuccess.set(this.i18n.t('group.inviteSent', { email }));
      // Hiện ngay trong "Lời mời đang chờ" (không đợi tiếng vọng realtime).
      this.store.groupPendingInvites.update((list) => [
        { id: created.id, email, role: created.role, status: 'pending', createdAt: created.createdAt },
        ...list.filter((i) => i.id !== created.id && i.email !== email),
      ]);
    } catch (err: any) {
      this.inviteError.set(err?.error?.message || this.i18n.t('group.inviteError'));
    } finally {
      this.inviting.set(false);
    }
  }

  async cancelPendingInvite(inviteId: string): Promise<void> {
    const group = this.store.activeGroup();
    if (!group) return;
    try {
      await this.store.cancelGroupInvite(group.id, inviteId);
    } catch (err: any) {
      this.inviteError.set(err?.error?.message || this.i18n.t('group.inviteCancelError'));
    }
  }

  protected inviteLinkUrl(token: string): string {
    return `${window.location.origin}/groups/join/${token}`;
  }

  protected async copyInviteLink(token: string): Promise<void> {
    await navigator.clipboard.writeText(this.inviteLinkUrl(token));
    this.copyFeedback.set(this.i18n.t('group.inviteLinkCopied'));
    setTimeout(() => this.copyFeedback.set(null), 2000);
  }

  protected async regenerateInviteLink(): Promise<void> {
    const group = this.store.activeGroup();
    if (!group) return;
    await this.store.regenerateInviteLink(group.id);
  }

  // --- Mã tham gia nhóm + công tắc "yêu cầu phê duyệt" -----------------------
  protected readonly joinCode = signal<string | null>(null);
  protected readonly joinCodeRequiresApproval = signal(true);
  protected readonly joinCodeCopied = signal(false);
  protected readonly joinCodeBusy = signal(false);

  private async loadJoinCode(groupId: string): Promise<void> {
    try {
      const res = await this.store.getJoinCode(groupId);
      if (this.store.activeGroup()?.id !== groupId) return;
      this.joinCode.set(res.code || null);
      this.joinCodeRequiresApproval.set(res.requiresApproval);
    } catch {
      // Migration 41 chưa chạy — ẩn khối mã, không làm ồn.
      this.joinCode.set(null);
    }
  }

  protected async copyJoinCode(): Promise<void> {
    const code = this.joinCode();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.joinCodeCopied.set(true);
      setTimeout(() => this.joinCodeCopied.set(false), 2000);
    } catch {
      /* ignore */
    }
  }

  protected async regenerateJoinCode(): Promise<void> {
    const group = this.store.activeGroup();
    if (!group || this.joinCodeBusy()) return;
    this.joinCodeBusy.set(true);
    try {
      this.joinCode.set(await this.store.regenerateJoinCode(group.id));
    } catch (err: any) {
      await this.dialog.alert(err?.error?.message || this.i18n.t('group.joinCodeError'));
    } finally {
      this.joinCodeBusy.set(false);
    }
  }

  protected async toggleJoinApproval(next: boolean): Promise<void> {
    const group = this.store.activeGroup();
    if (!group || this.joinCodeBusy()) return;
    this.joinCodeBusy.set(true);
    this.joinCodeRequiresApproval.set(next); // lạc quan
    try {
      await this.store.updateGroup(group.id, { requiresApproval: next });
    } catch (err: any) {
      this.joinCodeRequiresApproval.set(!next);
      await this.dialog.alert(err?.error?.message || this.i18n.t('group.joinCodeError'));
    } finally {
      this.joinCodeBusy.set(false);
    }
  }

  protected async approveJoinRequest(r: GroupJoinRequest): Promise<void> {
    const group = this.store.activeGroup();
    if (!group || !this.canUserApproveJoinRequests()) return;
    await this.store.approveJoinRequest(group.id, r.id);
  }

  protected async declineJoinRequest(r: GroupJoinRequest): Promise<void> {
    const group = this.store.activeGroup();
    if (!group || !this.canUserApproveJoinRequests()) return;
    await this.store.declineJoinRequest(group.id, r.id);
  }

  toggleRoleMenu(userId: string): void {
    if (this.openRoleMenuUserId() === userId) {
      this.openRoleMenuUserId.set(null);
    } else {
      this.openRoleMenuUserId.set(userId);
    }
  }

  closeRoleMenu(): void {
    this.openRoleMenuUserId.set(null);
  }

  async selectRole(member: GroupMember, role: GroupRole): Promise<void> {
    this.closeRoleMenu();
    if (member.role === role) return;
    await this.changeRole(member, role);
  }

  toggleInviteRoleMenu(): void {
    this.inviteRoleMenuOpen.set(!this.inviteRoleMenuOpen());
  }

  selectInviteRole(role: GroupRole): void {
    this.inviteRole.set(role);
    this.inviteRoleMenuOpen.set(false);
  }

  async changeRole(member: GroupMember, role: GroupRole): Promise<void> {
    const group = this.store.activeGroup();
    if (!group || this.updatingRoleUserId()) return;

    // Kiểm lại ngay trước khi gọi API. Backend vẫn là chốt chặn thật, nhưng
    // chặn ở đây tránh việc người dùng thấy lỗi đỏ cho một thao tác mà giao
    // diện lẽ ra không cho phép.
    if (!this.canManageMember(member) || !canAssignRole(this.currentRole(), role)) {
      await this.dialog.alert(this.i18n.t('group.noManagePermission'));
      return;
    }

    this.updatingRoleUserId.set(member.userId);
    try {
      await this.store.updateMemberRole(group.id, member.userId, role);
    } catch (err: any) {
      await this.dialog.alert(err?.error?.message || this.i18n.t('group.changeRoleError'));
    } finally {
      this.updatingRoleUserId.set(null);
    }
  }

  async removeMember(member: GroupMember): Promise<void> {
    const group = this.store.activeGroup();
    if (!group) return;

    if (member.role === GroupRole.LEADER) {
      await this.dialog.alert(this.i18n.t('group.leaderCannotBeRemoved'));
      return;
    }
    if (!this.canManageMember(member)) {
      await this.dialog.alert(this.i18n.t('group.noManagePermission'));
      return;
    }

    const ok = await this.dialog.confirm(
      this.i18n.t('group.removeMemberConfirm', { member: this.memberDisplayName(member, member.userId) }),
      { danger: true },
    );
    if (ok) await this.store.removeMember(group.id, member.userId);
  }

  async transferLeadership(member: GroupMember): Promise<void> {
    const group = this.store.activeGroup();
    if (!group || this.transferringUserId()) return;
    if (!this.canTransferTo(member)) return;

    const name = this.memberDisplayName(member, member.userId);
    const ok = await this.dialog.confirm(this.i18n.t('group.transferConfirm', { member: name }));
    if (!ok) return;

    this.transferringUserId.set(member.userId);
    try {
      await this.store.transferLeadership(group.id, member.userId);
    } catch (err: any) {
      await this.dialog.alert(err?.error?.message || this.i18n.t('group.transferError'));
    } finally {
      this.transferringUserId.set(null);
    }
  }

  /** Bắt buộc chọn người phụ trách — task không giao cho ai thì trôi nổi,
   *  không ai theo dõi trách nhiệm. */
  protected readonly canCreateTask = computed(
    () => this.canUserChat() && !!this.taskTitle().trim() && !!this.taskAssignedTo() && !this.creatingTask(),
  );

  async createTask(): Promise<void> {
    const group = this.store.activeGroup();
    const title = this.taskTitle().trim();
    const assignedTo = this.taskAssignedTo();
    if (!group || !this.canCreateTask()) return;

    this.creatingTask.set(true);
    try {
      await this.store.createTask(
        group.id,
        title,
        this.taskDescription().trim(),
        'todo',
        assignedTo,
      );
      this.taskTitle.set('');
      this.taskDescription.set('');
      this.taskAssignedTo.set('');
      this.taskDueDate.set('');

    } finally {
      this.creatingTask.set(false);
    }
  }

  /**
   * Ai được chuyển trạng thái task này: Trưởng nhóm / Phó nhóm chuyển được mọi
   * task; thành viên thường CHỈ chuyển task giao cho chính mình. Khớp đúng luật
   * ở backend `groups.service.ts` `updateTask()`.
   */
  canMoveTask(task: GroupTask): boolean {
    return this.canManageAnyone() || task.assignedTo === this.currentUserId();
  }

  async setTaskStatus(task: GroupTask, status: 'todo' | 'in_progress' | 'done'): Promise<void> {
    const group = this.store.activeGroup();
    if (!group || task.status === status || !this.canMoveTask(task)) return;
    try {
      await this.store.updateTaskStatus(group.id, task.id, status);
    } catch (err: any) {
      await this.dialog.alert(
        err?.error?.message || this.i18n.t('group.taskMovePermission'),
      );
    }
  }

  assigneeName(task: GroupTask): string {
    if (!task.assignedTo) return '';
    const member = this.store.members().find((m) => m.userId === task.assignedTo);
    return this.memberDisplayName(member, task.assignedTo);
  }

  /** Người tạo task hoặc chủ nhóm/quản trị viên mới xoá được — cùng quy tắc
   *  với `canDeleteMessage` bên khung chat, KHÔNG phải "chỉ chủ nhóm". */
  canDeleteTask(task: GroupTask): boolean {
    return this.canManageAnyone();
  }

  async deleteTask(task: GroupTask): Promise<void> {
    const group = this.store.activeGroup();
    if (!group) return;
    const ok = await this.dialog.confirm(
      this.i18n.t('group.deleteTaskConfirm', { title: task.title }),
      { danger: true },
    );
    if (!ok) return;
    try {
      await this.store.deleteTask(group.id, task.id);
    } catch (err: any) {
      await this.dialog.alert(err?.error?.message || this.i18n.t('group.deleteTaskError'));
    }
  }

  // Kéo-thả giữa 3 cột — HTML5 drag-and-drop gốc, không cần thư viện thêm.
  protected readonly draggingTaskId = signal<string | null>(null);
  protected readonly dragOverStatus = signal<'todo' | 'in_progress' | 'done' | null>(null);

  onTaskDragStart(task: GroupTask, event: DragEvent): void {
    if (!this.canMoveTask(task)) {
      event.preventDefault();
      return;
    }
    this.draggingTaskId.set(task.id);
    event.dataTransfer?.setData('text/plain', task.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onTaskDragEnd(): void {
    this.draggingTaskId.set(null);
    this.dragOverStatus.set(null);
  }

  onColumnDragOver(status: 'todo' | 'in_progress' | 'done', event: DragEvent): void {
    if (!this.draggingTaskId()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverStatus.set(status);
  }

  onColumnDragLeave(status: 'todo' | 'in_progress' | 'done', event: DragEvent): void {
    // dragleave nổi bọt từ các task-item con mỗi khi chuột lướt qua chúng —
    // chỉ coi là "rời cột" khi con trỏ thực sự ra khỏi container, không thì
    // viền chấm nhấp nháy liên tục trong lúc kéo.
    const container = event.currentTarget as HTMLElement;
    const related = event.relatedTarget as Node | null;
    if (related && container.contains(related)) return;
    if (this.dragOverStatus() === status) this.dragOverStatus.set(null);
  }

  async onColumnDrop(status: 'todo' | 'in_progress' | 'done', event: DragEvent): Promise<void> {
    event.preventDefault();
    const taskId = this.draggingTaskId();
    this.draggingTaskId.set(null);
    this.dragOverStatus.set(null);
    if (!taskId) return;

    const task = this.store.tasks().find((t) => t.id === taskId);
    if (task) await this.setTaskStatus(task, status);
  }

  async reassignTask(task: GroupTask, userId: string): Promise<void> {
    const group = this.store.activeGroup();
    if (!group || !this.canManageAnyone() || this.reassigningTaskId()) return;

    this.reassigningTaskId.set(task.id);
    try {
      await this.store.updateTask(group.id, task.id, { assignedTo: userId || undefined });

    } catch (err: any) {
      await this.dialog.alert(err?.error?.message || this.i18n.t('group.reassignError'));
    } finally {
      this.reassigningTaskId.set(null);
    }
  }

  onAttachmentSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.attachmentError.set(null);
    if (file && file.size > GroupWorkspaceModal.MAX_ATTACHMENT_BYTES) {
      this.attachmentError.set(this.i18n.t('group.attachmentTooLarge'));
      input.value = '';
      return;
    }
    this.attachmentFile.set(file);
  }

  clearAttachment(): void {
    this.attachmentFile.set(null);
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  isImageAttachment(msg: GroupMessage): boolean {
    return !!msg.attachmentType?.startsWith('image/');
  }

  /** Tên hiển thị chưa chắc có (chưa từng đặt ở Cài đặt tài khoản) — rơi về
   *  phần trước @ của email, rồi mới tới placeholder chung. */
  senderDisplayName(msg: GroupMessage): string {
    return msg.senderName || msg.senderEmail?.split('@')[0] || this.i18n.t('group.memberFallback');
  }

  senderAvatarInitial(msg: GroupMessage): string {
    const name = this.senderDisplayName(msg);
    return (name ? name[0] : 'U').toUpperCase();
  }

  /** Tin do chính người đang xem gửi — căn phải, bong bóng màu, không avatar. */
  isMyMessage(msg: GroupMessage): boolean {
    return msg.senderId === this.currentUserId();
  }

  /** Tin cuối cùng do CHÍNH MÌNH gửi — chỉ hiện "Đã xem" ở đây (kiểu Zalo). */
  isLastOwnMessage(index: number): boolean {
    const msgs = this.store.messages();
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].senderId === this.currentUserId() && !msgs[i].deletedAt) return i === index;
    }
    return false;
  }

  /** Avatar những người đã đọc tới (hoặc qua) tin này — trừ mình và người gửi. */
  seenBy(msg: GroupMessage): { userId: string; initial: string; color: string }[] {
    const reads = this.store.messageReads();
    const me = this.currentUserId();
    return this.store
      .members()
      .filter((m) => m.userId !== me && m.userId !== msg.senderId)
      .filter((m) => {
        const at = reads[m.userId];
        return !!at && at >= msg.createdAt;
      })
      .map((m) => ({
        userId: m.userId,
        initial: (this.memberDisplayName(m, m.userId)[0] || 'U').toUpperCase(),
        color: this.colorForUserIdPublic(m.userId),
      }));
  }

  /** Bọc `colorForUserId` (private) cho template dùng ở "Đã xem". */
  colorForUserIdPublic(userId: string): string {
    return this.colorForUserId(userId);
  }

  /** Ẩn header (tên + giờ lặp lại) khi tin liền trước cùng người gửi và cách
   *  nhau dưới 5 phút — gom cụm cho giống Zalo. Cũng = "tin ĐẦU cụm". */
  showMessageHeader(msg: GroupMessage, index: number): boolean {
    if (index <= 0) return true;
    const prev = this.store.messages()[index - 1];
    if (!prev || prev.senderId !== msg.senderId) return true;
    if (prev.deletedAt || msg.deletedAt) return true;
    if (this.daySeparatorBefore(index)) return true;
    return new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60_000;
  }

  /** Tin CUỐI cụm — tin kế tiếp khác người / cách xa giờ / sang ngày mới. */
  isGroupEnd(index: number): boolean {
    const msgs = this.store.messages();
    const cur = msgs[index];
    const next = msgs[index + 1];
    if (!cur || !next) return true;
    if (next.senderId !== cur.senderId || cur.deletedAt || next.deletedAt) return true;
    if (this.daySeparatorBefore(index + 1)) return true;
    return new Date(next.createdAt).getTime() - new Date(cur.createdAt).getTime() > 5 * 60_000;
  }

  // --- Vạch chia ngày + ngày ghim dính -----------------------------------
  private dayKey(iso: string): string {
    const d = new Date(iso);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  /** Nhãn ngày cho tin `index` nếu nó mở ĐẦU một ngày mới (hoặc là tin đầu). */
  daySeparatorBefore(index: number): string | null {
    const msgs = this.store.messages();
    const cur = msgs[index];
    if (!cur) return null;
    if (index === 0) return this.dayLabel(cur.createdAt);
    const prev = msgs[index - 1];
    if (prev && this.dayKey(prev.createdAt) !== this.dayKey(cur.createdAt)) {
      return this.dayLabel(cur.createdAt);
    }
    return null;
  }

  private dayLabel(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (this.dayKey(iso) === this.dayKey(today.toISOString())) return this.i18n.t('chat.today');
    if (this.dayKey(iso) === this.dayKey(yesterday.toISOString())) return this.i18n.t('chat.yesterday');
    return new Intl.DateTimeFormat(this.i18n.t('common.dateLocale'), {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    }).format(d);
  }

  /** Cuộn khung chat: cập nhật nút "tin mới" + nhãn ngày ghim dính (throttle rAF). */
  onChatScroll(ev: Event): void {
    const el = ev.target as HTMLElement;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (dist < 60) this.newChatMessages.set(0);
    if (this.stickyRaf) return;
    this.stickyRaf = requestAnimationFrame(() => {
      this.stickyRaf = 0;
      this.updateStickyDay(el);
    });
  }

  private updateStickyDay(container: HTMLElement): void {
    const seps = container.querySelectorAll<HTMLElement>('.chat-day-sep');
    const top = container.getBoundingClientRect().top;
    let label: string | null = null;
    for (const sep of Array.from(seps)) {
      // Vạch chia đã trôi lên quá mép trên → ngày của nó là ngày đang đọc.
      if (sep.getBoundingClientRect().top - top < 8) label = sep.dataset['label'] ?? null;
      else break;
    }
    this.stickyDay.set(label);
  }

  scrollChatToBottom(): void {
    const el = document.querySelector('.chat-messages') as HTMLElement | null;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    this.newChatMessages.set(0);
  }

  // --- Trả lời / trích dẫn ------------------------------------------------
  startReply(msg: GroupMessage): void {
    if (msg.deletedAt) return;
    this.msgMenu.set(null);
    this.replyingTo.set(msg);
    setTimeout(() => this.chatInput()?.nativeElement.focus(), 0);
  }

  cancelReply(): void {
    this.replyingTo.set(null);
  }

  replyLabelFor(msg: GroupMessage): string {
    return msg.replySenderName || this.i18n.t('group.memberFallback');
  }

  /** Preview khối trích dẫn trong bong bóng — ưu tiên server, rồi tra tin đã nạp. */
  replyPreviewFor(msg: GroupMessage): string {
    if (msg.replyDeleted) return this.i18n.t('group.messageDeleted');
    if (msg.replyPreview) return msg.replyPreview;
    const src = this.store.messages().find((m) => m.id === msg.replyToId);
    return src ? this.store.previewOf(src) : '';
  }

  scrollToMessage(id: string | undefined): void {
    if (!id) return;
    const el = document.getElementById(`chat-msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('chat-msg-row--focused');
    setTimeout(() => el.classList.remove('chat-msg-row--focused'), 1800);
  }

  // --- Menu chuột phải (desktop) ----------------------------------------
  onMsgContextMenu(ev: MouseEvent, msg: GroupMessage): void {
    if (msg.deletedAt || this.editingMessageId() === msg.id) return;
    ev.preventDefault();
    // Kẹp trong khung nhìn để menu không tràn ra ngoài.
    const x = Math.min(ev.clientX, window.innerWidth - 190);
    const y = Math.min(ev.clientY, window.innerHeight - 200);
    this.msgMenu.set({ msg, x, y });
  }

  closeMsgMenu(): void {
    this.msgMenu.set(null);
  }

  /** Mở menu từ nút ☺ khi rê chuột (desktop) — canh ngay dưới nút. */
  openMsgMenuFromButton(ev: MouseEvent, msg: GroupMessage): void {
    if (msg.deletedAt) return;
    ev.stopPropagation();
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this.msgMenu.set({
      msg,
      x: Math.max(12, Math.min(r.left - 60, window.innerWidth - 200)),
      y: Math.min(r.bottom + 4, window.innerHeight - 240),
    });
  }

  async copyMessageText(msg: GroupMessage): Promise<void> {
    this.msgMenu.set(null);
    if (!msg.message) return;
    try {
      await navigator.clipboard.writeText(msg.message);
    } catch {
      /* trình duyệt chặn — bỏ qua */
    }
  }

  // --- Vuốt để trả lời + nhấn giữ mở menu (mobile) --------------------
  onMsgSwipeStart(ev: PointerEvent, msg: GroupMessage): void {
    if (ev.pointerType === 'mouse' || msg.deletedAt) return;
    const holdTimer = window.setTimeout(() => {
      // Nhấn giữ tại chỗ → mở menu (kèm hàng biểu cảm) ngay giữa màn hình dưới.
      if (this.swipeState?.id === msg.id && !this.swipeState.active) {
        this.swipeState = null;
        this.swipeDx.set(null);
        navigator.vibrate?.(10);
        this.msgMenu.set({
          msg,
          x: Math.max(12, Math.min(ev.clientX - 90, window.innerWidth - 200)),
          y: Math.max(12, Math.min(ev.clientY, window.innerHeight - 240)),
        });
      }
    }, 450);
    this.swipeState = {
      id: msg.id,
      startX: ev.clientX,
      startY: ev.clientY,
      active: false,
      holdTimer,
    };
  }

  onMsgSwipeMove(ev: PointerEvent, msg: GroupMessage): void {
    const s = this.swipeState;
    if (!s || s.id !== msg.id) return;
    const dx = ev.clientX - s.startX;
    const dy = ev.clientY - s.startY;
    if (!s.active) {
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy)) {
        // Nhích nhiều (cuộn) → huỷ nhấn-giữ.
        if (Math.abs(dy) > 12 && s.holdTimer) {
          clearTimeout(s.holdTimer);
          s.holdTimer = null;
        }
        return;
      }
      s.active = true;
      if (s.holdTimer) {
        clearTimeout(s.holdTimer);
        s.holdTimer = null;
      }
    }
    const dir = this.isMyMessage(msg) ? 1 : -1;
    const clamped = Math.max(0, dx * dir) * dir;
    this.swipeDx.set({ id: msg.id, dx: Math.max(-80, Math.min(80, clamped)) });
  }

  onMsgSwipeEnd(msg: GroupMessage): void {
    const s = this.swipeState;
    const moved = this.swipeDx();
    if (s?.holdTimer) clearTimeout(s.holdTimer);
    this.swipeState = null;
    this.swipeDx.set(null);
    if (s?.active && moved && moved.id === msg.id && Math.abs(moved.dx) > 55) {
      this.startReply(msg);
    }
  }

  // --- Bình chọn ----------------------------------------------------
  protected readonly createPollOpen = signal(false);
  /** Menu ⊕ cạnh ô nhập (Tạo bình chọn, …). */
  protected readonly composerMenuOpen = signal(false);

  pollFor(msg: GroupMessage) {
    return msg.pollId ? this.store.polls()[msg.pollId] ?? null : null;
  }

  pollTotalVotes(poll: { options: { count: number }[] }): number {
    return poll.options.reduce((s, o) => s + o.count, 0);
  }

  pollPercent(poll: { options: { count: number }[] }, count: number): number {
    const total = this.pollTotalVotes(poll);
    return total === 0 ? 0 : Math.round((count / total) * 100);
  }

  async togglePollOption(poll: PollDetail, optionId: string): Promise<void> {
    const group = this.store.activeGroup();
    if (!group || poll.closedAt) return;
    const mine = new Set(poll.myOptionIds);
    let next: string[];
    if (poll.allowMultiple) {
      if (mine.has(optionId)) mine.delete(optionId);
      else mine.add(optionId);
      next = [...mine];
    } else {
      next = mine.has(optionId) ? [] : [optionId];
    }
    try {
      await this.store.votePoll(group.id, poll.id, next);
    } catch (err: any) {
      await this.dialog.alert(err?.error?.message || this.i18n.t('poll.voteError'));
    }
  }

  canClosePoll(poll: PollDetail): boolean {
    return !poll.closedAt && (poll.createdBy === this.currentUserId() || this.canModerateChat());
  }

  async closePoll(poll: PollDetail): Promise<void> {
    const group = this.store.activeGroup();
    if (!group) return;
    const ok = await this.dialog.confirm(this.i18n.t('poll.closeConfirm'), { danger: true });
    if (!ok) return;
    try {
      await this.store.closePoll(group.id, poll.id);
    } catch (err: any) {
      await this.dialog.alert(err?.error?.message || this.i18n.t('poll.voteError'));
    }
  }

  // --- Chuyển tiếp ---------------------------------------------------
  protected readonly forwardingMsg = signal<GroupMessage | null>(null);

  startForward(msg: GroupMessage): void {
    if (msg.deletedAt) return;
    this.msgMenu.set(null);
    this.forwardingMsg.set(msg);
  }

  async onForwardPicked(target: { id: string; name: string }): Promise<void> {
    const msg = this.forwardingMsg();
    const from = this.store.activeGroup()?.name;
    this.forwardingMsg.set(null);
    if (!msg) return;
    const attachment = msg.attachmentUrl
      ? {
          url: msg.attachmentUrl,
          name: msg.attachmentName ?? 'file',
          type: msg.attachmentType ?? '',
          size: msg.attachmentSize ?? 0,
        }
      : undefined;
    try {
      await this.store.sendMessage(
        target.id,
        msg.message ?? '',
        attachment,
        undefined,
        undefined,
        from,
      );
    } catch (err: any) {
      await this.dialog.alert(err?.error?.message || this.i18n.t('group.sendMessageError'));
    }
  }

  // --- Ghim tin nhắn ---------------------------------------------------
  async togglePin(msg: GroupMessage): Promise<void> {
    const group = this.store.activeGroup();
    if (!group || !this.canModerateChat()) return;
    this.msgMenu.set(null);
    try {
      await this.store.setMessagePinned(group.id, msg.id, !msg.pinnedAt);
    } catch (err: any) {
      await this.dialog.alert(err?.error?.message || this.i18n.t('chat.pinError'));
    }
  }

  /** Preview 1 dòng cho thanh ghim. */
  pinnedPreview(msg: GroupMessage): string {
    return this.store.previewOf(msg) || this.i18n.t('group.messageDeleted');
  }

  // --- Thả cảm xúc ------------------------------------------------------
  react(msg: GroupMessage, emoji: string): void {
    const group = this.store.activeGroup();
    if (!group || msg.deletedAt) return;
    this.msgMenu.set(null);
    void this.store.toggleReaction(group.id, msg.id, emoji);
  }

  /** Danh sách chip biểu cảm dưới bong bóng: emoji + số + mình đã thả chưa. */
  reactionChips(msg: GroupMessage): { emoji: string; count: number; mine: boolean }[] {
    const forMsg = this.store.reactions()[msg.id];
    if (!forMsg) return [];
    const me = this.currentUserId();
    return Object.entries(forMsg)
      .map(([emoji, users]) => ({ emoji, count: users.length, mine: !!me && users.includes(me) }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);
  }

  /** Mỗi người 1 màu ổn định (dựa trên senderId, không đổi giữa các lần
   *  render) để phân biệt người gửi trong chat nhiều thành viên bằng mắt,
   *  không cần đọc tên. Palette lấy từ cùng bộ màu nhóm (GROUP_COLOR_HEX) để
   *  đồng nhất với phần còn lại của app, mở rộng thêm vài tông cho đỡ trùng. */
  private static readonly SENDER_COLOR_PALETTE: readonly string[] = [
    '#2563eb', '#16a34a', '#ea580c', '#dc2626', '#7c3aed', '#0891b2',
    '#db2777', '#ca8a04', '#059669', '#4f46e5',
  ];

  senderColor(msg: GroupMessage): string {
    return this.colorForUserId(msg.senderId);
  }

  /** Tách khỏi `senderColor` để danh sách gợi ý mention (chỉ có userId, chưa
   *  có tin nhắn nào) tô cùng một màu với avatar trong khung chat. */
  private colorForUserId(userId: string): string {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = (hash * 31 + userId.charCodeAt(i)) | 0;
    }
    const index = Math.abs(hash) % GroupWorkspaceModal.SENDER_COLOR_PALETTE.length;
    return GroupWorkspaceModal.SENDER_COLOR_PALETTE[index];
  }

  /** Tin nhắn lạc quan chưa có id thật trên server nên không sửa/xoá được —
   *  gọi API với id tạm chỉ nhận về lỗi "message not found". Nút chỉ hiện lại
   *  sau khi server xác nhận (thường là trong tích tắc). */
  canEditMessage(msg: GroupMessage): boolean {
    if (msg.pending) return false;
    return !msg.deletedAt && msg.senderId === this.currentUserId();
  }

  canDeleteMessage(msg: GroupMessage): boolean {
    if (msg.pending || msg.deletedAt) return false;
    return msg.senderId === this.currentUserId() || this.canModerateChat();
  }

  startEditMessage(msg: GroupMessage): void {
    this.editingMessageId.set(msg.id);
    this.editingText.set(msg.message ?? '');
  }

  cancelEditMessage(): void {
    this.editingMessageId.set(null);
    this.editingText.set('');
  }

  protected onEditInput(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    this.editingText.set(el.value);
    this.autoGrowChatInput(el);
  }

  /** Enter lưu, Shift+Enter xuống dòng — cùng quy tắc với ô soạn tin chính. */
  protected onEditKeydown(event: KeyboardEvent, msg: GroupMessage): void {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') {
      this.cancelEditMessage();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.saveEditMessage(msg);
    }
  }

  async saveEditMessage(msg: GroupMessage): Promise<void> {
    const group = this.store.activeGroup();
    const text = this.editingText().trim();
    if (!group || !text) return;

    try {
      await this.store.editMessage(group.id, msg.id, text);
      this.cancelEditMessage();
    } catch (err: any) {
      await this.dialog.alert(err?.error?.message || this.i18n.t('group.editMessageError'));
    }
  }

  async deleteMessage(msg: GroupMessage): Promise<void> {
    const group = this.store.activeGroup();
    if (!group) return;
    const ok = await this.dialog.confirm(this.i18n.t('group.deleteMessageConfirm'), { danger: true });
    if (!ok) return;

    try {
      await this.store.deleteMessage(group.id, msg.id);
    } catch (err: any) {
      await this.dialog.alert(err?.error?.message || this.i18n.t('group.deleteMessageError'));
    }
  }

  // ---------------------------------------------------------------------
  // Nhắc tên (@mention)
  // ---------------------------------------------------------------------

  /** Mention đang gõ dở tại vị trí con trỏ. null = popup đóng. */
  protected readonly mentionQuery = signal<ActiveMentionQuery | null>(null);
  /** Dòng đang được bàn phím trỏ tới trong popup. */
  protected readonly mentionActiveIndex = signal(0);
  /** Những mention người dùng đã chọn cho tin nhắn đang soạn. Giữ riêng thay
   *  vì dò lại chuỗi lúc gửi: chỉ ở đây mới biết "@Quốc Cường" ứng với userId
   *  nào — hai thành viên trùng tên thì dò chuỗi chịu thua. */
  private readonly selectedMentions = signal<GroupMessageMention[]>([]);

  protected readonly mentionPopupOpen = computed(() => this.mentionQuery() !== null);

  /** Dòng đang chọn, báo cho trình đọc màn hình qua aria-activedescendant —
   *  focus vẫn nằm trong ô nhập nên không có cách nào khác để nó biết mũi tên
   *  lên/xuống vừa đổi lựa chọn. */
  protected readonly activeMentionOptionId = computed(() => {
    if (!this.mentionPopupOpen() || this.mentionOptions().length === 0) return null;
    return `chat-mention-listbox-option-${this.mentionActiveIndex()}`;
  });

  /**
   * Danh sách gợi ý: @All luôn đứng đầu, rồi tới thành viên nhóm.
   *
   * Bỏ chính mình khỏi danh sách — không ai nhắc tên mình, và backend cũng
   * lọc bỏ mention tự trỏ nên để lại chỉ tạo ra một lựa chọn không có tác dụng.
   */
  protected readonly mentionOptions = computed<MentionOption[]>(() => {
    const active = this.mentionQuery();
    if (!active) return [];

    const query = normalizeForMentionSearch(active.query);
    const myId = this.currentUserId();

    const members: MentionOption[] = this.store
      .members()
      .filter((m) => m.userId !== myId)
      .map((m) => {
        const label = this.memberDisplayName(m);
        return {
          kind: 'user' as const,
          label,
          userId: m.userId,
          initial: (label[0] ?? 'U').toUpperCase(),
          color: this.colorForUserId(m.userId),
        };
      })
      .filter((o) => !query || normalizeForMentionSearch(o.label).includes(query));

    // @All khớp cả từ khoá tiếng Anh lẫn phần mô tả tiếng Việt, nên gõ "@ca"
    // hay "@all" đều ra.
    const allHaystack = normalizeForMentionSearch(MENTION_ALL_LABEL + ' báo cho cả nhóm');
    const showAll = !query || allHaystack.includes(query);
    const all: MentionOption[] = showAll
      ? [{ kind: 'all', label: MENTION_ALL_LABEL, initial: '@', color: '' }]
      : [];

    return [...all, ...members];
  });

  /** Đọc lại vị trí con trỏ để biết còn đang gõ trong một mention hay không.
   *  Gọi sau MỌI thao tác đổi nội dung hoặc đổi vị trí con trỏ — đó cũng chính
   *  là cách popup tự đóng khi người dùng xoá dấu @ hoặc click sang chỗ khác. */
  private syncMentionQuery(el: HTMLTextAreaElement): void {
    const caret = el.selectionStart ?? el.value.length;
    this.mentionQuery.set(findActiveMention(el.value, caret));
    this.mentionActiveIndex.set(0);
  }

  protected onChatInput(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    this.chatMessage.set(el.value);
    this.syncMentionQuery(el);
    this.autoGrowChatInput(el);
    const group = this.store.activeGroup();
    if (group && el.value.trim()) this.store.emitTyping(group.id);
  }

  /** Dòng "… đang soạn tin…" phía trên ô nhập. */
  protected readonly typingText = computed(() => {
    const list = this.store.typingUsers();
    if (list.length === 0) return null;
    if (list.length === 1) return this.i18n.t('chat.typingOne', { name: list[0].name });
    return this.i18n.t('chat.typingMany', { n: list.length });
  });

  /** Trạng thái tin cuối của mình: pending → sent → delivered → seen. */
  protected ownStatus(msg: GroupMessage): 'pending' | 'seen' | 'delivered' | 'sent' {
    if (msg.pending) return 'pending';
    if (this.seenBy(msg).length > 0) return 'seen';
    if (this.store.deliveredMessageIds().has(msg.id)) return 'delivered';
    return 'sent';
  }

  /** Ô nhập cao dần theo số dòng đang gõ, giới hạn bởi max-height trong CSS
   *  (phần còn lại cuộn được) — reset về 'auto' trước để đo lại scrollHeight
   *  khi người dùng xoá bớt chữ, nếu không chiều cao chỉ tăng chứ không giảm. */
  private autoGrowChatInput(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  /** Con trỏ di chuyển bằng chuột hoặc phím mũi tên trái/phải/Home/End —
   *  rời khỏi vùng mention thì popup phải đóng theo. */
  protected onChatCaretMove(event: Event): void {
    if (event instanceof KeyboardEvent && this.mentionPopupOpen()) {
      // Các phím dành cho popup không phải là di chuyển con trỏ: xử lý xong ở
      // keydown rồi, đọc lại ở đây sẽ đặt lại dòng đang chọn về đầu danh sách.
      const handled = ['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Tab'];
      if (handled.includes(event.key)) return;
    }
    this.syncMentionQuery(event.target as HTMLTextAreaElement);
  }

  protected closeMentionPopup(): void {
    this.mentionQuery.set(null);
    this.mentionActiveIndex.set(0);
  }

  private moveMentionSelection(delta: number): void {
    const count = this.mentionOptions().length;
    if (count === 0) return;
    // Vòng lại hai đầu để giữ ArrowDown bấm liên tục không bị "kẹt" ở cuối.
    this.mentionActiveIndex.update((i) => (i + delta + count) % count);
  }

  /**
   * Chèn mention vào đúng vị trí con trỏ.
   *
   * Chỉ đoạn @... đang gõ dở bị thay; phần chữ trước và sau giữ nguyên. Sau
   * đó con trỏ được đặt ngay sau mention để người dùng gõ tiếp mà không phải
   * click lại vào ô nhập.
   */
  protected selectMention(option: MentionOption): void {
    const active = this.mentionQuery();
    const el = this.chatInput()?.nativeElement;
    if (!active || !el) return;

    const result = insertMention(el.value, active, option.label);

    this.chatMessage.set(result.text);
    // Ghi thẳng vào DOM rồi mới đặt con trỏ: chờ Angular đồng bộ [value] xong
    // mới setSelectionRange thì con trỏ nhảy về cuối trong một khung hình.
    el.value = result.text;
    el.focus();
    el.setSelectionRange(result.caret, result.caret);
    this.autoGrowChatInput(el);

    this.selectedMentions.update((list) => {
      const mention: GroupMessageMention =
        option.kind === 'all'
          ? { type: 'all', label: option.label }
          : { type: 'user', userId: option.userId, label: option.label };

      const duplicate = list.some(
        (m) => m.type === mention.type && m.userId === mention.userId,
      );
      return duplicate ? list : [...list, mention];
    });

    this.closeMentionPopup();
  }

  /**
   * Điều phối bàn phím trong ô nhập chat.
   *
   * Ba luật quan trọng:
   *   - Popup mention đang mở và có gợi ý thì Enter CHỈ chèn mention, không gửi.
   *   - Shift+Enter xuống dòng (hành vi mặc định của textarea, không chặn).
   *   - Ngoài ra Enter gửi ngay, không qua bất kỳ độ trễ nào.
   */
  protected onChatKeydown(event: KeyboardEvent): void {
    // Bộ gõ tiếng Việt đang ghép chữ: Enter lúc này là "chốt chữ vừa gõ" của
    // IME, không phải lệnh gửi. Gửi ở đây sẽ cắt mất chữ cuối cùng.
    if (event.isComposing || event.keyCode === 229) return;

    if (event.key === 'Escape' && this.mentionPopupOpen()) {
      event.preventDefault();
      this.closeMentionPopup();
      return;
    }

    const options = this.mentionOptions();
    if (this.mentionPopupOpen() && options.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.moveMentionSelection(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.moveMentionSelection(-1);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        this.selectMention(options[this.mentionActiveIndex()]);
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.closeMentionPopup();
      this.sendChat();
    }
  }

  /** Click ra ngoài ô nhập thì đóng popup. Popup tự chặn mousedown nên click
   *  vào chính nó KHÔNG kích hoạt blur — chọn bằng chuột vẫn chạy bình thường. */
  protected onChatBlur(): void {
    this.closeMentionPopup();
  }

  /**
   * Lọc lại mention đã chọn theo nội dung sắp gửi.
   *
   * Người dùng có thể chọn "@Quốc Cường" rồi xoá đi bằng backspace — nếu vẫn
   * gửi metadata đó lên thì người kia nhận thông báo về một tin nhắn không hề
   * nhắc tới họ.
   */
  private resolveMentions(text: string): GroupMessageMention[] {
    const selected = this.selectedMentions();
    if (selected.length === 0) return [];

    const present = new Set(
      splitMessageSegments(text, selected)
        .filter((s) => s.mention)
        .map((s) => s.mention!.type + ':' + (s.mention!.userId ?? '')),
    );

    return selected.filter((m) => present.has(m.type + ':' + (m.userId ?? '')));
  }

  // ---------------------------------------------------------------------
  // Gửi tin nhắn
  // ---------------------------------------------------------------------

  /**
   * Gửi tin nhắn.
   *
   * KHÔNG async: mọi thứ người dùng nhìn thấy — ô nhập trống đi, tin nhắn hiện
   * lên — xảy ra ngay trong lượt xử lý phím Enter này. Phần gọi mạng chạy nền
   * ở deliverChat, và GroupStore.sendMessage đã vẽ tin nhắn lạc quan trước
   * await đầu tiên nên không có khoảnh khắc nào màn hình đứng chờ server.
   */
  sendChat(): void {
    const group = this.store.activeGroup();
    const text = this.chatMessage().trim();
    const file = this.attachmentFile();
    if (!group || (!text && !file) || !this.canUserChat()) return;
    // Chỉ chặn khi đang tải tệp lên — gửi chữ thì bấm Enter liên tục bao nhiêu
    // lần cũng được, mỗi lần là một tin nhắn riêng.
    if (file && this.sendingChat()) return;

    const mentions = this.resolveMentions(text);
    const replyTo = this.replyingTo();
    this.replyingTo.set(null);

    this.chatMessage.set('');
    // [value] chỉ đồng bộ nội dung, không đụng tới style.height mà
    // autoGrowChatInput đã đặt tay — phải reset thủ công kẻo ô nhập giữ
    // nguyên chiều cao cao nhất từng đạt được sau khi gửi.
    const el = this.chatInput()?.nativeElement;
    if (el) el.style.height = 'auto';
    this.selectedMentions.set([]);
    this.closeMentionPopup();
    this.attachmentError.set(null);
    this.attachmentFile.set(null);

    void this.deliverChat(group.id, text, mentions, file, replyTo);
  }

  /** Phần chạy nền của sendChat. Hỏng thì trả nội dung về ô nhập để người
   *  dùng gửi lại — trừ khi họ đã kịp gõ nội dung mới, lúc đó ghi đè lên sẽ
   *  xoá mất thứ họ đang viết. */
  private async deliverChat(
    groupId: string,
    text: string,
    mentions: GroupMessageMention[],
    file: File | null,
    replyTo?: GroupMessage | null,
  ): Promise<void> {
    try {
      let attachment: GroupMessageAttachment | undefined;
      if (file) {
        this.uploadingAttachment.set(true);
        this.sendingChat.set(true);
        attachment = await this.store.uploadAttachment(groupId, file);
      }
      await this.store.sendMessage(groupId, text, attachment, mentions, replyTo ?? undefined);
    } catch (err: any) {
      this.attachmentError.set(
        err?.error?.message || err?.message || this.i18n.t('group.sendMessageError'),
      );
      if (!this.chatMessage().trim()) {
        this.chatMessage.set(text);
        this.selectedMentions.set(mentions);
      }
    } finally {
      this.uploadingAttachment.set(false);
      this.sendingChat.set(false);
    }
  }

  // ---------------------------------------------------------------------
  // Hiển thị mention trong tin nhắn đã gửi
  // ---------------------------------------------------------------------

  /** Kết quả cắt đoạn được nhớ theo ĐỐI TƯỢNG tin nhắn. Template gọi hàm này
   *  mỗi lần dò lỗi thay đổi, còn tin nhắn thì bất biến (mọi cập nhật đều thay
   *  bằng đối tượng mới), nên WeakMap vừa tránh tính lại vừa tự dọn rác. */
  private readonly segmentCache = new WeakMap<GroupMessage, MessageSegment[]>();

  messageSegments(msg: GroupMessage): MessageSegment[] {
    const cached = this.segmentCache.get(msg);
    if (cached) return cached;

    const segments = splitMessageSegments(msg.message ?? '', msg.mentions);
    this.segmentCache.set(msg, segments);
    return segments;
  }

  protected readonly formatExternalUrl = formatExternalUrl;
  protected readonly parseTextUrls = parseTextUrls;

  /** Mention trỏ vào chính người đang đọc (kể cả qua @All) được tô đậm hơn —
   *  đó là thứ họ cần thấy ngay khi lướt qua một khung chat dài. */
  isMentionForMe(segment: MessageSegment): boolean {
    const mention = segment.mention;
    if (!mention) return false;
    if (mention.type === 'all') return true;
    return mention.userId === this.currentUserId();
  }

  // ---------------------------------------------------------------------
  // Phòng họp cố định của nhóm (bảng group_meetings) — CRUD cho Trưởng/Phó nhóm
  // ---------------------------------------------------------------------

  /** Phòng họp đang mở của nhóm (null nếu chưa có). */
  protected readonly activeMeeting = this.store.meeting;
  /** Chỉ Trưởng nhóm / Phó nhóm tạo–sửa–gỡ phòng họp. */
  protected readonly canManageMeeting = this.canInviteMembers;

  protected readonly meetingEditing = signal(false);
  protected readonly meetingLinkInput = signal('');
  protected readonly meetingTitleInput = signal('');
  protected readonly meetingSaving = signal(false);
  protected readonly meetingErr = signal<string | null>(null);

  /** Mở Google Meet ở tab mới để lấy link thật rồi dán vào ô (không tự sinh
   *  được mã meet.google.com hợp lệ ở client — xem meeting-link.util.ts). */
  openGoogleMeetTab(): void {
    window.open('https://meet.google.com/new', '_blank', 'noopener');
    this.meetingEditing.set(true);
  }

  /** Phòng Jitsi tạo tức thì, không cần tài khoản — phương án nhanh. */
  useJitsiRoom(): void {
    this.meetingLinkInput.set(createMeetingRoomLink());
    this.meetingEditing.set(true);
  }

  startEditMeeting(): void {
    const m = this.activeMeeting();
    this.meetingLinkInput.set(m?.link ?? '');
    this.meetingTitleInput.set(m?.title ?? '');
    this.meetingErr.set(null);
    this.meetingEditing.set(true);
  }

  cancelEditMeeting(): void {
    this.meetingEditing.set(false);
    this.meetingLinkInput.set('');
    this.meetingTitleInput.set('');
    this.meetingErr.set(null);
  }

  async saveMeetingLink(): Promise<void> {
    const group = this.store.activeGroup();
    const link = this.meetingLinkInput().trim();
    if (!group || this.meetingSaving()) return;
    if (!/^https?:\/\/\S+$/.test(link)) {
      this.meetingErr.set(this.i18n.t('groupMeet.invalidLink'));
      return;
    }
    this.meetingSaving.set(true);
    this.meetingErr.set(null);
    try {
      await this.store.saveMeeting(group.id, {
        link,
        title: this.meetingTitleInput().trim() || undefined,
      });
      this.cancelEditMeeting();
    } catch (err: any) {
      this.meetingErr.set(err?.error?.message || this.i18n.t('groupMeet.saveError'));
    } finally {
      this.meetingSaving.set(false);
    }
  }

  async removeMeeting(): Promise<void> {
    const group = this.store.activeGroup();
    if (!group) return;
    const ok = await this.dialog.confirm(this.i18n.t('groupMeet.removeConfirm'), { danger: true });
    if (!ok) return;
    try {
      await this.store.removeMeeting(group.id);
    } catch (err: any) {
      await this.dialog.alert(err?.error?.message || this.i18n.t('groupMeet.saveError'));
    }
  }

  // ---------------------------------------------------------------------
  // Phòng họp trực tuyến (tab Lịch Nhóm)
  // ---------------------------------------------------------------------

  /** Trùng `MaxLength(200)` của CreateEventDto.title — cắt ở client để một tên
   *  nhóm quá dài không biến thành lỗi 400 khó hiểu. */
  private static readonly MAX_EVENT_TITLE_LENGTH = 200;

  /** Các mốc thời lượng hay dùng cho một buổi họp nhóm. */
  protected readonly meetDurations = [30, 45, 60, 90] as const;

  protected readonly meetTitle = signal('');
  protected readonly meetDate = signal('');
  protected readonly meetTime = signal('');
  protected readonly meetDuration = signal<number>(60);
  protected readonly meetAddToCalendar = signal(true);

  /**
   * Bật sẵn, còn "đăng vào chat" thì không.
   *
   * Một tin nhắn chat báo trước vài tiếng sẽ trôi mất giữa dòng tin nhắn đúng
   * lúc cần nhớ nhất. Lời nhắc thì nổ đúng giờ họp, kèm luôn nút Tham gia,
   * nên nó mới là thứ đưa người ta vào phòng họp.
   */
  protected readonly meetRemindEveryone = signal(true);
  protected readonly meetRemindOffsets = signal<Set<number>>(new Set([10, 5, 0]));

  toggleMeetReminderOffset(minutes: number): void {
    this.meetRemindOffsets.update((set) => {
      const next = new Set(set);
      if (next.has(minutes)) {
        next.delete(minutes);
      } else {
        next.add(minutes);
      }
      return next;
    });
  }

  protected readonly meetAnnounceInChat = signal(false);
  protected readonly meetSaving = signal(false);
  protected readonly meetError = signal<string | null>(null);
  protected readonly meetCopied = signal(false);

  /** Phòng vừa lưu — giữ lại ngay trong tab để còn chỗ bấm Tham gia / Sao chép
   *  mà không phải đi tìm lại trong lịch hay lật ngược khung chat. Ghi kèm
   *  nhóm sở hữu vì modal dùng chung cho mọi nhóm. */
  private readonly savedMeet = signal<{ groupId: string; link: string } | null>(null);

  /** Chỉ hiện phòng của ĐÚNG nhóm đang mở: đổi nhóm mà thẻ cũ còn nằm đó thì
   *  người dùng sẽ bấm "Tham gia" nhầm sang phòng họp của nhóm khác. */
  protected readonly savedMeetLink = computed(() => {
    const saved = this.savedMeet();
    if (!saved) return null;
    return saved.groupId === this.store.activeGroup()?.id ? saved.link : null;
  });

  /**
   * Dựa vào `canEdit` thật của lịch nhóm (backend suy từ `calendar_members`)
   * thay vì đoán theo vai trò nhóm — mọi thành viên nhóm hiện là 'editor' trên
   * lịch nhóm, chỉ có lịch chưa đồng bộ mới trả về false. Ẩn hẳn ô "tạo sự
   * kiện" thay vì để người dùng tích vào rồi nhận lỗi sau khi bấm lưu.
   */
  protected readonly canAddGroupEvent = computed(() => {
    const calendarId = this.store.activeGroup()?.calendarId;
    if (!calendarId) return false;
    return this.calendarStore.calendars().find((c) => c.id === calendarId)?.canEdit ?? false;
  });

  protected readonly canCreateMeet = computed(() => !this.meetSaving());

  /** Lời nhắc là hàng trong bảng `reminders`, trỏ tới `event_id` — không tạo
   *  sự kiện thì không có gì để trỏ vào. */
  protected readonly canRemindEveryone = computed(
    () => this.meetAddToCalendar() && this.canAddGroupEvent(),
  );

  selectMeetDuration(minutes: number): void {
    this.meetDuration.set(minutes);
  }

  /**
   * Sinh link phòng họp rồi gắn thẳng vào lịch nhóm và khung chat.
   *
   * Link được tạo NGAY ở đây chứ không bắt người dùng đi lấy rồi dán về:
   * `createMeetingRoomLink()` dựng ra một phòng Jitsi, mà phòng Jitsi thì tự
   * tồn tại từ lần đầu có người mở URL — không cần gọi API trước nên không có
   * gì để chờ.
   */
  async createMeetRoom(): Promise<void> {
    const group = this.store.activeGroup();
    if (!group || this.meetSaving()) return;

    const link = createMeetingRoomLink();
    const title = this.meetRoomTitle(group.name);
    const start = this.meetStartAt();
    const end = addMinutes(start, this.meetDuration());
    const announce = this.meetAnnounceInChat();

    this.meetSaving.set(true);
    this.meetError.set(null);
    try {
      if (this.meetAddToCalendar() && this.canAddGroupEvent()) {
        const event = await this.calendarStore.createEvent({
          calendarId: group.calendarId,
          title,
          start,
          end,
          allDay: false,
          meetLink: link,
        });

        if (this.meetRemindEveryone()) {
          // offsetMinutes 0 = nổ ĐÚNG giờ bắt đầu. Cron quét mỗi phút nên popup
          // hiện chậm nhất là một phút sau mốc đó.
          //
          // Lỗi ở đây không được huỷ cả thao tác: phòng họp đã có link, sự kiện
          // đã nằm trên lịch — chỉ riêng phần chuông là hỏng, và người dùng cần
          // biết đúng chừng đó.
          try {
            const selectedOffsets = Array.from(this.meetRemindOffsets());
            const reminderItems = (selectedOffsets.length > 0 ? selectedOffsets : [0]).map((offset) => ({
              offsetMinutes: offset,
              type: 'popup' as const,
            }));
            await this.calendarStore.setRemindersForAllMembers(event.id, reminderItems);
          } catch {
            this.meetError.set(this.i18n.t('meet.errRemind'));
          }
        }
      }

      this.savedMeet.set({ groupId: group.id, link });
      this.resetMeetForm();

      const isStartingNow = new Date(start).getTime() <= Date.now() + 60000;
      if (isStartingNow) {
        this.notificationQueue.push({
          title: this.i18n.t('meet.ready'),
          body: title,
          kind: 'created',
          meetLink: link,
        });
      } else {
        this.notificationQueue.push({
          title: 'Đã lên lịch cuộc họp',
          body: `Cuộc họp "${title}" đã được lên lịch thành công và sẽ báo trước 10p, 5p & đúng giờ họp.`,
          kind: 'success',
        });
      }

      if (announce) {
        try {
          await this.store.sendMessage(
            group.id,
            meetAnnouncement(title, start, end, link, (k, v) => this.i18n.t(k, v)),
          );
        } catch {
          this.meetError.set(this.i18n.t('meet.errAnnounce'));
        }
      }
    } catch (err: any) {
      this.meetError.set(
        err?.error?.message || err?.message || this.i18n.t('meet.errSave'),
      );
    } finally {
      this.meetSaving.set(false);
    }
  }

  async copyMeetLink(): Promise<void> {
    const link = this.savedMeetLink();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      this.meetCopied.set(true);
      setTimeout(() => this.meetCopied.set(false), 2000);
    } catch {
      this.meetError.set(this.i18n.t('meet.errCopy'));
    }
  }

  dismissSavedMeet(): void {
    this.savedMeet.set(null);
    this.meetCopied.set(false);
  }

  /** Tiêu đề bỏ trống thì đặt theo tên nhóm — một sự kiện trên lịch chung mà
   *  không có tên thì không ai đoán được đó là buổi họp gì. */
  private meetRoomTitle(groupName: string): string {
    const typed = this.meetTitle().trim();
    return (typed || `Họp nhóm ${groupName}`).slice(
      0,
      GroupWorkspaceModal.MAX_EVENT_TITLE_LENGTH,
    );
  }

  private meetStartAt(): Date {
    const date = this.meetDate();
    if (!date) return this.clock.now();
    return parseTime24(this.meetTime() || '00:00', fromDateInputValue(date));
  }

  private seedMeetSchedule(): void {
    const start = nextQuarterHour(this.clock.now());
    this.meetDate.set(toDateInputValue(start));
    this.meetTime.set(formatTime24(start));
  }

  private resetMeetForm(): void {
    this.meetTitle.set('');
    this.meetError.set(null);
    this.seedMeetSchedule();
  }

  close(): void {
    this.store.closeWorkspaceModal();
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }
}
