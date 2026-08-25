import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  output,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { AuthStore } from '../../../../core/auth/auth-store';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { GroupStore } from '../../data/group-store';
import {
  ASSIGNABLE_GROUP_ROLES,
  DEFAULT_GROUP_ROLE,
  GroupRole,
  canAssignRole,
  canInvite,
  canManage,
  canTransferLeadership,
  groupRoleLabelKey,
} from '../../models/group-role';
import {
  GROUP_COLOR_HEX,
  GROUP_COLORS,
  GroupColor,
  GroupMember,
  GroupMessage,
  GroupMessageAttachment,
  GroupTask,
} from '../../models/group.models';

type WorkspaceTab = 'members' | 'calendar' | 'tasks' | 'chat';

@Component({
  selector: 'app-group-workspace-modal',
  templateUrl: './group-workspace-modal.html',
  styleUrl: './group-workspace-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Icon],
})
export class GroupWorkspaceModal {
  protected readonly store = inject(GroupStore);
  private readonly authStore = inject(AuthStore);
  protected readonly i18n = inject(TranslationService);

  readonly closed = output<void>();

  protected readonly activeTab = signal<WorkspaceTab>('tasks');
  protected readonly updatingRoleUserId = signal<string | null>(null);
  protected readonly transferringUserId = signal<string | null>(null);

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
    return this.store.members().find((m) => m.userId === userId)?.role ?? null;
  });

  protected readonly isLeader = computed(() => this.currentRole() === GroupRole.LEADER);
  protected readonly canInviteMembers = computed(() => canInvite(this.currentRole()));
  protected readonly canTransfer = computed(() => canTransferLeadership(this.currentRole()));

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

  /**
   * Bảng "được phép / không thể" hiện dưới ô chọn vai trò.
   *
   * Đọc từ i18n theo khoá dựng từ chính vai trò, nên thêm ngôn ngữ chỉ cần
   * thêm bản dịch — không phải sửa component.
   */
  protected readonly rolePermissions = computed(() => {
    const role = this.inviteRole();
    const key = role.toLowerCase();
    const list = (kind: string, count: number) =>
      Array.from({ length: count }, (_, i) =>
        this.i18n.t(`groupRole.${key}.${kind}${i + 1}`),
      );
    return {
      title: this.i18n.t('groupRole.permTitle', { role: this.roleLabel(role) }),
      can: list('can', 4),
      cannot: list('cannot', 3),
    };
  });

  protected readonly todoTasks = computed(() => this.store.tasks().filter((t) => t.status === 'todo'));
  protected readonly inProgressTasks = computed(() =>
    this.store.tasks().filter((t) => t.status === 'in_progress'),
  );
  protected readonly doneTasks = computed(() => this.store.tasks().filter((t) => t.status === 'done'));

  // Member invite form
  private static readonly EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
    if (!id) return '-- Chọn thành viên phụ trách --';
    const member = this.store.members().find((m) => m.userId === id);
    return member?.email || id;
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
  protected readonly chatMessage = signal('');
  protected readonly sendingChat = signal(false);
  protected readonly uploadingAttachment = signal(false);
  protected readonly attachmentFile = signal<File | null>(null);
  protected readonly attachmentError = signal<string | null>(null);

  // Chat message edit
  protected readonly editingMessageId = signal<string | null>(null);
  protected readonly editingText = signal('');

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
    // Luồng bên ngoài (click thông báo tin nhắn) yêu cầu mở sẵn một tab cụ thể.
    effect(() => {
      const requested = this.store.requestedWorkspaceTab();
      if (!requested) return;
      this.activeTab.set(requested);
      this.store.requestedWorkspaceTab.set(null);
    });

    effect(() => {
      const msgs = this.store.messages();
      if (this.activeTab() !== 'chat' || msgs.length === 0) return;

      // untracked: xoá cờ sau khi cuộn xong không được kích hoạt lại effect,
      // nếu không lần chạy thứ hai sẽ cuộn xuống đáy và huỷ mất focus vừa đặt.
      const targetId = untracked(() => this.store.pendingChatMessageId());
      setTimeout(() => {
        const container = document.querySelector('.chat-messages');
        if (!container) return;

        // Có tin nhắn cần focus thì cuộn tới đúng nó, còn lại giữ hành vi cũ
        // là cuộn xuống tin mới nhất.
        const target = targetId ? document.getElementById(`chat-msg-${targetId}`) : null;
        if (target) {
          target.scrollIntoView({ block: 'center' });
          target.classList.add('chat-msg-row--focused');
          setTimeout(() => target.classList.remove('chat-msg-row--focused'), 2000);
        } else {
          container.scrollTop = container.scrollHeight;
        }
        if (targetId) this.store.pendingChatMessageId.set(null);
      }, 50);
    });
  }

  setTab(tab: WorkspaceTab): void {
    this.activeTab.set(tab);
    this.store.activeWorkspaceTab.set(tab);
    if (tab === 'chat') {
      this.store.unreadChatCount.set(0);
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
    if (!group || this.savingGroup()) return;
    if (!name) {
      this.groupError.set(this.i18n.t('group.nameRequired'));
      return;
    }

    this.savingGroup.set(true);
    this.groupError.set(null);
    try {
      await this.store.updateGroup(group.id, {
        name,
        description: this.editDescription().trim(),
        color: this.editColor(),
      });
      this.editingGroup.set(false);
    } catch (err: any) {
      this.groupError.set(err?.error?.message || this.i18n.t('group.updateGroupError'));
    } finally {
      this.savingGroup.set(false);
    }
  }

  async deleteGroup(): Promise<void> {
    const group = this.store.activeGroup();
    if (!group || this.deletingGroup()) return;
    // Xoá nhóm kéo theo task, tin nhắn và cả lịch nhóm — bắt gõ đúng tên để
    // không ai xoá nhầm bằng một cú nhấn.
    const typed = prompt(this.i18n.t('group.deleteConfirmPrompt', { name: group.name }));
    if (typed?.trim() !== group.name) {
      if (typed !== null) alert(this.i18n.t('group.deleteNameMismatch'));
      return;
    }

    this.deletingGroup.set(true);
    try {
      await this.store.deleteGroup(group.id);
    } catch (err: any) {
      alert(err?.error?.message || this.i18n.t('group.deleteGroupError'));
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
      alert(err?.error?.message || this.i18n.t('group.toggleHiddenError'));
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
      this.inviteError.set('Vui lòng nhập một địa chỉ email hợp lệ');
      return;
    }

    this.inviting.set(true);
    try {
      await this.store.inviteMember(group.id, email, this.inviteRole());
      this.inviteEmail.set('');
      this.inviteSuccess.set(`Đã gửi lời mời tới ${email}`);
    } catch (err: any) {
      this.inviteError.set(err?.error?.message || this.i18n.t('group.inviteError'));
    } finally {
      this.inviting.set(false);
    }
  }

  async changeRole(member: GroupMember, role: GroupRole): Promise<void> {
    const group = this.store.activeGroup();
    if (!group || this.updatingRoleUserId()) return;

    // Kiểm lại ngay trước khi gọi API. Backend vẫn là chốt chặn thật, nhưng
    // chặn ở đây tránh việc người dùng thấy lỗi đỏ cho một thao tác mà giao
    // diện lẽ ra không cho phép.
    if (!this.canManageMember(member) || !canAssignRole(this.currentRole(), role)) {
      alert(this.i18n.t('group.noManagePermission'));
      return;
    }

    this.updatingRoleUserId.set(member.userId);
    try {
      await this.store.updateMemberRole(group.id, member.userId, role);
    } catch (err: any) {
      alert(err?.error?.message || this.i18n.t('group.changeRoleError'));
    } finally {
      this.updatingRoleUserId.set(null);
    }
  }

  async removeMember(member: GroupMember): Promise<void> {
    const group = this.store.activeGroup();
    if (!group) return;

    if (member.role === GroupRole.LEADER) {
      alert(this.i18n.t('group.leaderCannotBeRemoved'));
      return;
    }
    if (!this.canManageMember(member)) {
      alert(this.i18n.t('group.noManagePermission'));
      return;
    }

    if (confirm(this.i18n.t('group.removeMemberConfirm', { member: member.email || member.userId }))) {
      await this.store.removeMember(group.id, member.userId);
    }
  }

  async transferLeadership(member: GroupMember): Promise<void> {
    const group = this.store.activeGroup();
    if (!group || this.transferringUserId()) return;
    if (!this.canTransferTo(member)) return;

    const name = member.email || member.userId;
    if (!confirm(this.i18n.t('group.transferConfirm', { member: name }))) return;

    this.transferringUserId.set(member.userId);
    try {
      await this.store.transferLeadership(group.id, member.userId);
    } catch (err: any) {
      alert(err?.error?.message || this.i18n.t('group.transferError'));
    } finally {
      this.transferringUserId.set(null);
    }
  }

  async createTask(): Promise<void> {
    const group = this.store.activeGroup();
    const title = this.taskTitle().trim();
    if (!group || !title || this.creatingTask()) return;

    this.creatingTask.set(true);
    try {
      await this.store.createTask(
        group.id,
        title,
        this.taskDescription().trim(),
        'todo',
        this.taskAssignedTo() || undefined,
        this.taskDueDate() || undefined,
      );
      this.taskTitle.set('');
      this.taskDescription.set('');
      this.taskAssignedTo.set('');
      this.taskDueDate.set('');
    } finally {
      this.creatingTask.set(false);
    }
  }

  async setTaskStatus(task: GroupTask, status: 'todo' | 'in_progress' | 'done'): Promise<void> {
    const group = this.store.activeGroup();
    if (!group) return;
    await this.store.updateTaskStatus(group.id, task.id, status);
  }

  assigneeEmail(task: GroupTask): string {
    const member = this.store.members().find((m) => m.userId === task.assignedTo);
    return member?.email || task.assignedTo || '';
  }

  async reassignTask(task: GroupTask, userId: string): Promise<void> {
    const group = this.store.activeGroup();
    if (!group || this.reassigningTaskId()) return;

    this.reassigningTaskId.set(task.id);
    try {
      await this.store.updateTask(group.id, task.id, { assignedTo: userId || undefined });
    } catch (err: any) {
      alert(err?.error?.message || this.i18n.t('group.reassignError'));
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
    return msg.senderName || msg.senderEmail?.split('@')[0] || 'Thành viên';
  }

  senderAvatarInitial(msg: GroupMessage): string {
    const name = this.senderDisplayName(msg);
    return (name ? name[0] : 'U').toUpperCase();
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
    let hash = 0;
    for (let i = 0; i < msg.senderId.length; i++) {
      hash = (hash * 31 + msg.senderId.charCodeAt(i)) | 0;
    }
    const index = Math.abs(hash) % GroupWorkspaceModal.SENDER_COLOR_PALETTE.length;
    return GroupWorkspaceModal.SENDER_COLOR_PALETTE[index];
  }

  canEditMessage(msg: GroupMessage): boolean {
    return !msg.deletedAt && msg.senderId === this.currentUserId();
  }

  canDeleteMessage(msg: GroupMessage): boolean {
    if (msg.deletedAt) return false;
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

  async saveEditMessage(msg: GroupMessage): Promise<void> {
    const group = this.store.activeGroup();
    const text = this.editingText().trim();
    if (!group || !text) return;

    try {
      await this.store.editMessage(group.id, msg.id, text);
      this.cancelEditMessage();
    } catch (err: any) {
      alert(err?.error?.message || this.i18n.t('group.editMessageError'));
    }
  }

  async deleteMessage(msg: GroupMessage): Promise<void> {
    const group = this.store.activeGroup();
    if (!group) return;
    if (!confirm(this.i18n.t('group.deleteMessageConfirm'))) return;

    try {
      await this.store.deleteMessage(group.id, msg.id);
    } catch (err: any) {
      alert(err?.error?.message || this.i18n.t('group.deleteMessageError'));
    }
  }

  async sendChat(): Promise<void> {
    const group = this.store.activeGroup();
    const text = this.chatMessage().trim();
    const file = this.attachmentFile();
    if (!group || (!text && !file) || this.sendingChat()) return;

    this.sendingChat.set(true);
    this.attachmentError.set(null);
    try {
      let attachment: GroupMessageAttachment | undefined;
      if (file) {
        this.uploadingAttachment.set(true);
        attachment = await this.store.uploadAttachment(group.id, file);
      }
      await this.store.sendMessage(group.id, text, attachment);
      this.chatMessage.set('');
      this.attachmentFile.set(null);
    } catch (err: any) {
      this.attachmentError.set(err?.error?.message || err?.message || this.i18n.t('group.sendMessageError'));
    } finally {
      this.uploadingAttachment.set(false);
      this.sendingChat.set(false);
    }
  }

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }
}
