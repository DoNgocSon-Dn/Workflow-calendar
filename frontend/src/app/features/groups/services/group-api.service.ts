import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthStore } from '../../../core/auth/auth-store';
import {
  Group,
  GroupMember,
  GroupMessage,
  GroupMessageAttachment,
  GroupTask,
} from '../models/group.models';

@Injectable({ providedIn: 'root' })
export class GroupApiService {
  private readonly http = inject(HttpClient);
  private readonly authStore = inject(AuthStore);

  private get authHeaders(): HttpHeaders {
    const token = this.authStore.accessToken();
    return new HttpHeaders({
      Authorization: `Bearer ${token ?? ''}`,
    });
  }

  async getGroups(): Promise<Group[]> {
    return firstValueFrom(
      this.http.get<Group[]>(`${environment.apiUrl}/groups`, {
        headers: this.authHeaders,
      }),
    );
  }

  async createGroup(name: string, description?: string, color?: string): Promise<Group> {
    return firstValueFrom(
      this.http.post<Group>(
        `${environment.apiUrl}/groups`,
        { name, description, color },
        { headers: this.authHeaders },
      ),
    );
  }

  async getGroup(id: string): Promise<{ group: Group; members: GroupMember[] }> {
    return firstValueFrom(
      this.http.get<{ group: Group; members: GroupMember[] }>(
        `${environment.apiUrl}/groups/${id}`,
        { headers: this.authHeaders },
      ),
    );
  }

  async inviteMember(groupId: string, email: string, role?: string): Promise<GroupMember> {
    return firstValueFrom(
      this.http.post<GroupMember>(
        `${environment.apiUrl}/groups/${groupId}/members/invite`,
        { email, role },
        { headers: this.authHeaders },
      ),
    );
  }

  async updateMemberRole(groupId: string, userId: string, role: string): Promise<GroupMember> {
    return firstValueFrom(
      this.http.patch<GroupMember>(
        `${environment.apiUrl}/groups/${groupId}/members/${userId}/role`,
        { role },
        { headers: this.authHeaders },
      ),
    );
  }

  async removeMember(groupId: string, userId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`${environment.apiUrl}/groups/${groupId}/members/${userId}`, {
        headers: this.authHeaders,
      }),
    );
  }

  async getTasks(groupId: string): Promise<GroupTask[]> {
    return firstValueFrom(
      this.http.get<GroupTask[]>(`${environment.apiUrl}/groups/${groupId}/tasks`, {
        headers: this.authHeaders,
      }),
    );
  }

  async createTask(
    groupId: string,
    title: string,
    description?: string,
    status?: string,
    assignedTo?: string,
    dueDate?: string,
  ): Promise<GroupTask> {
    return firstValueFrom(
      this.http.post<GroupTask>(
        `${environment.apiUrl}/groups/${groupId}/tasks`,
        { title, description, status, assignedTo, dueDate },
        { headers: this.authHeaders },
      ),
    );
  }

  async updateTask(
    groupId: string,
    taskId: string,
    updates: Partial<GroupTask>,
  ): Promise<GroupTask> {
    return firstValueFrom(
      this.http.patch<GroupTask>(
        `${environment.apiUrl}/groups/${groupId}/tasks/${taskId}`,
        updates,
        { headers: this.authHeaders },
      ),
    );
  }

  async getMessages(groupId: string): Promise<GroupMessage[]> {
    return firstValueFrom(
      this.http.get<GroupMessage[]>(`${environment.apiUrl}/groups/${groupId}/messages`, {
        headers: this.authHeaders,
      }),
    );
  }

  async sendMessage(
    groupId: string,
    message: string,
    attachment?: GroupMessageAttachment,
  ): Promise<GroupMessage> {
    return firstValueFrom(
      this.http.post<GroupMessage>(
        `${environment.apiUrl}/groups/${groupId}/messages`,
        {
          message,
          attachmentUrl: attachment?.url,
          attachmentName: attachment?.name,
          attachmentType: attachment?.type,
          attachmentSize: attachment?.size,
        },
        { headers: this.authHeaders },
      ),
    );
  }

  async editMessage(groupId: string, messageId: string, message: string): Promise<GroupMessage> {
    return firstValueFrom(
      this.http.patch<GroupMessage>(
        `${environment.apiUrl}/groups/${groupId}/messages/${messageId}`,
        { message },
        { headers: this.authHeaders },
      ),
    );
  }

  async deleteMessage(groupId: string, messageId: string): Promise<GroupMessage> {
    return firstValueFrom(
      this.http.delete<GroupMessage>(
        `${environment.apiUrl}/groups/${groupId}/messages/${messageId}`,
        { headers: this.authHeaders },
      ),
    );
  }
}
