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
import { TranslationService } from '../../../../core/i18n/translation.service';
import { DialogService } from '../../../../core/services/dialog.service';
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
  GroupMessageMention,
  GroupTask,
} from '../../models/group.models';
import { MentionOption, MentionPopup } from '../mention-popup/mention-popup';
import {
  ActiveMentionQuery,
  MENTION_ALL_LABEL,
  MessageSegment,
  findActiveMention,
  insertMention,
  normalizeForMentionSearch,
  splitMessageSegments,
} from '../../utils/mention.util';

type WorkspaceTab = 'members' | 'calendar' | 'tasks' | 'chat';

@Component({
  selector: 'app-group-workspace-modal',
  templateUrl: './group-workspace-modal.html',
  styleUrl: './group-workspace-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Icon, MentionPopup],
})
export class GroupWorkspaceModal {
  protected readonly store = inject(GroupStore);
  private readonly authStore = inject(AuthStore);
  protected readonly i18n = inject(TranslationService);
  private readonly dialog = inject(DialogService);

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

  /** Tên hiển thị cho một thành viên — ưu tiên tên thật, rồi mới tới phần
   *  trước "@" của email (KHÔNG BAO GIỜ email đầy đủ: lộ cả @gmail.com trong
   *  danh sách chọn người phụ trách thì vừa dài dòng vừa không phải là tên).
   *  Cùng thứ tự ưu tiên với `senderDisplayName` bên khung chat. */
  protected memberDisplayName(member: Pick<GroupMember, 'name' | 'email'> | undefined, fallback = 'Thành viên'): string {
    return member?.name || member?.email?.split('@')[0] || fallback;
  }


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
  protected readonly chatInput = viewChild<ElementRef<HTMLInputElement>>('chatInput');
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

  // Xoá nhóm kéo theo task, tin nhắn và cả lịch nhóm — chỉ cần xác nhận
  // Đồng ý/Hủy qua DialogService dùng chung toàn app, không dùng
  // window.confirm() gốc của trình duyệt (xấu, không theo theme, có thể bị chặn).
  async deleteGroup(): Promise<void> {
    const group = this.store.activeGroup();
    if (!group || this.deletingGroup()) return;

    const ok = await this.dialog.confirm(
      `Toàn bộ task, tin nhắn và lịch nhóm sẽ bị xóa và KHÔNG thể khôi phục.`,
      { title: `Xóa vĩnh viễn nhóm "${group.name}"?`, confirmLabel: 'Đồng ý xóa', danger: true },
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
    () => !!this.taskTitle().trim() && !!this.taskAssignedTo() && !this.creatingTask(),
  );

  async createTask(): Promise<void> {
    const group = this.store.activeGroup();
    const title = this.taskTitle().trim();
    if (!group || !this.canCreateTask()) return;

    this.creatingTask.set(true);
    try {
      await this.store.createTask(
        group.id,
        title,
        this.taskDescription().trim(),
        'todo',
        this.taskAssignedTo(),
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
    if (!group || task.status === status) return;
    await this.store.updateTaskStatus(group.id, task.id, status);
  }

  assigneeName(task: GroupTask): string {
    if (!task.assignedTo) return '';
    const member = this.store.members().find((m) => m.userId === task.assignedTo);
    return this.memberDisplayName(member, task.assignedTo);
  }

  /** Người tạo task hoặc chủ nhóm/quản trị viên mới xoá được — cùng quy tắc
   *  với `canDeleteMessage` bên khung chat, KHÔNG phải "chỉ chủ nhóm". */
  canDeleteTask(task: GroupTask): boolean {
    return task.createdBy === this.currentUserId() || this.canModerateChat();
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
    if (!group || this.reassigningTaskId()) return;

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
  private syncMentionQuery(el: HTMLInputElement): void {
    const caret = el.selectionStart ?? el.value.length;
    this.mentionQuery.set(findActiveMention(el.value, caret));
    this.mentionActiveIndex.set(0);
  }

  protected onChatInput(event: Event): void {
    const el = event.target as HTMLInputElement;
    this.chatMessage.set(el.value);
    this.syncMentionQuery(el);
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
    this.syncMentionQuery(event.target as HTMLInputElement);
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
   * Hai luật quan trọng:
   *   - Popup mention đang mở và có gợi ý thì Enter CHỈ chèn mention, không gửi.
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

    if (event.key === 'Enter') {
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
    if (!group || (!text && !file)) return;
    // Chỉ chặn khi đang tải tệp lên — gửi chữ thì bấm Enter liên tục bao nhiêu
    // lần cũng được, mỗi lần là một tin nhắn riêng.
    if (file && this.sendingChat()) return;

    const mentions = this.resolveMentions(text);

    this.chatMessage.set('');
    this.selectedMentions.set([]);
    this.closeMentionPopup();
    this.attachmentError.set(null);
    this.attachmentFile.set(null);

    void this.deliverChat(group.id, text, mentions, file);
  }

  /** Phần chạy nền của sendChat. Hỏng thì trả nội dung về ô nhập để người
   *  dùng gửi lại — trừ khi họ đã kịp gõ nội dung mới, lúc đó ghi đè lên sẽ
   *  xoá mất thứ họ đang viết. */
  private async deliverChat(
    groupId: string,
    text: string,
    mentions: GroupMessageMention[],
    file: File | null,
  ): Promise<void> {
    try {
      let attachment: GroupMessageAttachment | undefined;
      if (file) {
        this.uploadingAttachment.set(true);
        this.sendingChat.set(true);
        attachment = await this.store.uploadAttachment(groupId, file);
      }
      await this.store.sendMessage(groupId, text, attachment, mentions);
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

  /** Mention trỏ vào chính người đang đọc (kể cả qua @All) được tô đậm hơn —
   *  đó là thứ họ cần thấy ngay khi lướt qua một khung chat dài. */
  isMentionForMe(segment: MessageSegment): boolean {
    const mention = segment.mention;
    if (!mention) return false;
    if (mention.type === 'all') return true;
    return mention.userId === this.currentUserId();
  }

  close(): void {
    this.store.closeWorkspaceModal();
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }
}
