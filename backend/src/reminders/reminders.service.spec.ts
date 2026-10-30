import { validate } from 'class-validator';
import { RemindersService } from './reminders.service';
import { SupabaseService } from '../supabase/supabase.service';
import { AcknowledgeRemindersDto } from './dto/acknowledge-reminders.dto';
import type { SupabaseClient } from '@supabase/supabase-js';

const ID = '550e8400-e29b-41d4-a716-446655440000';

function setup() {
  const row = {
    id: ID,
    event_id: 'event-1',
    remind_at: '2026-10-30T01:00:00Z',
    events: {
      title: 'Họp nhóm',
      start_at: '2026-10-30T02:00:00Z',
      meet_link: null,
    },
  };
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    in: jest.fn(async () => ({ error: null })),
    returns: jest.fn(async () => ({ data: [row], error: null })),
  };
  const client = { from: jest.fn(() => query) } as unknown as SupabaseClient;
  const service = new RemindersService({} as SupabaseService);
  return { row, query, client, service };
}

describe('missed reminder acknowledgement', () => {
  it('keeps GET repeatable so a lost response can be recovered', async () => {
    const { query, client, service } = setup();
    const first = await service.listMissed(client, 'user-1');
    const repeated = await service.listMissed(client, 'user-1');
    expect(first).toEqual(repeated);
    expect(query.update).not.toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.limit).toHaveBeenCalledWith(100);
  });

  it('does not return reminders for events in trash or inaccessible event rows', async () => {
    const { query, client, service } = setup();
    await service.listMissed(client, 'user-1');
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining('events!inner'),
    );
    expect(query.is).toHaveBeenCalledWith('events.deleted_at', null);
  });

  it('acknowledges only the authenticated user, requested IDs and popup channel', async () => {
    const { query, client, service } = setup();
    await service.acknowledge(client, 'user-1', [ID]);
    expect(query.update).toHaveBeenCalledWith({ seen_at: expect.any(String) });
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.eq).toHaveBeenCalledWith('remind_type', 'popup');
    expect(query.is).toHaveBeenCalledWith('seen_at', null);
    expect(query.lte).toHaveBeenCalledWith('remind_at', expect.any(String));
    expect(query.in).toHaveBeenCalledWith('id', [ID]);
  });

  it('surfaces acknowledgement storage failures instead of pretending success', async () => {
    const { query, client, service } = setup();
    query.in.mockResolvedValue({
      error: { message: 'Database unavailable' },
    } as never);
    await expect(service.acknowledge(client, 'user-1', [ID])).rejects.toThrow(
      'Database unavailable',
    );
  });

  it('clears delivery state when a reminder is snoozed', async () => {
    const { query, client, service } = setup();
    await service.snooze(client, ID, 5);
    expect(query.update).toHaveBeenCalledWith({
      remind_at: expect.any(String),
      is_sent: false,
      seen_at: null,
      snoozed_until: null,
    });
  });

  it('validates a bounded batch of unique reminder UUIDs', async () => {
    const valid = Object.assign(new AcknowledgeRemindersDto(), {
      reminderIds: [ID],
    });
    expect(await validate(valid)).toEqual([]);
    for (const reminderIds of [
      [],
      ['not-a-uuid'],
      [ID, ID],
      new Array(101).fill(ID),
    ]) {
      const invalid = Object.assign(new AcknowledgeRemindersDto(), {
        reminderIds,
      });
      expect((await validate(invalid)).length).toBeGreaterThan(0);
    }
  });
});
