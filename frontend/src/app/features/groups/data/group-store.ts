import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Group,
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

@Injectable({ providedIn: 'root' })
export class GroupStore {
  private readonly api = inject(GroupApiService);
  private readonly authStore = inject(AuthStore);
  private readonly realtime = inject(RealtimeService);
  private readonly supabase = inject(SUPABASE_CLIENT);

  readonly groups = signal<Group[]>([]);
  readonly activeGroup = signal<Group | null>(null);
  readonly members = signal<GroupMember[]>([]);
  readonly tasks = signal<GroupTask[]>([]);
  readonly messages = signal<GroupMessage[]>([]);
  readonly loading = signal<boolean>(false);
  readonly activeWorkspaceModalOpen = signal<boolean>(false);

  private realtimeInitialized = false;

  readonly activeGroupId = computed(() => this.activeGroup()?.id ?? null);

  readonly visibleGroups = computed(() => this.groups().filter((g) => !g.hidden));
  readonly hiddenGroups = computed(() => this.groups().filter((g) => g.hidden));

  private initRealtime(): void {
    if (this.realtimeInitialized) return;
    this.realtimeInitialized = true;
    this.realtime.connect();

    // Rejoin the active group's rooms after a reconnect (network blip, token
    // refresh) — join()s aren't remembered server-side across a fresh socket
    // handshake.
    this.realtime.onConnect(() => {
      const group = this.activeGroup();
      if (!group) return;
      this.realtime.joinCalendar(group.id);
      if (group.calendarId) this.realtime.joinCalendar(group.calendarId);
    });

    this.realtime.on<{ groupId: string; message: GroupMessage }>('group:messageSent', (payload) => {
      if (!payload?.message) return;
      if (!this.isActiveGroup(payload.groupId, payload.message.groupId)) return;
      this.messages.update((list) => {
        if (list.some((m) => m.id === payload.message.id)) return list;
        return [...list, payload.message];
      });
    });

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
      if (!this.isActiveGroup(payload.groupId, payload.task.groupId)) return;
      this.tasks.update((list) => {
        if (list.some((t) => t.id === payload.task.id)) return list;
        return [payload.task, ...list];
      });
    });

    this.realtime.on<{ groupId: string; task: GroupTask }>('group:taskUpdated', (payload) => {
      if (!payload?.task) return;
      if (!this.isActiveGroup(payload.groupId, payload.task.groupId)) return;
      this.tasks.update((list) => list.map((t) => (t.id === payload.task.id ? payload.task : t)));
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

  private isActiveGroup(groupId: string, altGroupId?: string): boolean {
    const currentActiveId = this.activeGroupId();
    return groupId === currentActiveId || altGroupId === currentActiveId;
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
    const updated = await this.api.updateTask(groupId, taskId, updates);
    this.tasks.update((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    return updated;
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
