import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthStore } from '../../../core/auth/auth-store';
import { Clock } from '../../../core/clock';
import { NotificationKind, NotificationQueue } from '../../../core/realtime/notification-queue';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import {
  Attendee,
  AttendeeStatus,
  CalendarColor,
  CalendarDef,
  CalendarEvent,
  CalendarEventDraft,
  CalendarViewMode,
  ConflictEvent,
  EventComment,
  Note,
  Reminder,
  ReminderDraft,
} from '../models/calendar.models';
import { addDays, clampToDay, formatTimeLabel, startOfDay } from '../utils/date-utils';

const SELF_ORIGIN_TTL_MS = 8000;

interface CalendarApiDto {
  id: string;
  name: string;
  color: string;
}

interface EventApiDto {
  id: string;
  calendarId: string;
  title: string;
  location?: string;
  description?: string;
  start: string;
  end: string;
  allDay: boolean;
}

interface ConflictApiDto {
  id: string;
  calendarId: string;
  title: string;
  start: string;
  end: string;
}

interface AttendeeApiDto {
  id: string;
  userId: string;
  email: string;
  status: AttendeeStatus;
}

interface ReminderApiDto {
  id: string;
  eventId: string;
  remindAt: string;
  type: 'popup' | 'email';
}

interface CommentApiDto {
  id: string;
  eventId: string;
  userId: string;
  content: string;
  createdAt: string;
}

interface NoteApiDto {
  id: string;
  content: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

function toReminder(dto: ReminderApiDto): Reminder {
  return { id: dto.id, eventId: dto.eventId, remindAt: new Date(dto.remindAt), type: dto.type };
}

function toEventComment(dto: CommentApiDto): EventComment {
  return {
    id: dto.id,
    eventId: dto.eventId,
    userId: dto.userId,
    content: dto.content,
    createdAt: new Date(dto.createdAt),
  };
}

function toNote(dto: NoteApiDto): Note {
  return {
    id: dto.id,
    content: dto.content,
    color: dto.color,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}

function toConflictEvent(dto: ConflictApiDto): ConflictEvent {
  return {
    id: dto.id,
    calendarId: dto.calendarId,
    title: dto.title,
    start: new Date(dto.start),
    end: new Date(dto.end),
  };
}

function toAttendee(dto: AttendeeApiDto): Attendee {
  return { id: dto.id, userId: dto.userId, email: dto.email, status: dto.status };
}

function toCalendarDef(dto: CalendarApiDto): CalendarDef {
  return { id: dto.id, name: dto.name, color: dto.color as CalendarColor };
}

function toCalendarEvent(dto: EventApiDto): CalendarEvent {
  return {
    id: dto.id,
    calendarId: dto.calendarId,
    title: dto.title,
    location: dto.location,
    description: dto.description,
    start: new Date(dto.start),
    end: new Date(dto.end),
    allDay: dto.allDay,
  };
}

function toEventApiPayload(draft: Partial<CalendarEventDraft>): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...draft };
  if (draft.start) payload['start'] = draft.start.toISOString();
  if (draft.end) payload['end'] = draft.end.toISOString();
  return payload;
}

function eventTimeLabel(event: CalendarEvent): string {
  if (event.allDay) return 'Cả ngày';
  return `${formatTimeLabel(event.start)} - ${formatTimeLabel(event.end)}`;
}

@Injectable({ providedIn: 'root' })
export class CalendarStore {
  private readonly clock = inject(Clock);
  private readonly http = inject(HttpClient);
  private readonly authStore = inject(AuthStore);
  private readonly realtime = inject(RealtimeService);
  private readonly notificationQueue = inject(NotificationQueue);

  private readonly apiUrl = environment.apiUrl;
  private readonly selfOriginIds = new Set<string>();

  readonly today = signal(startOfDay(this.clock.now()));
  readonly focusedDate = signal(startOfDay(this.clock.now()));
  readonly viewMode = signal<CalendarViewMode>('week');
  readonly sidebarOpen = signal(true);

  readonly calendars = signal<CalendarDef[]>([]);
  readonly calendarsLoading = signal(false);
  readonly visibleCalendarIds = signal<Set<string>>(new Set());
  readonly events = signal<CalendarEvent[]>([]);

  readonly visibleEvents = computed(() => {
    const visible = this.visibleCalendarIds();
    return this.events().filter((e) => visible.has(e.calendarId));
  });

