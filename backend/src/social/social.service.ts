import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export interface DirectMessage {
  id: string;
  senderId: string;
  recipientId: string;
  clientId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

@Injectable()
export class SocialService {
  constructor(private readonly realtime: RealtimeGateway) {}

  private async rpc<T>(
    client: SupabaseClient,
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    const { data, error } = await client.rpc(name, args);
    if (error) {
      if (error.code === '42501') throw new ForbiddenException(error.message);
      if (error.code === 'P0002') throw new NotFoundException(error.message);
      if (['22023', '23505', '23514', '22P02'].includes(error.code))
        throw new BadRequestException(error.message);
      if (['PGRST202', '42P01', '42883'].includes(error.code))
        throw new ServiceUnavailableException(
          'Kết bạn và chat riêng chưa được thiết lập trên máy chủ.',
        );
      throw new InternalServerErrorException(
        'Không xử lý được yêu cầu liên hệ. Vui lòng thử lại.',
      );
    }
    return data as T;
  }

  overview(client: SupabaseClient) {
    return this.rpc(client, 'social_overview');
  }
  async code(client: SupabaseClient) {
    return { code: await this.rpc<string>(client, 'social_my_friend_code') };
  }

  async requestCode(client: SupabaseClient, userId: string, code: string) {
    const result = await this.rpc<{ id: string; requesterId: string; recipientId: string; status: string }>(
      client, 'social_request_friend_code', { p_code: code.trim() },
    );
    this.changed(userId, result.requesterId === userId ? result.recipientId : result.requesterId);
    return result;
  }

  async request(client: SupabaseClient, userId: string, email: string) {
    const result = await this.rpc<{
      id: string;
      requesterId: string;
      recipientId: string;
      status: string;
    }>(client, 'social_request_friend', { p_email: email.trim() });
    this.changed(
      userId,
      result.requesterId === userId ? result.recipientId : result.requesterId,
    );
    return result;
  }
  async action(
    client: SupabaseClient,
    userId: string,
    id: string,
    action: string,
  ) {
    const result = await this.rpc<{ peerId: string }>(
      client,
      'social_friend_action',
      { p_id: id, p_action: action },
    );
    this.changed(userId, result.peerId);
    return result;
  }
  async block(
    client: SupabaseClient,
    userId: string,
    peerId: string,
    blocked: boolean,
  ) {
    const result = await this.rpc(client, 'social_block', {
      p_peer: peerId,
      p_block: blocked,
    });
    this.changed(userId, peerId);
    return result;
  }
  messages(client: SupabaseClient, peerId: string, before?: string) {
    return this.rpc(client, 'social_messages', {
      p_peer: peerId,
      p_before: before ?? null,
      p_limit: 50,
    });
  }
  async send(
    client: SupabaseClient,
    userId: string,
    peerId: string,
    clientId: string,
    body: string,
  ) {
    if (!body.trim())
      throw new BadRequestException('Tin nhắn không được để trống.');
    const result = await this.rpc<{ message: DirectMessage; created: boolean }>(
      client,
      'social_send_message',
      { p_peer: peerId, p_client: clientId, p_body: body },
    );
    if (result.created) {
      this.realtime.emitToUser(userId, 'direct:message', result.message);
      this.realtime.emitToUser(peerId, 'direct:message', result.message);
    }
    return result.message;
  }
  async read(client: SupabaseClient, userId: string, ids: string[]) {
    // The RPC only acknowledges messages whose recipient is the current JWT user.
    const readIds = await this.rpc<string[]>(client, 'social_mark_read', {
      p_ids: ids,
    });
    if (readIds.length) {
      const { data, error } = await client
        .from('direct_messages')
        .select('id,sender_id')
        .in('id', readIds)
        .eq('recipient_id', userId);
      if (!error)
        for (const sender of new Set(
          (data ?? []).map((row) => row.sender_id as string),
        )) {
          // Do not expose IDs from other private conversations in a batch receipt.
          const senderIds = (data ?? [])
            .filter((row) => row.sender_id === sender)
            .map((row) => row.id as string);
          this.realtime.emitToUser(sender, 'direct:read', {
            readerId: userId,
            messageIds: senderIds,
          });
        }
      this.realtime.emitToUser(userId, 'social:changed', {});
    }
    return { messageIds: readIds };
  }
  private changed(a: string, b: string) {
    this.realtime.emitToUser(a, 'social:changed', {});
    this.realtime.emitToUser(b, 'social:changed', {});
  }
}
