import {
  isCalendarSnapshot,
  readStartupCache,
  writeStartupCache,
  CalendarSnapshot,
} from './startup-cache';

export function cacheFixture(title = 'Đã lưu'): CalendarSnapshot {
  return {
    calendars: [{ id: 'cal-a', name: 'Cá nhân', color: 'blue', canEdit: true }],
    events: [
      {
        id: 'event-a',
        calendarId: 'cal-a',
        title,
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
  };
}
describe('account-scoped startup snapshots', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });
  it('restores Date objects and separates users and resource types', () => {
    writeStartupCache('a', 'calendar', cacheFixture());
    const cached = readStartupCache('a', 'calendar', isCalendarSnapshot);
    expect(cached?.events[0].start).toBeInstanceOf(Date);
    expect(cached?.events[0].start.toISOString()).toBe('2026-10-31T09:00:00.000Z');
    expect(readStartupCache('b', 'calendar', isCalendarSnapshot)).toBeNull();
    expect(readStartupCache('a', 'groups', isCalendarSnapshot)).toBeNull();
  });
  it('rejects corrupt or structurally invalid data', () => {
    writeStartupCache('a', 'calendar', {
      ...cacheFixture(),
      events: [{ id: 'bad', start: 'invalid' }],
    });
    expect(readStartupCache('a', 'calendar', isCalendarSnapshot)).toBeNull();
    const storedKey = localStorage.key(0)!;
    localStorage.setItem(storedKey, '{broken');
    expect(readStartupCache('a', 'calendar', isCalendarSnapshot)).toBeNull();
  });
  it('rejects a snapshot copied into another account key', () => {
    writeStartupCache('a', 'calendar', cacheFixture('A'));
    const firstKey = localStorage.key(0)!,
      raw = localStorage.getItem(firstKey)!;
    writeStartupCache('b', 'calendar', cacheFixture('B'));
    const secondKey = [localStorage.key(0)!, localStorage.key(1)!].find((key) => key !== firstKey)!;
    localStorage.setItem(secondKey, raw);
    expect(readStartupCache('b', 'calendar', isCalendarSnapshot)).toBeNull();
  });
  it('does not use snapshots older than 30 days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    writeStartupCache('a', 'calendar', cacheFixture());
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
    expect(readStartupCache('a', 'calendar', isCalendarSnapshot)).toBeNull();
    vi.useRealTimers();
  });
  it('storage restrictions never break the app', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => writeStartupCache('a', 'calendar', cacheFixture())).not.toThrow();
  });
});