  readonly calendarColor = computed(() => {
    const map = new Map<string, CalendarColor>();
    for (const c of this.calendars()) map.set(c.id, c.color);
    return map;
  });

  constructor() {
    this.notificationQueue.onSnoozeReminder = (reminderId, minutes) => {
      void this.snoozeReminder(reminderId, minutes);
    };

    effect(() => {
      if (this.authStore.user()) {
        void this.loadAll();
      } else {
        this.calendars.set([]);
        this.events.set([]);
        this.visibleCalendarIds.set(new Set());
        this.realtime.disconnect();
      }
    });
  }

  private async loadAll(): Promise<void> {
    this.calendarsLoading.set(true);
    try {
      const [calendars, events] = await Promise.all([
        firstValueFrom(this.http.get<CalendarApiDto[]>(`${this.apiUrl}/calendars`)),
        firstValueFrom(this.http.get<EventApiDto[]>(`${this.apiUrl}/events`)),
      ]);

      let calendarDefs = calendars.map(toCalendarDef);
      if (calendarDefs.length === 0) {
        // Người dùng chưa có calendar nào (ví dụ tài khoản có trước khi trigger
        // tạo "Cá nhân" mặc định tồn tại) — tự tạo một lịch mặc định thay vì
        // để form tạo sự kiện không có gì để chọn.
        calendarDefs = [await this.createDefaultCalendar()];
      }

      this.calendars.set(calendarDefs);
      const visibleIds = new Set(calendarDefs.map((c) => c.id));
      // Sự kiện được mời có thể thuộc lịch của người khác (chưa phải member) —
      // vẫn cho hiển thị trên lưới lịch dù không có trong danh sách lịch bên trái.
      for (const e of events) visibleIds.add(e.calendarId);
      this.visibleCalendarIds.set(visibleIds);
      this.events.set(events.map(toCalendarEvent));
    } finally {
      this.calendarsLoading.set(false);
    }

    this.realtime.connect();
    this.realtime.onConnect(() => this.joinAllCalendarRooms());
    this.joinAllCalendarRooms();
    this.realtime.on<EventApiDto>('event:created', (dto) => this.handleRemoteCreated(dto));
    this.realtime.on<EventApiDto>('event:updated', (dto) => this.handleRemoteUpdated(dto));
    this.realtime.on<{ id: string }>('event:deleted', (payload) =>
      this.handleRemoteDeleted(payload.id),
    );
    this.realtime.on<{ eventId: string; attendee: AttendeeApiDto }>(
      'attendee:invited',
      (payload) => this.handleAttendeeInvited(payload),
    );
    this.realtime.on<{ eventId: string; attendee: AttendeeApiDto }>(
      'attendee:statusChanged',
      (payload) => this.handleAttendeeStatusChanged(payload),
    );
    this.realtime.on<{ reminderId: string; eventId: string; title: string; startAt: string }>(
      'reminder:fire',
      (payload) => this.handleReminderFire(payload),
    );
  }

  private async createDefaultCalendar(): Promise<CalendarDef> {
    const created = await firstValueFrom(
      this.http.post<CalendarApiDto>(`${this.apiUrl}/calendars`, {
        name: 'Cá nhân',
        color: 'blue',
      }),
    );
    return toCalendarDef(created);
  }

  private joinAllCalendarRooms(): void {
    for (const cal of this.calendars()) this.realtime.joinCalendar(cal.id);
  }

  private markSelfOrigin(id: string): void {
    this.selfOriginIds.add(id);
    setTimeout(() => this.selfOriginIds.delete(id), SELF_ORIGIN_TTL_MS);
  }

  private upsertEvent(event: CalendarEvent): void {
    this.events.update((list) => {
      const idx = list.findIndex((e) => e.id === event.id);
      if (idx === -1) return [...list, event];
      const next = [...list];
      next[idx] = event;
      return next;
    });
  }

  private notifyIfNotSelfOrigin(
    id: string,
    kind: NotificationKind,
    title: string,
    body: string,
  ): void {
    if (this.selfOriginIds.has(id)) {
      this.selfOriginIds.delete(id);
      return;
    }
    this.notificationQueue.push({ eventId: id, title, body, kind });
  }

