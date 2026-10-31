import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { CalendarStore } from './calendar-store';
import { AuthStore } from '../../../core/auth/auth-store';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { GroupStore } from '../../groups/data/group-store';
import { NotificationService } from '../../../core/services/notification.service';
import { SUPABASE_CLIENT } from '../../../core/supabase-client';
import {
  CalendarSnapshot,
  isCalendarSnapshot,
  readStartupCache,
  writeStartupCache,
} from '../../../core/services/startup-cache';
import { environment } from '../../../../environments/environment';

const fixture = (): CalendarSnapshot => ({
  calendars: [{ id: 'cal-a', name: 'Cá nhân', color: 'blue', canEdit: true }],
  events: [
    {
      id: 'cached-event',
      calendarId: 'cal-a',
      title: 'Lịch đã lưu',
      start: new Date('2026-10-31T09:00:00Z'),
      end: new Date('2026-10-31T10:00:00Z'),
      allDay: false,
    },
  ],
  todos: [],
  todoLists: [],
  notes: [],
  todosReady: true,
  notesReady: true,
  lastSyncedAt: '2026-10-31T00:00:00Z',
});
describe('instant calendar startup with a sleeping server', () => {
  let user: ReturnType<typeof signal<{ id: string } | null>>;
  let store: CalendarStore, http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    writeStartupCache('a', 'calendar', fixture());
    user = signal<{ id: string } | null>({ id: 'a' });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthStore, useValue: { user, session: signal(null) } },
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
          useValue: { loadGroups: async () => {}, groups: () => [], hiddenGroups: () => [] },
        },
        { provide: NotificationService, useValue: { ingest() {} } },
        {
          provide: SUPABASE_CLIENT,
          useValue: { channel: () => ({ on: () => ({ subscribe() {} }) }) },
        },
      ],
    });
    store = TestBed.inject(CalendarStore);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });
  it('shows cached events before any backend response and starts independent requests together', () => {
    expect(store.events()[0].title).toBe('Lịch đã lưu');
    expect(store.events()[0].start).toBeInstanceOf(Date);
    expect(store.calendarsLoading()).toBe(false);
    expect(store.syncing()).toBe(true);
    expect(store.showingCached()).toBe(true);
    for (const path of ['/events', '/calendars', '/todos', '/todo-lists', '/notes'])
      expect(http.match(`${environment.apiUrl}${path}`).length).toBe(1);
  });
  it('retains readable cached data if initial synchronization fails', async () => {
    http
      .expectOne(`${environment.apiUrl}/calendars`)
      .flush(null, { status: 503, statusText: 'sleeping' });
    http
      .expectOne(`${environment.apiUrl}/events`)
      .flush(null, { status: 503, statusText: 'sleeping' });
    await Promise.resolve();
    await Promise.resolve();
    expect(store.events()[0].id).toBe('cached-event');
    expect(store.syncFailed()).toBe(true);
    expect(store.calendarsLoading()).toBe(false);
  });
  it('replaces the snapshot after the server responds', async () => {
    http
      .expectOne(`${environment.apiUrl}/calendars`)
      .flush([{ id: 'cal-a', name: 'Cá nhân', color: 'blue', canEdit: true }]);
    http.expectOne(`${environment.apiUrl}/events`).flush([]);
    await Promise.resolve();
    await Promise.resolve();
    expect(store.events()).toEqual([]);
    expect(store.showingCached()).toBe(false);
    expect(readStartupCache('a', 'calendar', isCalendarSnapshot)?.events).toEqual([]);
  });
  it('discards an old account response after switching accounts', async () => {
    const oldCalendars = http.expectOne(`${environment.apiUrl}/calendars`),
      oldEvents = http.expectOne(`${environment.apiUrl}/events`);
    const oldNotes = http.expectOne(`${environment.apiUrl}/notes`);
    user.set({ id: 'b' });
    TestBed.tick();
    expect(store.events()).toEqual([]);
    expect(store.notes()).toEqual([]);
    oldCalendars.flush([{ id: 'secret-cal', name: 'A only', color: 'blue' }]);
    oldEvents.flush([]);
    oldNotes.flush([
      {
        id: 'secret-note',
        content: 'A private',
        color: 'blue',
        createdAt: '2026-10-31',
        updatedAt: '2026-10-31',
      },
    ]);
    await Promise.resolve();
    await Promise.resolve();
    expect(store.calendars()).toEqual([]);
    expect(store.notes()).toEqual([]);
    expect(readStartupCache('b', 'calendar', isCalendarSnapshot)).toBeNull();
  });
  it('only writes confirmed events into the startup snapshot', async () => {
    const creating = store.createEvent({
      calendarId: 'cal-a',
      title: 'Mới',
      allDay: false,
      start: new Date('2026-10-31T09:00:00Z'),
      end: new Date('2026-10-31T10:00:00Z'),
    });
    expect(readStartupCache('a', 'calendar', isCalendarSnapshot)?.events).toHaveLength(1);
    http
      .expectOne(
        (request) => request.url === `${environment.apiUrl}/events` && request.method === 'POST',
      )
      .flush({
        id: 'confirmed',
        calendarId: 'cal-a',
        title: 'Mới',
        allDay: false,
        start: '2026-10-31T09:00:00Z',
        end: '2026-10-31T10:00:00Z',
      });
    await creating;
    expect(
      readStartupCache('a', 'calendar', isCalendarSnapshot)?.events.map((event) => event.id),
    ).toEqual(['cached-event', 'confirmed']);
  });
  it('failed event deletion preserves both the visible event and the saved snapshot', async () => {
    const deleting = store.deleteEvent('cached-event');
    http
      .expectOne(`${environment.apiUrl}/events/cached-event`)
      .flush(null, { status: 403, statusText: 'forbidden' });
    await expect(deleting).rejects.toBeTruthy();
    expect(store.events()[0].id).toBe('cached-event');
    expect(readStartupCache('a', 'calendar', isCalendarSnapshot)?.events[0].id).toBe(
      'cached-event',
    );
  });
});
