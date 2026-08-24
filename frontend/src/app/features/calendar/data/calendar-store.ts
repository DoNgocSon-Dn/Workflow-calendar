import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthStore } from '../../../core/auth/auth-store';
import { Clock } from '../../../core/clock';
import { NotificationKind, NotificationQueue } from '../../../core/realtime/notification-queue';
import { NotificationService } from '../../../core/services/notification.service';
import {
  calendarInvitationDraft,
  calendarMemberJoinedDraft,
  eventCreatedDraft,
  eventDeletedDraft,
  eventInvitationDraft,
  eventUpdatedDraft,
  reminderDraft,
} from '../../../core/services/notification-drafts';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { GroupStore } from '../../groups/data/group-store';
import {
  Attendee,
  AttendeeStatus,
  CalendarColor,
  CalendarDef,
  CalendarEvent,
  CalendarEventDraft,
  CalendarInvite,
  CalendarInviteStatus,
  CalendarMemberRole,
  CalendarViewMode,
  ConflictEvent,
  EventComment,
  Note,
  Reminder,
  ReminderDraft,
  Todo,
} from '../models/calendar.models';
import { TimeFormatService } from '../../../core/time-format/time-format-service';
import { TimeFormat, addDays, clampToDay, formatTimeLabel, startOfDay } from '../utils/date-utils';
import { VN_HOLIDAY_CALENDAR_DEF, VN_HOLIDAY_CALENDAR_ID, buildVietnamHolidayEvents } from './vietnam-holidays';

const SELF_ORIGIN_TTL_MS = 8000;
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'sidebar-collapsed';

function readStoredSidebarCollapsed(): boolean {
  return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1';
}
const HOLIDAY_YEARS = [2024, 2025, 2026, 2027, 2028];

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
  deletedAt?: string;
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