  private handleRemoteCreated(dto: EventApiDto): void {
    const event = toCalendarEvent(dto);
    this.upsertEvent(event);
    this.notifyIfNotSelfOrigin(event.id, 'created', `Sự kiện mới: ${event.title}`, eventTimeLabel(event));
  }

  private handleRemoteUpdated(dto: EventApiDto): void {
    const event = toCalendarEvent(dto);
    this.upsertEvent(event);
    this.notifyIfNotSelfOrigin(event.id, 'updated', `Đã cập nhật: ${event.title}`, eventTimeLabel(event));
  }

  private handleRemoteDeleted(id: string): void {
    this.events.update((list) => list.filter((e) => e.id !== id));
    this.notifyIfNotSelfOrigin(id, 'deleted', 'Sự kiện đã bị xoá', '');
  }

  private async handleAttendeeInvited(payload: {
    eventId: string;
    attendee: AttendeeApiDto;
  }): Promise<void> {
    if (payload.attendee.userId !== this.authStore.user()?.id) return;
    await this.refreshEvents();
    this.notificationQueue.push({
      eventId: payload.eventId,
      title: 'Bạn được mời tham gia một sự kiện',
      body: '',
      kind: 'created',
    });
  }

  private handleAttendeeStatusChanged(payload: { eventId: string; attendee: AttendeeApiDto }): void {
    const label = payload.attendee.status === 'accepted' ? 'đã đồng ý tham gia' : 'đã từ chối tham gia';
    this.notificationQueue.push({
      eventId: payload.eventId,
      title: `Một người tham gia ${label}`,
      body: '',
      kind: 'updated',
    });
  }

  private handleReminderFire(payload: {
    reminderId: string;
    eventId: string;
    title: string;
    startAt: string;
  }): void {
    this.notificationQueue.push({
      eventId: payload.eventId,
      reminderId: payload.reminderId,
      title: `Nhắc lịch: ${payload.title}`,
      body: payload.startAt ? formatTimeLabel(new Date(payload.startAt)) : '',
      kind: 'reminder',
    });
  }

  private async refreshEvents(): Promise<void> {
    const events = await firstValueFrom(
      this.http.get<EventApiDto[]>(`${this.apiUrl}/events`),
    );
    const visibleIds = new Set(this.visibleCalendarIds());
    for (const e of events) visibleIds.add(e.calendarId);
    this.visibleCalendarIds.set(visibleIds);
    this.events.set(events.map(toCalendarEvent));
  }

  setViewMode(mode: CalendarViewMode): void {
    this.viewMode.set(mode);
  }

  goToday(): void {
    this.focusedDate.set(startOfDay(this.clock.now()));
  }

  goTo(date: Date): void {
    this.focusedDate.set(startOfDay(date));
  }

  step(amount: number): void {
    const mode = this.viewMode();
    const unit = mode === 'month' ? 'month' : mode === 'week' ? 'week' : 'day';
    this.focusedDate.update((d) => {
      if (unit === 'month') {
        const next = new Date(d);
        next.setMonth(next.getMonth() + amount);
        return next;
      }
      if (unit === 'week') return addDays(d, amount * 7);
      return addDays(d, amount);
    });
  }

