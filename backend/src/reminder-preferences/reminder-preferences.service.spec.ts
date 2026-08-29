import { ReminderPreferencesService, DEFAULT_REMINDER_OFFSETS } from './reminder-preferences.service';

describe('ReminderPreferencesService', () => {
  function make(overrides: {
    selectResult?: { data: unknown; error: unknown };
    upsertError?: { message: string } | null;
  }) {
    const upsert = jest.fn().mockResolvedValue({ error: overrides.upsertError ?? null });
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve(overrides.selectResult ?? { data: null, error: null }),
          }),
        }),
      }),
    };
    const supabase = {
      upsert,
      from: () => supabase,
    };
    const service = new ReminderPreferencesService({
      getServiceRoleClient: () => admin,
    } as never);
    return { service, supabase, upsert };
  }

  it('getOffsets trả bộ mặc định khi chưa có hàng', async () => {
    const { service } = make({ selectResult: { data: null, error: null } });
    expect(await service.getOffsets('u1')).toEqual(DEFAULT_REMINDER_OFFSETS);
  });

  it('getOffsets trả bộ mặc định khi bảng chưa tồn tại (42P01)', async () => {
    const { service } = make({ selectResult: { data: null, error: { code: '42P01', message: 'x' } } });
    expect(await service.getOffsets('u1')).toEqual(DEFAULT_REMINDER_OFFSETS);
  });

  it('setOffsets bỏ trùng, âm, sắp giảm dần, tối đa 12', async () => {
    const { service, supabase, upsert } = make({});
    const res = await service.setOffsets(supabase as never, 'u1', [5, 30, 5, -10, 0, 15]);
    expect(res.offsets).toEqual([30, 15, 5, 0]);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', offsets: [30, 15, 5, 0] }),
      { onConflict: 'user_id' },
    );
  });
});
