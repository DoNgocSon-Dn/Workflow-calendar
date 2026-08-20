import { ChangeDetectionStrategy, Component, computed, effect, inject, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AuthStore } from '../../../../core/auth/auth-store';
import { GroupStore } from '../../data/group-store';
import { GroupMember, GroupTask } from '../../models/group.models';

type WorkspaceTab = 'members' | 'calendar' | 'tasks' | 'chat';

@Component({
  selector: 'app-group-workspace-modal',
  templateUrl: './group-workspace-modal.html',
  styleUrl: './group-workspace-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
})
export class GroupWorkspaceModal {
  protected readonly store = inject(GroupStore);
  private readonly authStore = inject(AuthStore);

  readonly closed = output<void>();

  protected readonly activeTab = signal<WorkspaceTab>('tasks');
  protected readonly isOwner = computed(
    () => this.store.activeGroup()?.ownerId === this.authStore.user()?.id,
  );
  protected readonly updatingRoleUserId = signal<string | null>(null);

  protected readonly groupInitial = computed(
    () => (this.store.activeGroup()?.name || '?').trim().charAt(0).toUpperCase(),
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

  // Chat form
  protected readonly chatMessage = signal('');
  protected readonly sendingChat = signal(false);

  constructor() {
    effect(() => {
      const msgs = this.store.messages();
      if (this.activeTab() === 'chat' && msgs.length > 0) {
        setTimeout(() => {
          const el = document.querySelector('.chat-messages');
          if (el) el.scrollTop = el.scrollHeight;
        }, 50);
      }
    });
  }

  setTab(tab: WorkspaceTab): void {
    this.activeTab.set(tab);
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
      this.inviteError.set(err?.error?.message || 'Không thể mời thành viên. Kiểm tra lại email.');
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
      alert(err?.error?.message || 'Không thể đổi quyền thành viên.');
    } finally {
      this.updatingRoleUserId.set(null);
    }
  }

  async removeMember(member: GroupMember): Promise<void> {
    const group = this.store.activeGroup();
    if (!group) return;
    if (confirm(`Bạn có chắc chắn muốn xóa ${member.email || member.userId} khỏi nhóm?`)) {
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

  async sendChat(): Promise<void> {
    const group = this.store.activeGroup();
    const text = this.chatMessage().trim();
    if (!group || !text || this.sendingChat()) return;

    this.sendingChat.set(true);
    try {
      await this.store.sendMessage(group.id, text);
      this.chatMessage.set('');
    } finally {
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
