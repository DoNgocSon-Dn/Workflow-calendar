import { ValidationPipe } from '@nestjs/common';
import {
  BlockUserDto,
  FriendActionDto,
  FriendRequestDto,
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
});
