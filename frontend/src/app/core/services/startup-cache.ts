import { environment } from '../../../environments/environment';
import {
  CalendarDef,
  CalendarEvent,
  Note,
  Todo,
  TodoList,
} from '../../features/calendar/models/calendar.models';

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 3_000_000;
const dateKeys = new Set([
  'start',
  'end',
  'deletedAt',
  'createdAt',
  'updatedAt',
  'dueAt',
  'pinnedDate',
]);
const key = (owner: string, resource: string) =>
  `workflow-startup-v1:${environment.supabaseUrl}:${owner}:${resource}`;

/** Best-effort local read snapshots. No tokens, passwords or write queue. */
export function readStartupCache<T>(
  owner: string,
  resource: string,
  validate: (data: unknown) => data is T,
  reviveDates = true,
): T | null {
  try {
    const raw = localStorage.getItem(key(owner, resource));
    if (!raw || raw.length > MAX_BYTES) return null;
    const envelope = JSON.parse(raw, (name, value: unknown) => {
      if (reviveDates && dateKeys.has(name) && typeof value === 'string') {
        const date = new Date(value);
        return Number.isFinite(date.getTime()) ? date : null;
      }
      return value;
    });
    if (
      envelope?.version !== 1 ||
      envelope.owner !== owner ||
      typeof envelope.savedAt !== 'number' ||
      envelope.savedAt > Date.now() + 60_000 ||
      Date.now() - envelope.savedAt > MAX_AGE_MS ||
      !validate(envelope.data)
    )
      return null;
    return envelope.data;
  } catch {
    return null;
  }
}

export function writeStartupCache(owner: string, resource: string, data: unknown): void {
  try {
    const text = JSON.stringify({ version: 1, owner, savedAt: Date.now(), data });
    if (text.length <= MAX_BYTES) localStorage.setItem(key(owner, resource), text);
  } catch {
    /* Quota/private mode must never break saving or opening the app. */
  }
}

export interface CalendarSnapshot {
  calendars: CalendarDef[];
  events: CalendarEvent[];
  todos: Todo[];
  todoLists: TodoList[];
  notes: Note[];
  todosReady: boolean;
  notesReady: boolean;
  lastSyncedAt: string | null;
}
function records(value: unknown): value is Record<string, any>[] {
  return (
    Array.isArray(value) &&
    value.every((row) => row && typeof row === 'object' && typeof row.id === 'string')
  );
}
const date = (value: unknown) => value instanceof Date && Number.isFinite(value.getTime());
export function isCalendarSnapshot(value: unknown): value is CalendarSnapshot {
  if (!value || typeof value !== 'object') return false;
  const data = value as CalendarSnapshot;
  return (
    records(data.calendars) &&
    data.calendars.every((c) => typeof c.name === 'string' && typeof c.canEdit === 'boolean') &&
    records(data.events) &&
    data.events.every(
      (e) =>
        typeof e.calendarId === 'string' &&
        typeof e.title === 'string' &&
        date(e.start) &&
        date(e.end),
    ) &&
    records(data.todos) &&
    data.todos.every(
      (t) =>
        typeof t.content === 'string' &&
        typeof t.done === 'boolean' &&
        date(t.createdAt) &&
        date(t.updatedAt),
    ) &&
    records(data.todoLists) &&
    data.todoLists.every(
      (l) => typeof l.name === 'string' && date(l.createdAt) && date(l.updatedAt),
    ) &&
    records(data.notes) &&
    data.notes.every(
      (n) => typeof n.content === 'string' && date(n.createdAt) && date(n.updatedAt),
    ) &&
    typeof data.todosReady === 'boolean' &&
    typeof data.notesReady === 'boolean' &&
    (data.lastSyncedAt === null ||
      (typeof data.lastSyncedAt === 'string' && Number.isFinite(Date.parse(data.lastSyncedAt))))
  );
}
