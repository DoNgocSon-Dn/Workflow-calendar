import { InternalServerErrorException } from '@nestjs/common';
import { EventsService } from './events.service';

/**
 * `listMyInvites` đổ lời mời sự kiện đang chờ của người gọi cho client kéo lúc
 * mở app — bù cho việc gói realtime `attendee:invited` mất hẳn nếu người được
 * mời đang offline. Dùng service-role + tự lọc `user_id` (từ JWT) để không phụ
 * thuộc migration RLS 23.
 */
describe('EventsService.listMyInvites', () => {
  function makeService(rows: unknown[] | null, error: { message: string } | null = null) {
    const eqCalls: [string, unknown][] = [];
    const q = {
      select: () => q,
      eq: (col: string, val: unknown) => {
        eqCalls.push([col, val]);
        // Trả kết quả sau lần .eq() thứ hai (user_id + status).
        return eqCalls.length >= 2 ? Promise.resolve({ data: rows, error }) : q;
      },
    };
    const admin = { from: () => q };
    const service = new EventsService(
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
      { getServiceRoleClient: () => admin } as never,
      {} as never,
      {} as never,
    );
    return { service, eqCalls };
  }

  it('lọc theo user_id truyền vào + status pending, map sang DTO phẳng', async () => {
    const rows = [
      {
        id: 'att-1',
        status: 'pending',
        event: {
          id: 'evt-1',
          title: 'Họp nhóm',
          start_at: '2026-09-01T09:00:00.000Z',
          end_at: '2026-09-01T10:00:00.000Z',
          calendar_id: 'cal-1',
        },
      },
    ];
    const { service, eqCalls } = makeService(rows);
    const result = await service.listMyInvites('user-9');

    expect(eqCalls).toContainEqual(['user_id', 'user-9']);
    expect(eqCalls).toContainEqual(['status', 'pending']);
    expect(result).toEqual([
      {
        attendeeId: 'att-1',
        eventId: 'evt-1',
        title: 'Họp nhóm',
        start: '2026-09-01T09:00:00.000Z',
        end: '2026-09-01T10:00:00.000Z',
        calendarId: 'cal-1',
      },
    ]);
  });

  it('bỏ hàng thiếu event nhúng', async () => {
    const { service } = makeService([{ id: 'att-2', status: 'pending', event: null }]);
    expect(await service.listMyInvites('u')).toEqual([]);
  });

  it('data null → mảng rỗng', async () => {
    const { service } = makeService(null);
    expect(await service.listMyInvites('u')).toEqual([]);
  });

  it('lỗi supabase → InternalServerErrorException', async () => {
    const { service } = makeService(null, { message: 'boom' });
    await expect(service.listMyInvites('u')).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
