import { ValidationPipe } from '@nestjs/common';
import {
  BlockUserDto,
  FriendActionDto,
  FriendRequestDto,
  FriendCodeRequestDto,
  ReadMessagesDto,
  SendDirectMessageDto,
} from './social.dto';

describe('social input validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const id = '10000000-0000-4000-8000-000000000001';
  const check = (value: unknown, metatype: any) =>
    pipe.transform(value, { type: 'body', metatype });
  it('accepts text with an idempotency UUID', async () => {
    await expect(
      check({ clientId: id, body: 'Hello' }, SendDirectMessageDto),
    ).resolves.toMatchObject({ body: 'Hello' });
  });
  it.each([
    [{ code: 'WF-guess' }, FriendCodeRequestDto],
    [{ code: 'WF-A1B2-C3D4-E5F6', userId: id }, FriendCodeRequestDto],
    [{ clientId: id, body: 'Hi', senderId: id }, SendDirectMessageDto],
    [{ clientId: 'bad', body: 'Hi' }, SendDirectMessageDto],
    [{ clientId: id, body: 'a'.repeat(4001) }, SendDirectMessageDto],
    [{ email: 'bad-address' }, FriendRequestDto],
    [{ action: 'make-admin' }, FriendActionDto],
    [{ blocked: 'false' }, BlockUserDto],
    [{ messageIds: Array(101).fill(id) }, ReadMessagesDto],
    [{ messageIds: ['invalid'] }, ReadMessagesDto],
    [{ messageIds: [id, id] }, ReadMessagesDto],
  ])('rejects malformed or forged input %#', async (body, type) => {
    await expect(check(body, type)).rejects.toThrow();
  });
  it.each(['WF-A1B2-C3D4-E5F6', 'wf-a1b2c3d4e5f6', 'A1B2C3D4E5F6'])('accepts a share code %s', async code => {
    await expect(check({ code }, FriendCodeRequestDto)).resolves.toMatchObject({ code });
  });
});
