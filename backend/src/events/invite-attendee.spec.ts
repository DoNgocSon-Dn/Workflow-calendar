import { ConflictException } from '@nestjs/common';
import { EventsService } from './events.service';

/**
 * `invite()` phải chặn mời chính người đã tạo sự kiện (không phân biệt
 * hoa/thường trong email), và phải chuyển đủ description/meet_link sang
 * MailService khi gửi lời mời thật cho người khác.
 */
describe('EventsService.invite — chặn tự mời + đủ nội dung email', () => {
  interface EventRow {
    id: string;
    calendar_id: string;
    created_by: string | null;
    title: string;
    description: string | null;
    location: string | null;
    meet_link: string | null;
    start_at: string;
    end_at: string;
  }

  function makeService(opts: {
    eventRow: EventRow | null;
    creatorEmail?: string | null;
    lookupUserId?: string | null;
    insertError?: { code?: string; message: string } | null;
  }) {
    const eventsQuery = {
      select: () => eventsQuery,
      eq: () => eventsQuery,
      maybeSingle: () => Promise.resolve({ data: opts.eventRow, error: null }),
    };
    const attendeesQuery = {
      insert: () => attendeesQuery,
      select: () => attendeesQuery,
      single: () =>
        Promise.resolve(
          opts.insertError
            ? { data: null, error: opts.insertError }
            : { data: { id: 'att-1', user_id: opts.lookupUserId, status: 'pending' }, error: null },
        ),
    };
    const rpcCalls: unknown[] = [];
    const supabase = {
      from: (table: string) => (table === 'events' ? eventsQuery : attendeesQuery),
      rpc: (name: string, args: unknown) => {
        rpcCalls.push([name, args]);
        return Promise.resolve({ data: opts.lookupUserId ?? null, error: null });
      },
    };
    const getUserById = jest.fn().mockResolvedValue({
      data: { user: opts.creatorEmail ? { email: opts.creatorEmail } : null },
    });
    const admin = { auth: { admin: { getUserById } } };
    const realtimeGateway = { emitToCalendar: jest.fn(), emitToUser: jest.fn() };
    const sendInviteEmail = jest.fn().mockResolvedValue(undefined);
    const mailService = { sendInviteEmail };
    const configService = { get: jest.fn().mockReturnValue('http://localhost:3000') };
    const supabaseService = { getServiceRoleClient: () => admin };
    const service = new EventsService(
      realtimeGateway as never,
      mailService as never,
      configService as never,
      supabaseService as never,
    );
    return { service, supabase, rpcCalls, sendInviteEmail, getUserById };
  }

  const baseEvent: EventRow = {
    id: 'evt-1',
    calendar_id: 'cal-1',
    created_by: 'user-owner',
    title: 'Họp nhóm',
    description: 'Bàn về Q3',
    location: 'Phòng 301',
    meet_link: 'https://meet.jit.si/abc',
    start_at: '2026-09-01T09:00:00.000Z',
    end_at: '2026-09-01T10:00:00.000Z',
  };

  it('chặn mời chính người tổ chức, không phân biệt hoa/thường', async () => {
    const { service, supabase, rpcCalls } = makeService({
      eventRow: baseEvent,
      creatorEmail: 'Owner@Test.com',
    });

    await expect(
      service.invite(supabase as never, 'evt-1', { email: 'owner@test.com' }),
    ).rejects.toBeInstanceOf(ConflictException);
    // Dừng lại NGAY khi phát hiện tự mời — chưa từng đi tới bước tra user_id
    // hay insert, tránh tạo rác hoặc gửi email thừa.
    expect(rpcCalls.length).toBe(0);
  });

  it('mời người khác bình thường: tạo attendee và gửi email đủ mô tả + link họp', async () => {
    const { service, supabase, sendInviteEmail } = makeService({
      eventRow: baseEvent,
      creatorEmail: 'owner@test.com',
      lookupUserId: 'user-guest',
    });

    const result = await service.invite(supabase as never, 'evt-1', { email: 'guest@test.com' });
    expect(result.status).toBe('pending');

    await Promise.resolve(); // sendInviteEmailSafely() chạy "void" — nhường 1 vòng microtask.
    expect(sendInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'guest@test.com',
        eventTitle: 'Họp nhóm',
        description: 'Bàn về Q3',
        location: 'Phòng 301',
        meetLink: 'https://meet.jit.si/abc',
      }),
    );
  });

  it('sự kiện không có created_by (dữ liệu cũ) thì không chặn, vẫn mời bình thường', async () => {
    const { service, supabase } = makeService({
      eventRow: { ...baseEvent, created_by: null },
      lookupUserId: 'user-guest',
    });

    await expect(
      service.invite(supabase as never, 'evt-1', { email: 'guest@test.com' }),
    ).resolves.toMatchObject({ status: 'pending' });
  });
});
