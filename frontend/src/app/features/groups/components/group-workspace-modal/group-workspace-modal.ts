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
  protected readonly isOwner = computed(
    () => this.store.activeGroup()?.ownerId === this.authStore.user()?.id,
  );
  protected readonly updatingRoleUserId = signal<string | null>(null);

  protected readonly currentUserId = computed(() => this.authStore.user()?.id ?? null);
  protected readonly currentRole = computed(
    () => this.store.members().find((m) => m.userId === this.currentUserId())?.role ?? null,
  );
  protected readonly canModerateChat = computed(
    () => this.currentRole() === 'owner' || this.currentRole() === 'admin',
  );

  protected readonly todoTasks = computed(() => this.store.tasks().filter((t) => t.status === 'todo'));
  protected readonly inProgressTasks = computed(() =>
    this.store.tasks().filter((t) => t.status === 'in_progress'),
  );
  protected readonly doneTasks = computed(() => this.store.tasks().filter((t) => t.status === 'done'));

  // Member invite form
  protected readonly inviteEmail = signal('');
  protected readonly inviteRole = signal<'admin' | 'member' | 'guest'>('member');
  protected readonly inviting = signal(false);
  protected readonly inviteError = signal<string | null>(null);

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

  async invite(): Promise<void> {
    const group = this.store.activeGroup();
    const email = this.inviteEmail().trim();
    if (!group || !email || this.inviting()) return;

    this.inviting.set(true);
    this.inviteError.set(null);
    try {
      await this.store.inviteMember(group.id, email, this.inviteRole());
      this.inviteEmail.set('');
    } catch (err: any) {
      this.inviteError.set(err?.error?.message || this.i18n.t('group.inviteError'));
    } finally {
      this.inviting.set(false);
    }
  }

  async changeRole(member: GroupMember, role: 'admin' | 'member' | 'guest'): Promise<void> {
    const group = this.store.activeGroup();
    if (!group || this.updatingRoleUserId()) return;

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
    if (confirm(this.i18n.t('group.removeMemberConfirm', { member: member.email || member.userId }))) {
      await this.store.removeMember(group.id, member.userId);
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
