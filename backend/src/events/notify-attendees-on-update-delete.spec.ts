import { EventsService } from './events.service';

/**
 * Người chỉ là ATTENDEE của một sự kiện (không phải thành viên lịch) không tự
 * join được phòng "calendar:<id>" — emitToCalendar() một mình không tới được
 * họ. update()/remove() phải bắn thêm 'event:updated'/'event:deleted' vào
 * room riêng (emitToUser) của từng attendee.
 */
describe('EventsService — báo cho attendee khi sự kiện được sửa/xoá', () => {
  function makeAwaitableQuery(result: { data: unknown; error: unknown }) {
    const query: any = {
      select: () => query,
      is: () => query,
      lt: () => query,
      gt: () => query,
      neq: () => query,
      then: (resolve: (v: unknown) => void) => resolve(result),
    };
    return query;
  }

  function makeService(opts: {
    updatedRow?: Record<string, unknown>;
    deletedRow?: { id: string; calendar_id: string };
    attendeeUserIds: string[];
    attendeeError?: { message: string } | null;
  }) {
    const eventsTable = {
      update: (_patch: unknown) => ({
        eq: () => ({
          select: () => ({
            returns: () =>
              Promise.resolve({
                data: opts.updatedRow ? [opts.updatedRow] : opts.deletedRow ? [opts.deletedRow] : [],
                error: null,
              }),
          }),
        }),
      }),
      select: () => makeAwaitableQuery({ data: [], error: null }),
    };
    const attendeesTable = {
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: opts.attendeeError ? null : opts.attendeeUserIds.map((user_id) => ({ user_id })),
            error: opts.attendeeError ?? null,
          }),
      }),
    };
    const supabase = {
      from: (table: string) => (table === 'events' ? eventsTable : attendeesTable),
    };
    const emitToCalendar = jest.fn();
    const emitToUser = jest.fn();
    const realtimeGateway = { emitToCalendar, emitToUser };
    // gmailUser rỗng → sendIcalLifecycleSafely() thoát sớm, không gửi mail.
    const configService = {
      get: jest.fn((key: string) => (key === 'mail' ? { gmailUser: '' } : undefined)),
    };
    const service = new EventsService(
      realtimeGateway as never,
      {} as never,
      configService as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, supabase, emitToCalendar, emitToUser };
  }

  it('update(): báo cho phòng lịch VÀ cho từng attendee riêng', async () => {
    const { service, supabase, emitToCalendar, emitToUser } = makeService({
      updatedRow: {
        id: 'evt-1',
        calendar_id: 'cal-1',
        title: 'Họp B',
        start_at: '2026-09-01T09:00:00.000Z',
        end_at: '2026-09-01T10:00:00.000Z',
      },
      attendeeUserIds: ['user-attendee-1', 'user-attendee-2'],
    });

    await service.update(supabase as never, 'evt-1', {}, 'user-editor');
    // Vòng microtask cho notifyAttendeesSafely() (chạy "void", không await).
    await Promise.resolve();
    await Promise.resolve();

    expect(emitToCalendar).toHaveBeenCalledWith('cal-1', 'event:updated', expect.objectContaining({ id: 'evt-1' }));
    expect(emitToUser).toHaveBeenCalledWith('user-attendee-1', 'event:updated', expect.objectContaining({ id: 'evt-1' }));
    expect(emitToUser).toHaveBeenCalledWith('user-attendee-2', 'event:updated', expect.objectContaining({ id: 'evt-1' }));
  });

  it('remove(): báo cho phòng lịch VÀ cho từng attendee riêng', async () => {
    const { service, supabase, emitToCalendar, emitToUser } = makeService({
      deletedRow: { id: 'evt-1', calendar_id: 'cal-1' },
      attendeeUserIds: ['user-attendee-1'],
    });

    await service.remove(supabase as never, 'evt-1');
    await Promise.resolve();
    await Promise.resolve();

    expect(emitToCalendar).toHaveBeenCalledWith('cal-1', 'event:deleted', { id: 'evt-1' });
    expect(emitToUser).toHaveBeenCalledWith('user-attendee-1', 'event:deleted', { id: 'evt-1' });
  });

  it('tra danh sách attendee lỗi thì KHÔNG làm hỏng thao tác sửa chính', async () => {
    const { service, supabase, emitToCalendar } = makeService({
      updatedRow: {
        id: 'evt-1',
        calendar_id: 'cal-1',
        title: 'Họp B',
        start_at: '2026-09-01T09:00:00.000Z',
        end_at: '2026-09-01T10:00:00.000Z',
      },
      attendeeUserIds: [],
      attendeeError: { message: 'boom' },
    });

    await expect(service.update(supabase as never, 'evt-1', {}, 'user-editor')).resolves.toMatchObject({
      id: 'evt-1',
    });
    expect(emitToCalendar).toHaveBeenCalled();
  });
});
