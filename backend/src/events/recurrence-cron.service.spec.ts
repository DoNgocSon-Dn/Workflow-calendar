import { RecurrenceCronService } from './recurrence-cron.service';
import { SupabaseService } from '../supabase/supabase.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

function occurrence(start: string, deleted = false, rule: Record<string, unknown> = { freq: 'monthly' }) {
  return { series_id: 'series-1', calendar_id: 'calendar-1', title: 'Monthly meeting',
    start_at: start, end_at: new Date(Date.parse(start) + 3600000).toISOString(),
    recurrence_rule: rule, deleted_at: deleted ? '2026-01-31T12:00:00Z' : null,
    calendar_type: 'solar', start_tz: 'UTC', all_day: false, created_by: 'user-1',
    meet_link: null, location: null, description: null };
}

function harness(rows: ReturnType<typeof occurrence>[], excluded: string[] = []) {
  const insert = jest.fn((added: unknown[]) => ({
    select: () => ({ returns: async () => ({ data: added, error: null }) }),
  }));
  const exceptions = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
    returns: jest.fn(async () => ({ data: excluded.map((occurred_at) => ({ occurred_at })), error: null as { message: string } | null })) };
  const events = { select: jest.fn().mockReturnThis(), not: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(), range: jest.fn().mockReturnThis(),
    returns: jest.fn(async () => ({ data: rows, error: null })), insert };
  const client = { from: (name: string) => name === 'events' ? events : exceptions };
  const service = new RecurrenceCronService({ getScheduledClient: () => client } as unknown as SupabaseService,
    { emitToCalendar: jest.fn() } as unknown as RealtimeGateway);
  return { service, insert, exceptions, events };
}

describe('recurrence top-up preserves deleted anchors', () => {
  beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date('2026-02-01T00:00:00Z')); });
  afterEach(() => jest.useRealTimers());

  it('keeps Jan 31 as the anchor after moving the original occurrence to trash', async () => {
    const { service, insert } = harness([occurrence('2026-01-31T09:00:00Z', true), occurrence('2026-02-28T09:00:00Z')]);
    await service.topUpSeries();
    const added = insert.mock.calls[0][0] as { start_at: string }[];
    expect(added[0].start_at).toBe('2026-03-31T09:00:00.000Z');
  });
  it('recovers a permanently deleted original anchor from the exclusion record', async () => {
    const { service, insert } = harness([occurrence('2026-02-28T09:00:00Z')], ['2026-01-31T09:00:00Z']);
    await service.topUpSeries();
    const added = insert.mock.calls[0][0] as { start_at: string }[];
    expect(added[0].start_at).toBe('2026-03-31T09:00:00.000Z');
  });
  it('does not recreate a series whose occurrences are all in trash', async () => {
    const { service, insert } = harness([occurrence('2026-01-31T09:00:00Z', true)]);
    await service.topUpSeries(); expect(insert).not.toHaveBeenCalled();
  });
  it('does not replace deleted occurrences of a fixed-count series', async () => {
    const rule = { freq: 'monthly', endType: 'count', count: 2 };
    const { service, insert } = harness([occurrence('2026-01-31T09:00:00Z', true, rule), occurrence('2026-02-28T09:00:00Z', false, rule)]);
    await service.topUpSeries(); expect(insert).not.toHaveBeenCalled();
  });
  it('does not recreate excluded events when the exclusion query fails', async () => {
    const { service, insert, exceptions } = harness([occurrence('2026-01-31T09:00:00Z')]);
    exceptions.returns.mockResolvedValue({ data: [], error: { message: 'Database unavailable' } });
    await service.topUpSeries(); expect(insert).not.toHaveBeenCalled();
  });
  it('reads beyond the first Supabase page before determining the series anchor', async () => {
    const { service, events, insert } = harness([]);
    events.returns
      .mockResolvedValueOnce({ data: Array.from({ length: 1000 }, () => occurrence('2026-01-31T09:00:00Z', true)), error: null })
      .mockResolvedValueOnce({ data: [occurrence('2026-02-28T09:00:00Z')], error: null });
    await service.topUpSeries();
    expect(events.range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
    const added = insert.mock.calls[0][0] as { start_at: string }[];
    expect(added[0].start_at).toBe('2026-03-31T09:00:00.000Z');
  });
});
