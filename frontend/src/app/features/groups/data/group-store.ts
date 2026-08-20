import { Injectable, computed, inject, signal } from '@angular/core';
import { Group, GroupMember, GroupMessage, GroupTask } from '../models/group.models';
import { GroupApiService } from '../services/group-api.service';
import { AuthStore } from '../../../core/auth/auth-store';
import { RealtimeService } from '../../../core/realtime/realtime.service';

@Injectable({ providedIn: 'root' })
export class GroupStore {
  private readonly api = inject(GroupApiService);
  private readonly authStore = inject(AuthStore);
  private readonly realtime = inject(RealtimeService);

  readonly groups = signal<Group[]>([]);
  readonly activeGroup = signal<Group | null>(null);
  readonly members = signal<GroupMember[]>([]);
  readonly tasks = signal<GroupTask[]>([]);
  readonly messages = signal<GroupMessage[]>([]);
  readonly loading = signal<boolean>(false);
  readonly activeWorkspaceModalOpen = signal<boolean>(false);

  private realtimeInitialized = false;

  readonly activeGroupId = computed(() => this.activeGroup()?.id ?? null);

  private initRealtime(): void {
    if (this.realtimeInitialized) return;
    this.realtimeInitialized = true;
    this.realtime.connect();

    this.realtime.on<{ groupId: string; message: GroupMessage }>('group:messageSent', (payload) => {
      if (!payload?.message) return;
      const currentActiveId = this.activeGroupId();
      if (payload.groupId === currentActiveId || payload.message.groupId === currentActiveId) {
        this.messages.update((list) => {
          if (list.some((m) => m.id === payload.message.id)) return list;
          return [...list, payload.message];
        });
      }
    });
  }

  async loadGroups(): Promise<void> {
    if (!this.authStore.session()) return;
    try {
      this.loading.set(true);
      this.initRealtime();
      const list = await this.api.getGroups();
      this.groups.set(list);
    } catch (err) {
      console.error('Lỗi khi tải danh sách nhóm:', err);
    } finally {
      this.loading.set(false);
    }
  }

  async createGroup(name: string, description?: string, color?: string): Promise<Group> {
    const newGroup = await this.api.createGroup(name, description, color);
    this.groups.update((prev) => [newGroup, ...prev]);
    return newGroup;
  }

  async selectGroup(group: Group): Promise<void> {
    this.activeGroup.set(group);
    this.activeWorkspaceModalOpen.set(true);

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

  async inviteMember(groupId: string, email: string, role?: string): Promise<GroupMember> {
    const member = await this.api.inviteMember(groupId, email, role);
    this.members.update((prev) => [...prev, member]);
    return member;
  }

  async updateMemberRole(groupId: string, userId: string, role: string): Promise<GroupMember> {
    const updated = await this.api.updateMemberRole(groupId, userId, role);
    this.members.update((prev) => prev.map((m) => (m.userId === userId ? updated : m)));
    return updated;
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
    this.tasks.update((prev) => [task, ...prev]);
    return task;
  }

  async updateTaskStatus(groupId: string, taskId: string, status: 'todo' | 'in_progress' | 'done'): Promise<void> {
    const updated = await this.api.updateTask(groupId, taskId, { status });
    this.tasks.update((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
  }

  async loadMessages(groupId: string): Promise<void> {
    try {
      const list = await this.api.getMessages(groupId);
      this.messages.set(list);
    } catch (err) {
      console.error('Lỗi khi tải tin nhắn nhóm:', err);
    }
  }

  async sendMessage(groupId: string, text: string): Promise<GroupMessage> {
    const msg = await this.api.sendMessage(groupId, text);
    this.messages.update((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
    return msg;
  }

  closeWorkspaceModal(): void {
    this.activeWorkspaceModalOpen.set(false);
  }
}