  toggleCalendarVisibility(calendarId: string): void {
    this.visibleCalendarIds.update((set) => {
      const next = new Set(set);
      if (next.has(calendarId)) next.delete(calendarId);
      else next.add(calendarId);
      return next;
    });
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  async createEvent(draft: CalendarEventDraft): Promise<CalendarEvent> {
    const created = await firstValueFrom(
      this.http.post<EventApiDto>(`${this.apiUrl}/events`, toEventApiPayload(draft)),
    );
    const event = toCalendarEvent(created);
    this.markSelfOrigin(event.id);
    this.events.update((list) => [...list, event]);
    return event;
  }

  async updateEvent(id: string, changes: Partial<CalendarEventDraft>): Promise<void> {
    this.markSelfOrigin(id);
    const updated = await firstValueFrom(
      this.http.patch<EventApiDto>(`${this.apiUrl}/events/${id}`, toEventApiPayload(changes)),
    );
    const event = toCalendarEvent(updated);
    this.events.update((list) => list.map((e) => (e.id === id ? event : e)));
  }

  async deleteEvent(id: string): Promise<void> {
    this.markSelfOrigin(id);
    await firstValueFrom(this.http.delete<void>(`${this.apiUrl}/events/${id}`));
    this.events.update((list) => list.filter((e) => e.id !== id));
  }

  async moveEventToDay(id: string, targetDay: Date): Promise<void> {
    const current = this.events().find((e) => e.id === id);
    if (!current) return;

    const durationMs = current.end.getTime() - current.start.getTime();
    const start = current.allDay ? startOfDay(targetDay) : clampToDay(current.start, targetDay);
    const end = new Date(start.getTime() + durationMs);

    await this.updateEvent(id, { start, end });
  }

  async checkConflicts(range: {
    start: Date;
    end: Date;
    excludeEventId?: string;
  }): Promise<ConflictEvent[]> {
    const body = {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      excludeEventId: range.excludeEventId,
    };
    const result = await firstValueFrom(
      this.http.post<ConflictApiDto[]>(`${this.apiUrl}/events/check-conflicts`, body),
    );
    return result.map(toConflictEvent);
  }

  async listAttendees(eventId: string): Promise<Attendee[]> {
    const result = await firstValueFrom(
      this.http.get<AttendeeApiDto[]>(`${this.apiUrl}/events/${eventId}/attendees`),
    );
    return result.map(toAttendee);
  }

  async inviteAttendee(eventId: string, email: string): Promise<Attendee> {
    const result = await firstValueFrom(
      this.http.post<AttendeeApiDto>(`${this.apiUrl}/events/${eventId}/invite`, { email }),
    );
    return toAttendee(result);
  }

  async respondToInvite(
    eventId: string,
    status: Exclude<AttendeeStatus, 'pending'>,
  ): Promise<Attendee> {
    const result = await firstValueFrom(
      this.http.post<AttendeeApiDto>(`${this.apiUrl}/events/${eventId}/respond`, { status }),
    );
    return toAttendee(result);
  }

  async listReminders(eventId: string): Promise<Reminder[]> {
    const result = await firstValueFrom(
      this.http.get<ReminderApiDto[]>(`${this.apiUrl}/events/${eventId}/reminders`),
    );
    return result.map(toReminder);
  }

  async setReminders(eventId: string, reminders: ReminderDraft[]): Promise<Reminder[]> {
    const result = await firstValueFrom(
      this.http.put<ReminderApiDto[]>(`${this.apiUrl}/events/${eventId}/reminders`, {
        reminders,
      }),
    );
    return result.map(toReminder);
  }

  async snoozeReminder(reminderId: string, minutes: number): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.apiUrl}/reminders/${reminderId}/snooze`, { minutes }),
    );
  }

  async listComments(eventId: string): Promise<EventComment[]> {
    const result = await firstValueFrom(
      this.http.get<CommentApiDto[]>(`${this.apiUrl}/events/${eventId}/comments`),
    );
    return result.map(toEventComment);
  }

  async addComment(eventId: string, content: string): Promise<EventComment> {
    const result = await firstValueFrom(
      this.http.post<CommentApiDto>(`${this.apiUrl}/events/${eventId}/comments`, { content }),
    );
    return toEventComment(result);
  }

  async deleteComment(commentId: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.apiUrl}/comments/${commentId}`));
  }

  async listNotes(): Promise<Note[]> {
    const result = await firstValueFrom(this.http.get<NoteApiDto[]>(`${this.apiUrl}/notes`));
    return result.map(toNote);
  }

  async createNote(content: string, color: string): Promise<Note> {
    const result = await firstValueFrom(
      this.http.post<NoteApiDto>(`${this.apiUrl}/notes`, { content, color }),
    );
    return toNote(result);
  }

  async updateNote(id: string, changes: { content?: string; color?: string }): Promise<Note> {
    const result = await firstValueFrom(
      this.http.patch<NoteApiDto>(`${this.apiUrl}/notes/${id}`, changes),
    );
    return toNote(result);
  }

  async deleteNote(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.apiUrl}/notes/${id}`));
  }

  async sendAiChat(message: string, calendarId: string): Promise<AiChatResult> {
    return firstValueFrom(
      this.http.post<AiChatResult>(`${this.apiUrl}/ai/chat`, { message, calendarId }),
    );
  }
}

export type AiChatResult =
  | { intent: 'create_event'; event: EventApiDto }
  | { intent: 'unclear'; title?: string; message: string };
