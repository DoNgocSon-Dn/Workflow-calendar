import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthStore } from '../../../core/auth/auth-store';
import {
  Group,
  GroupInvite,
  GroupInviteLink,
  GroupInviteLinkPreview,
  GroupJoinRequest,
  GroupPendingInvite,
  GroupMember,
  GroupMessage,
  GroupMessageAttachment,
  GroupMessageMention,
  GroupMeeting,
  GroupTask,
  GroupUpdate,
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

  async createGroup(
    name: string,
    description?: string,
    color?: string,
    requiresApproval?: boolean,
  ): Promise<Group> {
    return firstValueFrom(
      this.http.post<Group>(
        `${environment.apiUrl}/groups`,
        { name, description, color, requiresApproval },
        { headers: this.authHeaders },
      ),
    );
  }

  /** Tham gia nhóm bằng mã ngắn (màn hình Dashboard). */
  async joinByCode(
    code: string,
  ): Promise<{ status: 'joined'; group: Group } | { status: 'pending'; groupId: string }> {
    return firstValueFrom(
      this.http.post<
        { status: 'joined'; group: Group } | { status: 'pending'; groupId: string }
      >(`${environment.apiUrl}/groups/join-by-code`, { code }, { headers: this.authHeaders }),
    );
  }

  async getJoinCode(groupId: string): Promise<{ code: string; requiresApproval: boolean }> {
    return firstValueFrom(
      this.http.get<{ code: string; requiresApproval: boolean }>(
        `${environment.apiUrl}/groups/${groupId}/join-code`,
        { headers: this.authHeaders },
      ),
    );
  }

  async regenerateJoinCode(groupId: string): Promise<{ code: string }> {
    return firstValueFrom(
      this.http.post<{ code: string }>(
        `${environment.apiUrl}/groups/${groupId}/join-code`,
        {},
        { headers: this.authHeaders },
      ),
    );
  }

  async updateGroup(id: string, updates: GroupUpdate): Promise<Group> {
    return firstValueFrom(
      this.http.patch<Group>(`${environment.apiUrl}/groups/${id}`, updates, {
        headers: this.authHeaders,
      }),
    );
  }

  async deleteGroup(id: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<{ message: string }>(`${environment.apiUrl}/groups/${id}`, {
        headers: this.authHeaders,
      }),
    );
  }

  async setGroupHidden(id: string, hidden: boolean): Promise<{ groupId: string; hidden: boolean }> {
    return firstValueFrom(
      this.http.patch<{ groupId: string; hidden: boolean }>(
        `${environment.apiUrl}/groups/${id}/visibility`,
        { hidden },
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

  /** Tạo lời mời ở trạng thái pending — người được mời phải tự chấp nhận. */
  async inviteMember(groupId: string, email: string, role?: string): Promise<GroupInvite> {
    return firstValueFrom(
      this.http.post<GroupInvite>(
        `${environment.apiUrl}/groups/${groupId}/members/invite`,
        { email, role },
        { headers: this.authHeaders },
      ),
    );
  }

  async getMyInvites(): Promise<GroupInvite[]> {
    return firstValueFrom(
      this.http.get<GroupInvite[]>(`${environment.apiUrl}/groups/invites/mine`, {
        headers: this.authHeaders,
      }),
    );
  }

  /** Lời mời đang chờ của một nhóm — chỉ trưởng/phó nhóm gọi được. */
  async listGroupInvites(groupId: string): Promise<GroupPendingInvite[]> {
    return firstValueFrom(
      this.http.get<GroupPendingInvite[]>(`${environment.apiUrl}/groups/${groupId}/invites`, {
        headers: this.authHeaders,
      }),
    );
  }

  async cancelGroupInvite(groupId: string, inviteId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${environment.apiUrl}/groups/${groupId}/invites/${inviteId}`, {
        headers: this.authHeaders,
      }),
    );
  }

  async respondInvite(inviteId: string, status: 'accepted' | 'declined'): Promise<GroupInvite> {
    return firstValueFrom(
      this.http.patch<GroupInvite>(
        `${environment.apiUrl}/groups/invites/${inviteId}/respond`,
        { status },
        { headers: this.authHeaders },
      ),
    );
  }

  /** `null` khi nhóm chưa có link mời nào đang hoạt động. */
  async getInviteLink(groupId: string): Promise<GroupInviteLink | null> {
    return firstValueFrom(
      this.http.get<GroupInviteLink | null>(
        `${environment.apiUrl}/groups/${groupId}/invite-link`,
        { headers: this.authHeaders },
      ),
    );
  }

  /** Tạo link mời mới — nếu đã có link active thì link cũ bị thu hồi. */
  async regenerateInviteLink(groupId: string, role?: string): Promise<GroupInviteLink> {
    return firstValueFrom(
      this.http.post<GroupInviteLink>(
        `${environment.apiUrl}/groups/${groupId}/invite-link`,
        { role },
        { headers: this.authHeaders },
      ),
    );
  }

  /** Xem trước nhóm bằng token, trước khi người dùng bấm gửi yêu cầu. */
  async getInviteLinkPreview(token: string): Promise<GroupInviteLinkPreview> {
    return firstValueFrom(
      this.http.get<GroupInviteLinkPreview>(
        `${environment.apiUrl}/groups/invite-link/preview`,
        { headers: this.authHeaders, params: { token } },
      ),
    );
  }

  async requestToJoin(token: string): Promise<GroupJoinRequest> {
    return firstValueFrom(
      this.http.post<GroupJoinRequest>(
        `${environment.apiUrl}/groups/invite-link/join`,
        { token },
        { headers: this.authHeaders },
      ),
    );
  }

  async listJoinRequests(groupId: string): Promise<GroupJoinRequest[]> {
    return firstValueFrom(
      this.http.get<GroupJoinRequest[]>(
        `${environment.apiUrl}/groups/${groupId}/join-requests`,
        { headers: this.authHeaders },
      ),
    );
  }

  async decideJoinRequest(
    groupId: string,
    requestId: string,
    status: 'approved' | 'declined',
  ): Promise<GroupJoinRequest> {
    return firstValueFrom(
      this.http.patch<GroupJoinRequest>(
        `${environment.apiUrl}/groups/${groupId}/join-requests/${requestId}`,
        { status },
        { headers: this.authHeaders },
      ),
    );
  }

  /** Task được giao cho mình trên mọi nhóm — dùng để theo dõi deadline. */
  async getMyTasks(): Promise<GroupTask[]> {
    return firstValueFrom(
      this.http.get<GroupTask[]>(`${environment.apiUrl}/groups/tasks/mine`, {
        headers: this.authHeaders,
      }),
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

  /** Chuyển ghế trưởng nhóm. Tách khỏi updateMemberRole có chủ đích —
   *  backend không cho phép gán vai trò LEADER qua đường phân quyền thường. */
  async transferLeadership(groupId: string, userId: string): Promise<GroupMember[]> {
    const res = await firstValueFrom(
      this.http.patch<{ members: GroupMember[] }>(
        `${environment.apiUrl}/groups/${groupId}/members/${userId}/transfer-leadership`,
        {},
        { headers: this.authHeaders },
      ),
    );
    return res.members;
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

  async deleteTask(groupId: string, taskId: string): Promise<{ id: string }> {
    return firstValueFrom(
      this.http.delete<{ id: string }>(
        `${environment.apiUrl}/groups/${groupId}/tasks/${taskId}`,
        { headers: this.authHeaders },
      ),
    );
  }

  /** `null` khi nhóm chưa mở phòng họp nào. */
  async getMeeting(groupId: string): Promise<GroupMeeting | null> {
    return firstValueFrom(
      this.http.get<GroupMeeting | null>(`${environment.apiUrl}/groups/${groupId}/meeting`, {
        headers: this.authHeaders,
      }),
    );
  }

  async upsertMeeting(
    groupId: string,
    payload: { link: string; title?: string; startsAt?: string; durationMin?: number },
  ): Promise<GroupMeeting> {
    return firstValueFrom(
      this.http.put<GroupMeeting>(
        `${environment.apiUrl}/groups/${groupId}/meeting`,
        payload,
        { headers: this.authHeaders },
      ),
    );
  }

  async deleteMeeting(groupId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<{ ok: boolean }>(`${environment.apiUrl}/groups/${groupId}/meeting`, {
        headers: this.authHeaders,
      }),
    );
  }

  async getMessages(groupId: string): Promise<GroupMessage[]> {
    return firstValueFrom(
      this.http.get<GroupMessage[]>(`${environment.apiUrl}/groups/${groupId}/messages`, {
        headers: this.authHeaders,
      }),
    );
  }

  /** Mốc "đã đọc tới đâu" của từng thành viên — để hiện "Đã xem". */
  async getMessageReads(groupId: string): Promise<{ userId: string; at: string }[]> {
    return firstValueFrom(
      this.http.get<{ userId: string; at: string }[]>(
        `${environment.apiUrl}/groups/${groupId}/message-reads`,
        { headers: this.authHeaders },
      ),
    );
  }

  async markMessagesRead(groupId: string): Promise<{ at: string }> {
    return firstValueFrom(
      this.http.post<{ at: string }>(
        `${environment.apiUrl}/groups/${groupId}/messages/read`,
        {},
        { headers: this.authHeaders },
      ),
    );
  }

  async listReactions(
    groupId: string,
  ): Promise<{ messageId: string; emoji: string; userIds: string[] }[]> {
    return firstValueFrom(
      this.http.get<{ messageId: string; emoji: string; userIds: string[] }[]>(
        `${environment.apiUrl}/groups/${groupId}/message-reactions`,
        { headers: this.authHeaders },
      ),
    );
  }

  async toggleReaction(
    groupId: string,
    messageId: string,
    emoji: string,
  ): Promise<{ added: boolean }> {
    return firstValueFrom(
      this.http.post<{ added: boolean }>(
        `${environment.apiUrl}/groups/${groupId}/messages/${messageId}/reactions`,
        { emoji },
        { headers: this.authHeaders },
      ),
    );
  }

  async setMessagePinned(
    groupId: string,
    messageId: string,
    pinned: boolean,
  ): Promise<void> {
    const url = `${environment.apiUrl}/groups/${groupId}/messages/${messageId}/pin`;
    await firstValueFrom(
      pinned
        ? this.http.post(url, {}, { headers: this.authHeaders })
        : this.http.delete(url, { headers: this.authHeaders }),
    );
  }

  async sendMessage(
    groupId: string,
    message: string,
    attachment?: GroupMessageAttachment,
    mentions?: readonly GroupMessageMention[],
    replyToId?: string,
    forwardedFromGroup?: string,
  ): Promise<GroupMessage> {
    return firstValueFrom(
      this.http.post<GroupMessage>(
        `${environment.apiUrl}/groups/${groupId}/messages`,
        {
          message,
          // Bỏ hẳn trường khi không có mention: backend bật
          // forbidNonWhitelisted nên mảng rỗng vẫn hợp lệ, nhưng gửi undefined
          // giữ payload đúng bằng những gì thực sự có.
          mentions: mentions?.length ? mentions : undefined,
          attachmentUrl: attachment?.url,
          attachmentName: attachment?.name,
          attachmentType: attachment?.type,
          attachmentSize: attachment?.size,
          replyToId: replyToId || undefined,
          forwardedFromGroup: forwardedFromGroup || undefined,
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
