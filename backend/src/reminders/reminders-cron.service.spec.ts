import { RemindersCronService } from './reminders-cron.service';
import { SupabaseService } from '../supabase/supabase.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MailService } from '../mail/mail.service';
import { PushService } from '../push/push.service';

function setup(fail = false) {
  const update = jest.fn(() => ({
    eq: jest.fn(async () => ({ error: null })),
  }));
  const reminder = {
    id: 'r1',
    event_id: 'e1',
    user_id: 'u1',
    remind_type: 'email',
    events: {
      title: 'Họp nhóm',
      start_at: '2026-10-30T09:00:00Z',
      calendar_id: null,
    },
  };
  const query = {
    select: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    returns: jest.fn(async () => ({ data: [reminder], error: null })),
    update,
  };
  const client = {
    from: jest.fn(() => query),
    rpc: jest.fn(async () => ({ data: 'member@example.com', error: null })),
  };
  const mail = {
    sendReminderEmail: jest.fn(async () => {
      if (fail) throw new Error('SMTP unavailable');
    }),
  };
  const service = new RemindersCronService(
    { getScheduledClient: () => client } as unknown as SupabaseService,
    {} as RealtimeGateway,
    mail as unknown as MailService,
    {} as PushService,
  );
  return { service, update, mail, client };
}

describe('scheduled reminder delivery', () => {
  it('keeps a failed email pending for the next run', async () => {
    const { service, update } = setup(true);
    await service.handleDueReminders();
    expect(update).not.toHaveBeenCalled();
  });
  it('marks successfully delivered emails as sent', async () => {
    const { service, update, mail } = setup();
    await service.handleDueReminders();
    expect(mail.sendReminderEmail).toHaveBeenCalledWith(
      'member@example.com',
      'Họp nhóm',
      '2026-10-30T09:00:00Z',
    );
    expect(update).toHaveBeenCalledWith({ is_sent: true });
  });
  it('does not mark transient email lookup errors as delivered', async () => {
    const { service, update, client } = setup();
    client.rpc.mockResolvedValue({
      data: '',
      error: { message: 'Database unavailable' },
    } as never);
    await service.handleDueReminders();
    expect(update).not.toHaveBeenCalled();
  });
  it('skips a scheduler without a configured service key', async () => {
    const service = new RemindersCronService(
      { getScheduledClient: () => null } as unknown as SupabaseService,
      {} as RealtimeGateway,
      {} as MailService,
      {} as PushService,
    );
    await expect(service.handleDueReminders()).resolves.toBeUndefined();
  });
});
