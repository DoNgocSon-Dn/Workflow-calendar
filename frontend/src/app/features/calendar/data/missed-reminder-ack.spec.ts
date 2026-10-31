import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarStore } from './calendar-store';
import { AuthStore } from '../../../core/auth/auth-store';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { GroupStore } from '../../groups/data/group-store';
import { NotificationService } from '../../../core/services/notification.service';
import { SUPABASE_CLIENT } from '../../../core/supabase-client';

interface RecoveryStore {
  checkMissedReminders(): Promise<void>;
  handleReminderFire(payload: { reminderId: string }): void;
}

describe('missed reminders — receive before acknowledge', () => {
  let store: RecoveryStore;
  let http: HttpTestingController;
  const missed = [
    {
      reminderId: '550e8400-e29b-41d4-a716-446655440000',
      eventId: 'event-1',
      title: 'Họp nhóm',
      startAt: '2026-10-30T02:00:00Z',
      meetLink: null,
    },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthStore, useValue: { user: signal({ id: 'user-1' }), session: signal(null) } },
        {
          provide: RealtimeService,
          useValue: {
            connect() {},
            disconnect() {},
            onConnect() {},
            onReconnect() {},
            on() {},
            joinCalendar() {},
          },
        },
        {
          provide: GroupStore,
          useValue: { loadGroups: () => Promise.resolve(), groups: () => [] },
        },
        { provide: NotificationService, useValue: { ingest: () => true } },
        {
          provide: SUPABASE_CLIENT,
          useValue: { channel: () => ({ on: () => ({ subscribe() {} }) }) },
        },
      ],
    });
    store = TestBed.inject(CalendarStore) as unknown as RecoveryStore;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('acknowledges a batch only after its reminders have been ingested', async () => {
    const ingest = vi.spyOn(store, 'handleReminderFire').mockImplementation(() => {});
    const pending = store.checkMissedReminders();
    http.expectNone((request) => request.url.endsWith('/reminders/acknowledge'));
    http.expectOne((request) => request.url.endsWith('/reminders/missed')).flush(missed);
    await Promise.resolve();
    expect(ingest).toHaveBeenCalledWith(missed[0]);
    const ack = http.expectOne((request) => request.url.endsWith('/reminders/acknowledge'));
    expect(ack.request.method).toBe('POST');
    expect(ack.request.body).toEqual({ reminderIds: [missed[0].reminderId] });
    ack.flush(null);
    await pending;
  });

  it('does not acknowledge a response the client failed to ingest', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(store, 'handleReminderFire').mockImplementation(() => {
      throw new Error('UI unavailable');
    });
    const pending = store.checkMissedReminders();
    http.expectOne((request) => request.url.endsWith('/reminders/missed')).flush(missed);
    await pending;
    http.expectNone((request) => request.url.endsWith('/reminders/acknowledge'));
  });

  it('does not send an empty acknowledgement', async () => {
    const pending = store.checkMissedReminders();
    http.expectOne((request) => request.url.endsWith('/reminders/missed')).flush([]);
    await pending;
    http.expectNone((request) => request.url.endsWith('/reminders/acknowledge'));
  });
});