interface CalendarInviteApiDto {
  id: string;
  calendarId: string;
  calendarName: string;
  calendarColor: string;
  role: CalendarMemberRole;
  status: CalendarInviteStatus;
  createdAt: string;
  inviterEmail: string | null;
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

interface TodoApiDto {
  id: string;
  content: string;
  done: boolean;
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

function toTodo(dto: TodoApiDto): Todo {
  return {
    id: dto.id,
    content: dto.content,
    done: dto.done,
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

// Một số tài khoản đang mang nhiều lịch "Cá nhân" trùng hệt nhau do lỗi tự tạo
// lịch mặc định trước đây (xem createDefaultCalendarOnce). Gộp ngay sau khi nhận
// từ API để mọi nơi đọc calendars() đều thấy cùng một danh sách: sidebar, bảng
// chọn lịch trong form sự kiện và màn hình import — thay vì mỗi chỗ tự gộp một
// kiểu. Giữ bản ghi cũ nhất (API trả theo created_at) vì đó là lịch chứa sự kiện.
function dedupeCalendars(list: CalendarDef[]): CalendarDef[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    const key = `${c.name.trim().toLowerCase()}|${c.color}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toCalendarInvite(dto: CalendarInviteApiDto): CalendarInvite {
  return {
    id: dto.id,
    calendarId: dto.calendarId,
    calendarName: dto.calendarName,
    calendarColor: dto.calendarColor as CalendarColor,
    role: dto.role,
    status: dto.status,
    createdAt: new Date(dto.createdAt),
    inviterEmail: dto.inviterEmail,
  };
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
    deletedAt: dto.deletedAt ? new Date(dto.deletedAt) : undefined,
  };
}

function toEventApiPayload(draft: Partial<CalendarEventDraft>): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...draft };
  if (draft.start) payload['start'] = draft.start.toISOString();
  if (draft.end) payload['end'] = draft.end.toISOString();
  return payload;
}

function eventTimeLabel(event: CalendarEvent, format: TimeFormat): string {
  if (event.allDay) return 'Cả ngày';
  return `${formatTimeLabel(event.start, 'vi', format)} - ${formatTimeLabel(event.end, 'vi', format)}`;
}

@Injectable({ providedIn: 'root' })
export class CalendarStore {
  private readonly clock = inject(Clock);
  private readonly http = inject(HttpClient);
  private readonly authStore = inject(AuthStore);
  private readonly realtime = inject(RealtimeService);
  private readonly notificationQueue = inject(NotificationQueue);
  private readonly notifications = inject(NotificationService);
  private readonly groupStore = inject(GroupStore);
  private readonly timeFormatService = inject(TimeFormatService);

  private readonly apiUrl = environment.apiUrl;
  private readonly selfOriginIds = new Set<string>();
  private realtimeListenersBound = false;
  // Giữ POST /calendars đang bay để hai lần loadAll() chồng nhau (effect chạy lại
  // khi token refresh) cùng chờ MỘT request, thay vì mỗi lần đẻ một lịch mới.
  private defaultCalendarInFlight: Promise<CalendarDef> | null = null;

  readonly today = signal(startOfDay(this.clock.now()));
  readonly focusedDate = signal(startOfDay(this.clock.now()));
  readonly viewMode = signal<CalendarViewMode>('week');
  readonly sidebarOpen = signal(true);
  readonly sidebarCollapsed = signal<boolean>(readStoredSidebarCollapsed());

  readonly calendars = signal<CalendarDef[]>([]);
  readonly calendarsLoading = signal(false);
  readonly visibleCalendarIds = signal<Set<string>>(new Set());
  readonly events = signal<CalendarEvent[]>([]);
  readonly searchQuery = signal('');
  readonly pendingInvites = signal<CalendarInvite[]>([]);

  // Lịch tham khảo chỉ đọc, không lưu ở backend — hiển thị trong mục "Lịch khác".
  readonly otherCalendars: CalendarDef[] = [VN_HOLIDAY_CALENDAR_DEF];
  readonly holidayEvents: CalendarEvent[] = buildVietnamHolidayEvents(HOLIDAY_YEARS);

  readonly visibleEvents = computed(() => {
    const visible = this.visibleCalendarIds();
    const query = this.searchQuery().trim().toLowerCase();
    return [...this.events(), ...this.holidayEvents].filter((e) => {
      if (!visible.has(e.calendarId)) return false;
      if (!query) return true;
      const titleMatch = e.title.toLowerCase().includes(query);
      const locMatch = e.location?.toLowerCase().includes(query);
      const descMatch = e.description?.toLowerCase().includes(query);
      return titleMatch || locMatch || descMatch;
    });
  });

  setSearchQuery(q: string): void {
    this.searchQuery.set(q);
  }

  readonly calendarColor = computed(() => {
    const map = new Map<string, CalendarColor>();
    for (const c of this.calendars()) map.set(c.id, c.color);
    for (const c of this.otherCalendars) map.set(c.id, c.color);
    // Group workspace calendars aren't part of `calendars()` (they're listed
    // separately under "Nhóm làm việc"), so without this their events fall
    // back to the default blue instead of the group's own color.
    for (const g of this.groupStore.groups()) {
      if (g.calendarId) map.set(g.calendarId, g.color);
    }
    return map;
  });

  // Local pairwise overlap check over currently visible timed events, so the
  // grid can highlight conflicts immediately without a round-trip per pair.
  readonly conflictingEventIds = computed(() => {
    const timedEvents = this.visibleEvents().filter((e) => !e.allDay);
    const conflicts = new Set<string>();
    for (let i = 0; i < timedEvents.length; i++) {
      for (let j = i + 1; j < timedEvents.length; j++) {
        const a = timedEvents[i];
        const b = timedEvents[j];
        if (a.start.getTime() < b.end.getTime() && a.end.getTime() > b.start.getTime()) {
          conflicts.add(a.id);
          conflicts.add(b.id);
        }
      }
    }
    return conflicts;
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
        this.pendingInvites.set([]);
        this.realtime.disconnect();
      }
    });

    effect(() => {
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, this.sidebarCollapsed() ? '1' : '0');
    });
  }

  private async loadAll(): Promise<void> {
    this.calendarsLoading.set(true);
    try {
      const [calendars, events] = await Promise.all([
        firstValueFrom(this.http.get<CalendarApiDto[]>(`${this.apiUrl}/calendars`)),
        firstValueFrom(this.http.get<EventApiDto[]>(`${this.apiUrl}/events`)),
      ]);

      let calendarDefs = dedupeCalendars(calendars.map(toCalendarDef));
      if (calendarDefs.length === 0) {
        // Người dùng chưa có calendar nào (ví dụ tài khoản có trước khi trigger
        // tạo "Cá nhân" mặc định tồn tại) — tự tạo một lịch mặc định thay vì
        // để form tạo sự kiện không có gì để chọn.
        calendarDefs = [await this.createDefaultCalendarOnce()];
      }

      this.calendars.set(calendarDefs);
      const visibleIds = new Set(calendarDefs.map((c) => c.id));
      // Sự kiện được mời có thể thuộc lịch của người khác (chưa phải member) —
      // vẫn cho hiển thị trên lưới lịch dù không có trong danh sách lịch bên trái.
      for (const e of events) visibleIds.add(e.calendarId);
      visibleIds.add(VN_HOLIDAY_CALENDAR_ID);
      this.visibleCalendarIds.set(visibleIds);
      this.events.set(events.map(toCalendarEvent));
    } catch (err) {
      // Cố tình KHÔNG tạo lịch mặc định ở đây. GET /calendars hỏng (mất mạng,
      // backend restart, 429) không có nghĩa là người dùng chưa có lịch — nó chỉ
      // có nghĩa là ta chưa biết. Nhánh này trước đây tạo lịch mới mỗi lần lỗi,
      // và vì effect() gọi lại loadAll() sau mỗi lần token đổi nên nó đẻ ra hàng
      // loạt lịch "Cá nhân" rỗng. Giữ nguyên state cũ và để người dùng thử lại.
      console.error('Lỗi khi tải danh sách lịch / sự kiện:', err);
    } finally {
      this.calendarsLoading.set(false);
    }

    void this.refreshPendingInvites();

    this.realtime.connect();
    this.joinAllCalendarRooms();
    this.bindRealtimeListenersOnce();
  }

  // loadAll() chạy lại mỗi khi authStore.user() đổi (token refresh, khôi phục
  // phiên, ...) — nhưng RealtimeService.on()/onConnect() chỉ cộng dồn listener
  // vào socket dùng chung, không tự gỡ listener cũ. Nếu gọi lại mỗi lần loadAll()
  // chạy, mỗi sự kiện realtime (event:created, reminder:fire, ...) sẽ bắn trùng
  // N lần → thông báo/nhắc lịch hiện lặp lại. Bọc guard để chỉ đăng ký 1 lần.
  private bindRealtimeListenersOnce(): void {
    if (this.realtimeListenersBound) return;
    this.realtimeListenersBound = true;

    this.realtime.onConnect(() => this.joinAllCalendarRooms());
    // Kết nối lại thì kéo lại sự kiện + lời mời đã lỡ trong lúc mất mạng.
    this.realtime.onReconnect(() => {
      void this.refreshEvents();
      void this.refreshPendingInvites();
    });
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
    this.realtime.on<{ invite: CalendarInviteApiDto }>('calendar:invited', (payload) =>
      this.handleCalendarInvited(payload),
    );
    this.realtime.on<{ calendarId: string; member: { userId: string; role: CalendarMemberRole } }>(
      'calendar:memberJoined',
      (payload) => this.handleCalendarMemberJoined(payload),
    );
    // Xoá nhóm sẽ xoá luôn lịch nhóm ở server. GroupStore đã inject vào store
    // này nên nó không thể gọi ngược lại — lịch nhóm được dọn ngay tại đây thay
    // vì đi qua GroupStore, tránh vòng phụ thuộc DI.
    this.realtime.on<{ groupId: string; calendarId: string | null }>(
      'group:deleted',
      (payload) => this.handleGroupCalendarRemoved(payload.calendarId),
    );
  }

  private handleGroupCalendarRemoved(calendarId: string | null): void {
    if (!calendarId) return;
    this.calendars.update((list) => list.filter((c) => c.id !== calendarId));
    this.events.update((list) => list.filter((e) => e.calendarId !== calendarId));
    this.visibleCalendarIds.update((set) => {
      const next = new Set(set);
      next.delete(calendarId);
      return next;
    });
  }

  async ensureCalendarExists(): Promise<CalendarDef> {
    if (this.calendars().length > 0) {
      return this.calendars()[0];
    }
    try {
      const cal = await this.createDefaultCalendarOnce();
      this.calendars.set([cal]);
      this.visibleCalendarIds.update((set) => new Set([...set, cal.id]));
      return cal;
    } catch (err) {
      console.warn('Không thể tạo lịch trên backend, dùng lịch mặc định cục bộ:', err);
      const fallbackCal: CalendarDef = {
        id: 'default-local-calendar',
        name: 'Cá nhân',
        color: 'blue',
      };
      this.calendars.set([fallbackCal]);
      this.visibleCalendarIds.set(new Set([fallbackCal.id]));
      return fallbackCal;
    }
  }

  // Trước khi tạo, hỏi lại server một lần: giữa lúc loadAll() đọc danh sách và
  // lúc quyết định tạo, một tab khác (hoặc lần loadAll() trước đó) có thể đã tạo
  // rồi. Không kiểm tra lại chính là cách bộ lịch "Cá nhân" trùng lặp sinh ra.
  private createDefaultCalendarOnce(): Promise<CalendarDef> {
    this.defaultCalendarInFlight ??= (async () => {
      const existing = await firstValueFrom(
        this.http.get<CalendarApiDto[]>(`${this.apiUrl}/calendars`),
      );
      if (existing.length > 0) return toCalendarDef(existing[0]);
      return this.createDefaultCalendar();
    })().finally(() => {
      this.defaultCalendarInFlight = null;
    });
    return this.defaultCalendarInFlight;
  }

  async createDefaultCalendar(): Promise<CalendarDef> {
    const created = await firstValueFrom(
      this.http.post<CalendarApiDto>(`${this.apiUrl}/calendars`, {
        name: 'Cá nhân',
        color: 'blue',
      }),
    );
    return toCalendarDef(created);
  }

  async createCalendar(name: string, color: CalendarColor): Promise<CalendarDef> {
    const created = await firstValueFrom(
      this.http.post<CalendarApiDto>(`${this.apiUrl}/calendars`, { name, color }),
    );
    const calendar = toCalendarDef(created);
    this.calendars.update((list) => [...list, calendar]);
    this.visibleCalendarIds.update((set) => new Set([...set, calendar.id]));
    this.realtime.joinCalendar(calendar.id);
    return calendar;
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

  /** Trả về `false` khi sự kiện là tiếng vọng của thao tác do chính người dùng
   *  vừa thực hiện — người gọi dùng nó để bỏ qua luôn cả Notification Center. */
  private notifyIfNotSelfOrigin(
    id: string,
    kind: NotificationKind,
    title: string,
    body: string,
  ): boolean {
    if (this.selfOriginIds.has(id)) {
      this.selfOriginIds.delete(id);
      return false;
    }
    this.notificationQueue.push({ eventId: id, title, body, kind });
    return true;
  }

  private handleRemoteCreated(dto: EventApiDto): void {
    const event = toCalendarEvent(dto);
    this.upsertEvent(event);
    const timeLabel = eventTimeLabel(event, this.timeFormatService.format());
    if (!this.notifyIfNotSelfOrigin(event.id, 'created', `Sự kiện mới: ${event.title}`, timeLabel)) {
      return;
    }
    this.notifications.ingest(
      eventCreatedDraft({
        eventId: event.id,
        title: event.title,
        timeLabel,
        start: dto.start,
        end: dto.end,
      }),
    );
  }

  private handleRemoteUpdated(dto: EventApiDto): void {
    const event = toCalendarEvent(dto);
    this.upsertEvent(event);
    const timeLabel = eventTimeLabel(event, this.timeFormatService.format());
    if (!this.notifyIfNotSelfOrigin(event.id, 'updated', `Đã cập nhật: ${event.title}`, timeLabel)) {
      return;
    }
    this.notifications.ingest(
      eventUpdatedDraft({
        eventId: event.id,
        title: event.title,
        timeLabel,
        start: dto.start,
        end: dto.end,
      }),
    );
  }

  private handleRemoteDeleted(id: string): void {
    const title = this.events().find((e) => e.id === id)?.title ?? null;
    this.events.update((list) => list.filter((e) => e.id !== id));
    if (!this.notifyIfNotSelfOrigin(id, 'deleted', 'Sự kiện đã bị xoá', '')) return;
    this.notifications.ingest(eventDeletedDraft(id, title));
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
    const title = this.events().find((e) => e.id === payload.eventId)?.title ?? null;
    this.notifications.ingest(eventInvitationDraft(payload.eventId, title));
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

  private handleCalendarInvited(payload: { invite: CalendarInviteApiDto }): void {
    const invite = toCalendarInvite(payload.invite);
    this.pendingInvites.update((list) => [invite, ...list.filter((i) => i.id !== invite.id)]);
    this.notificationQueue.push({
      title: 'Bạn được mời tham gia một lịch',
      body: invite.inviterEmail
        ? `${invite.inviterEmail} mời bạn vào "${invite.calendarName}"`
        : `Mời bạn vào "${invite.calendarName}"`,
      kind: 'invite',
    });
    this.notifications.ingest(
      calendarInvitationDraft({
        inviteId: invite.id,
        calendarId: invite.calendarId,
        calendarName: invite.calendarName,
        inviterEmail: invite.inviterEmail ?? null,
        createdAt: payload.invite.createdAt,
      }),
    );
  }

  private handleCalendarMemberJoined(payload: {
    calendarId: string;
    member: { userId: string; role: CalendarMemberRole };
  }): void {
    if (payload.member.userId === this.authStore.user()?.id) return;
    const calendar = this.calendars().find((c) => c.id === payload.calendarId);
    if (!calendar) return;
    this.notificationQueue.push({
      title: 'Có thành viên mới',
      body: `Một người vừa tham gia lịch "${calendar.name}"`,
      kind: 'invite',
    });
    this.notifications.ingest(
      calendarMemberJoinedDraft(payload.calendarId, calendar.name, payload.member.userId),
    );
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
      body: payload.startAt ? formatTimeLabel(new Date(payload.startAt), 'vi', this.timeFormatService.format()) : '',
      kind: 'reminder',
    });
    this.notifications.ingest(reminderDraft(payload));
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

  readonly navDirection = signal<'prev' | 'next' | null>(null);
  private navResetTimer: ReturnType<typeof setTimeout> | null = null;

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

    // Clear then re-set on the next frame so consecutive clicks in the same
    // direction still replay the slide animation (a same-value signal write
    // wouldn't re-trigger the CSS class toggle the animation depends on).
    if (this.navResetTimer) clearTimeout(this.navResetTimer);
    this.navDirection.set(null);
    requestAnimationFrame(() => {
      this.navDirection.set(amount > 0 ? 'next' : 'prev');
      this.navResetTimer = setTimeout(() => this.navDirection.set(null), 280);
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

  toggleSidebarCollapsed(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

  async createEvent(draft: CalendarEventDraft): Promise<CalendarEvent> {
    try {
      const created = await firstValueFrom(
        this.http.post<EventApiDto>(`${this.apiUrl}/events`, toEventApiPayload(draft)),
      );
      const event = toCalendarEvent(created);
      this.markSelfOrigin(event.id);
      this.events.update((list) => [...list, event]);
      return event;
    } catch (err) {
      console.warn('Lưu sự kiện lên backend thất bại, tự động lưu cục bộ:', err);
      const fallbackCalId = draft.calendarId || (this.calendars()[0]?.id ?? 'default-local-calendar');
      const localEvent: CalendarEvent = {
        id: 'local-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
        calendarId: fallbackCalId,
        title: draft.title,
        location: draft.location,
        description: draft.description,
        start: draft.start,
        end: draft.end,
        allDay: draft.allDay,
      };
      this.events.update((list) => [...list, localEvent]);
      return localEvent;
    }
  }

  async updateEvent(id: string, changes: Partial<CalendarEventDraft>): Promise<void> {
    this.markSelfOrigin(id);
    try {
      const updated = await firstValueFrom(
        this.http.patch<EventApiDto>(`${this.apiUrl}/events/${id}`, toEventApiPayload(changes)),
      );
      const event = toCalendarEvent(updated);
      this.events.update((list) => list.map((e) => (e.id === id ? event : e)));
    } catch (err) {
      console.warn('Cập nhật sự kiện lên backend thất bại, tự động sửa cục bộ:', err);
      this.events.update((list) =>
        list.map((e) => {
          if (e.id !== id) return e;
          return {
            ...e,
            ...changes,
            start: changes.start ?? e.start,
            end: changes.end ?? e.end,
            allDay: changes.allDay ?? e.allDay,
          };
        }),
      );
    }
  }

  async deleteEvent(id: string): Promise<void> {
    this.markSelfOrigin(id);
    try {
      await firstValueFrom(this.http.delete<void>(`${this.apiUrl}/events/${id}`));
    } catch (err) {
      console.warn('Xoá sự kiện trên backend thất bại, tự động xoá cục bộ:', err);
    }
    this.events.update((list) => list.filter((e) => e.id !== id));
  }

  async listTrash(): Promise<CalendarEvent[]> {
    const events = await firstValueFrom(
      this.http.get<EventApiDto[]>(`${this.apiUrl}/events/trash`),
    );
    return events.map(toCalendarEvent);
  }

  async restoreEvent(id: string): Promise<CalendarEvent> {
    const restored = await firstValueFrom(
      this.http.post<EventApiDto>(`${this.apiUrl}/events/${id}/restore`, {}),
    );
    const event = toCalendarEvent(restored);
    this.events.update((list) => [...list, event]);
    return event;
  }

  async permanentlyDeleteEvent(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.apiUrl}/events/${id}/permanent`));
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

  async refreshPendingInvites(): Promise<void> {
    const result = await firstValueFrom(
      this.http.get<CalendarInviteApiDto[]>(`${this.apiUrl}/calendars/invites/mine`),
    );
    this.pendingInvites.set(
      result.filter((dto) => dto.status === 'pending').map(toCalendarInvite),
    );
  }

  async inviteToCalendar(
    calendarId: string,
    email: string,
    role: CalendarMemberRole = 'viewer',
  ): Promise<CalendarInvite> {
    const result = await firstValueFrom(
      this.http.post<CalendarInviteApiDto>(`${this.apiUrl}/calendars/${calendarId}/invites`, {
        email,
        role,
      }),
    );
    return toCalendarInvite(result);
  }

  async respondToCalendarInvite(
    inviteId: string,
    status: Exclude<CalendarInviteStatus, 'pending'>,
  ): Promise<CalendarInvite> {
    const result = await firstValueFrom(
      this.http.post<CalendarInviteApiDto>(
        `${this.apiUrl}/calendars/invites/${inviteId}/respond`,
        { status },
      ),
    );
    const invite = toCalendarInvite(result);
    this.pendingInvites.update((list) => list.filter((i) => i.id !== inviteId));

    if (status === 'accepted') {
      const alreadyKnown = this.calendars().some((c) => c.id === invite.calendarId);
      if (!alreadyKnown) {
        this.calendars.update((list) => [
          ...list,
          { id: invite.calendarId, name: invite.calendarName, color: invite.calendarColor },
        ]);
      }
      this.visibleCalendarIds.update((set) => new Set([...set, invite.calendarId]));
      this.realtime.joinCalendar(invite.calendarId);
      await this.refreshEvents();
    }

    return invite;
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

  async listTodos(): Promise<Todo[]> {
    const result = await firstValueFrom(this.http.get<TodoApiDto[]>(`${this.apiUrl}/todos`));
    return result.map(toTodo);
  }

  async createTodo(content: string): Promise<Todo> {
    const result = await firstValueFrom(
      this.http.post<TodoApiDto>(`${this.apiUrl}/todos`, { content }),
    );
    return toTodo(result);
  }

  async updateTodo(id: string, changes: { content?: string; done?: boolean }): Promise<Todo> {
    const result = await firstValueFrom(
      this.http.patch<TodoApiDto>(`${this.apiUrl}/todos/${id}`, changes),
    );
    return toTodo(result);
  }

  async deleteTodo(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.apiUrl}/todos/${id}`));
  }

  async sendAiChat(
    message: string,
    calendarId: string,
    history: readonly AiChatHistoryEntry[] = [],
  ): Promise<AiChatResult> {
    const result = await firstValueFrom(
      this.http.post<AiChatResult>(`${this.apiUrl}/ai/chat`, { message, calendarId, history }),
    );
    if (result.intent === 'create_event') {
      this.markSelfOrigin(result.event.id);
      this.upsertEvent(toCalendarEvent(result.event));
    }
    return result;
  }
}

export type AiChatResult =
  | { intent: 'create_event'; event: EventApiDto }
  | { intent: 'chat'; reply: string }
  | { intent: 'unclear'; title?: string; message: string };

export interface AiChatHistoryEntry {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}
