import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SocialService } from './social.service';

describe('private contacts service', () => {
  const rpc = jest.fn();
  const emitToUser = jest.fn();
  const client = { rpc } as unknown as SupabaseClient;
  const service = new SocialService({
    emitToUser,
  } as unknown as RealtimeGateway);
  const message = {
    id: 'm',
    senderId: 'a',
    recipientId: 'b',
    clientId: 'k',
    body: 'hello',
    createdAt: '2026-10-31T00:00:00Z',
    readAt: null,
  };
  beforeEach(() => jest.clearAllMocks());
  it('sends code invitations through the scoped RPC and updates both participants', async () => {
    rpc.mockResolvedValue({ data: { id: 'r', requesterId: 'a', recipientId: 'b', status: 'pending' }, error: null });
    await service.requestCode(client, 'a', 'WF-A1B2-C3D4-E5F6');
    expect(rpc).toHaveBeenCalledWith('social_request_friend_code', { p_code: 'WF-A1B2-C3D4-E5F6' });
    expect(emitToUser.mock.calls.map(call => call[0])).toEqual(['a', 'b']);
  });

  it('emits a saved message only to its two participants', async () => {
    rpc.mockResolvedValue({ data: { message, created: true }, error: null });
    await expect(service.send(client, 'a', 'b', 'k', 'hello')).resolves.toEqual(
      message,
    );
    expect(emitToUser.mock.calls).toEqual([
      ['a', 'direct:message', message],
      ['b', 'direct:message', message],
    ]);
  });
  it('does not rebroadcast an idempotent retry', async () => {
    rpc.mockResolvedValue({ data: { message, created: false }, error: null });
    await service.send(client, 'a', 'b', 'k', 'hello');
    expect(emitToUser).not.toHaveBeenCalled();
  });
  it('rejects blank content before reaching the database', async () => {
    await expect(
      service.send(client, 'a', 'b', 'k', '  \n '),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    ['42501', ForbiddenException],
    ['P0002', NotFoundException],
    ['22023', BadRequestException],
    ['PGRST202', ServiceUnavailableException],
    ['42P01', ServiceUnavailableException],
  ])(
    'maps SQL error %s without emitting a success event',
    async (code, type) => {
      rpc.mockResolvedValue({ data: null, error: { code, message: 'test' } });
      await expect(
        service.send(client, 'a', 'b', 'k', 'hello'),
      ).rejects.toBeInstanceOf(type);
      expect(emitToUser).not.toHaveBeenCalled();
    },
  );
  it('scopes a batched read receipt to each original sender', async () => {
    rpc.mockResolvedValue({ data: ['m1', 'm2'], error: null });
    const eq = jest.fn().mockResolvedValue({
      data: [
        { id: 'm1', sender_id: 'a' },
        { id: 'm2', sender_id: 'c' },
      ],
      error: null,
    });
    const select = jest
      .fn()
      .mockReturnValue({ in: jest.fn().mockReturnValue({ eq }) });
    const scoped = {
      rpc,
      from: jest.fn().mockReturnValue({ select }),
    } as unknown as SupabaseClient;
    await service.read(scoped, 'b', ['m1', 'm2', 'foreign']);
    expect(eq).toHaveBeenCalledWith('recipient_id', 'b');
    expect(emitToUser.mock.calls).toEqual([
      ['a', 'direct:read', { readerId: 'b', messageIds: ['m1'] }],
      ['c', 'direct:read', { readerId: 'b', messageIds: ['m2'] }],
      ['b', 'social:changed', {}],
    ]);
  });
  it('does not emit receipts for IDs that RPC did not acknowledge', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(service.read(client, 'b', ['foreign'])).resolves.toEqual({
      messageIds: [],
    });
    expect(emitToUser).not.toHaveBeenCalled();
  });
  it('notifies only the two users when a friend request changes', async () => {
    rpc.mockResolvedValue({
      data: { id: 'r', requesterId: 'b', recipientId: 'a', status: 'pending' },
      error: null,
    });
    await service.request(client, 'a', ' friend@example.com ');
    expect(rpc).toHaveBeenCalledWith('social_request_friend', {
      p_email: 'friend@example.com',
    });
    expect(emitToUser.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
  });
});
