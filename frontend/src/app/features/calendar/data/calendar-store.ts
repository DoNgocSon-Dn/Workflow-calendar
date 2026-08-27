import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Subject, debounceTime, distinctUntilChanged, firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../../../environments/environment';
import { AuthStore } from '../../../core/auth/auth-store';
import { Clock } from '../../../core/clock';
import { NotificationKind, NotificationQueue } from '../../../core/realtime/notification-queue';
import { NotificationService } from '../../../core/services/notification.service';
import {
  attendeeStatusDraft,
  calendarInvitationDraft,
  calendarMemberJoinedDraft,
  eventConflictDraft,
  eventCreatedDraft,
  eventsImportedDraft,
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
  SeriesEditScope,
  Todo,
  TodoList,
} from '../models/calendar.models';
import { RecurrenceRule } from '../utils/recurrence';
import { TimeFormatService } from '../../../core/time-format/time-format-service';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TimeFormat, addDays, clampToDay, formatTimeLabel, startOfDay } from '../utils/date-utils';
import { matchScore } from '../utils/search-match';
import { VN_HOLIDAY_CALENDAR_DEF, VN_HOLIDAY_CALENDAR_ID, buildVietnamHolidayEvents } from './vietnam-holidays';

const SELF_ORIGIN_TTL_MS = 8000;
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'sidebar-collapsed';

function readStoredSidebarCollapsed(): boolean {
  return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1';
}
/** Số năm ngày lễ được sinh sẵn, tính từ năm hiện tại trở đi. */
const HOLIDAY_YEAR_SPAN = 5;

/**
 * Cửa sổ năm để sinh sự kiện ngày lễ: năm hiện tại và bốn năm kế tiếp.
 *
 * Trước đây là một danh sách ghi cứng [2024…2028], viết ra lúc 2024 còn là năm
 * hiện tại. Sang 2026 nó lệch hẳn hai năm: lịch vẫn đẻ ra ngày lễ 2024–2025,
 * mà phía trước chỉ còn hai năm — mỗi năm trôi qua lại mất thêm một năm tương
 * lai cho tới khi hết sạch. Tính từ năm hiện tại thì cửa sổ tự trượt theo.
 *
 * KHÔNG lùi về năm trước. Agenda ở chế độ "tất cả" không lọc theo ngày, nó
 * liệt kê từ sự kiện sớm nhất — thêm một năm quá khứ là người dùng phải cuộn
 * qua trọn một năm ngày lễ đã qua mới tới được năm nay.
 */
function holidayYearWindow(now: Date): readonly number[] {
  const current = now.getFullYear();
  return Array.from({ length: HOLIDAY_YEAR_SPAN }, (_, offset) => current + offset);
}

interface CalendarApiDto {
  id: string;
  name: string;
  color: string;
  canEdit?: boolean;
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
  meetLink?: string;
  seriesId?: string;
  recurrenceRule?: RecurrenceRule;
  calendarType?: 'solar' | 'lunar';
  /** Ai tạo sự kiện. Dùng để nhận ra tiếng vọng realtime của chính mình. */
  createdBy?: string;
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
  listId: string;
  content: string;
  description?: string;
  done: boolean;
  dueAt?: string;
  starred: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TodoListApiDto {
  id: string;
  name: string;
  position: number;
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
    listId: dto.listId,
    content: dto.content,
    description: dto.description,
    done: dto.done,
    dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
    starred: dto.starred,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}

function toTodoList(dto: TodoListApiDto): TodoList {
  return {
    id: dto.id,
    name: dto.name,
    position: dto.position,
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
  // Backend cũ chưa gửi canEdit — coi như ghi được để không khoá nhầm người
  // dùng ra khỏi chính lịch của họ; RLS vẫn là lớp chặn thật.
  return {
    id: dto.id,
    name: dto.name,
    color: dto.color as CalendarColor,
    canEdit: dto.canEdit !== false,
  };
}

// Một số tài khoản đang mang nhiều lịch "Cá nhân" trùng hệt nhau do lỗi tự tạo
// lịch mặc định trước đây (xem createDefaultCalendarOnce). Gộp ngay sau khi nhận
// từ API để mọi nơi đọc calendars() đều thấy cùng một danh sách: sidebar, bảng
// chọn lịch trong form sự kiện và màn hình import — thay vì mỗi chỗ tự gộp một
// kiểu. Giữ bản ghi cũ nhất (API trả theo created_at) vì đó là lịch chứa sự kiện.
//
// CHỈ gộp lịch "Cá nhân" mặc định — trước đây gộp theo mọi tên+màu trùng nhau,
// nhưng lịch nhóm luôn mặc định màu xanh dương (color = dto.color ?? 'blue')
// và tên nhóm rất dễ trùng nhau giữa các nhóm khác nhau, nên lịch nhóm mới tạo
// bị âm thầm loại khỏi danh sách nếu trùng tên+màu với một lịch có sẵn — sự
// kiện của nhóm vẫn tồn tại trên server nhưng biến mất khỏi calendars() phía
// client, kéo theo mất cả trong visibleCalendarIds.
const DEFAULT_PERSONAL_CALENDAR_NAME = 'cá nhân';

function dedupeCalendars(list: CalendarDef[]): CalendarDef[] {
  let seenDefault = false;
  return list.filter((c) => {
    if (c.name.trim().toLowerCase() !== DEFAULT_PERSONAL_CALENDAR_NAME) return true;
    if (seenDefault) return false;
    seenDefault = true;
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
    meetLink: dto.meetLink,
    seriesId: dto.seriesId,
    recurrenceRule: dto.recurrenceRule,
    calendarType: dto.calendarType ?? 'solar',
    createdBy: dto.createdBy,
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

/**
 * Gõ xong rồi mới lọc, thay vì lọc lại sau từng phím.
 *
 * Đủ dài để một người gõ liên tục không kích hoạt lọc giữa chừng, đủ ngắn
 * để dừng tay là thấy kết quả ngay.
 */
const SEARCH_DEBOUNCE_MS = 500;

/**
 * Được mời vào NHIỀU sự kiện liên tiếp (vd một người mời khách vào từng buổi
 * của một chuỗi lặp) bắn về nhiều gói `attendee:invited` chỉ cách nhau vài
 * chục mili-giây. Mỗi gói trước đây gọi thẳng `refreshEvents()` — một lượt
 * GET /events đầy đủ — nên N lời mời liên tiếp ra N lượt tải lại toàn bộ
 * danh sách sự kiện. Gộp lại: mỗi gói mới RESET đồng hồ, chỉ tải lại đúng MỘT
 * lần sau khi dòng sự kiện đã yên trong khoảng thời gian này.
 */
const EVENTS_REFRESH_DEBOUNCE_MS = 500;

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
  private readonly i18n = inject(TranslationService);
  /** Hàm dịch truyền cho các notification-draft (xem notification-drafts.ts). */
  private readonly nt = (key: string, vars?: Readonly<Record<string, string | number>>) =>
    this.i18n.t(key, vars);

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
  /**
   * Chữ đang nằm trong ô tìm kiếm — cập nhật NGAY từng phím.
   *
   * Ô nhập phải bind vào đây chứ không phải `searchQuery`: bind vào giá trị
   * đã debounce sẽ khiến ô bị ghi đè bằng chữ cũ giữa lúc đang gõ.
   */
  readonly searchInput = signal('');

  /**
   * Từ khoá THỰC SỰ đang lọc, chỉ đổi sau khi người dùng ngừng gõ.
   * Mọi thứ dẫn xuất (visibleEvents, searchResults) đọc từ đây.
   */
  readonly searchQuery = signal('');

  private readonly searchInput$ = new Subject<string>();
  readonly pendingInvites = signal<CalendarInvite[]>([]);

  /** Mỗi gói `attendee:invited` bắn vào đây thay vì gọi thẳng refreshEvents()
   *  — xem giải thích ở EVENTS_REFRESH_DEBOUNCE_MS. */
  private readonly attendeeInviteRefresh$ = new Subject<void>();
  /** Các eventId đang chờ tải lại xong mới báo — title của sự kiện mới chỉ
   *  tra được SAU khi refreshEvents() hoàn tất (trước đó sự kiện chưa có
   *  trong `events()`, vì người dùng vừa được thêm làm khách mời). */
  private pendingAttendeeInviteEventIds: string[] = [];

  readonly todos = signal<Todo[]>([]);
  readonly todoLists = signal<TodoList[]>([]);
  readonly todosLoaded = signal(false);

  // Lịch tham khảo chỉ đọc, không lưu ở backend — hiển thị trong mục "Lịch khác".
  readonly otherCalendars: CalendarDef[] = [VN_HOLIDAY_CALENDAR_DEF];
  readonly holidayEvents: CalendarEvent[] = buildVietnamHolidayEvents(
    holidayYearWindow(this.clock.now()),
  );

  readonly visibleEvents = computed(() => {
    const visible = this.visibleCalendarIds();
    const query = this.searchQuery().trim().toLowerCase();
    return [...this.events(), ...this.holidayEvents].filter((e) => {
      if (!visible.has(e.calendarId)) return false;
      if (!query) return true;
      return matchScore(e, query) !== null;
    });
  });

  /** Top search matches, closest text match first and — within the same
   *  match tier — the event date closest to today first ("gần đến xa"). */
  readonly searchResults = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) return [];
    const today = this.today().getTime();
    return this.visibleEvents()
      .map((event) => ({ event, tier: matchScore(event, query) }))
      .filter((r): r is { event: CalendarEvent; tier: number } => r.tier !== null)
      .sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        const distanceA = Math.abs(a.event.start.getTime() - today);
        const distanceB = Math.abs(b.event.start.getTime() - today);
        return distanceA - distanceB;
      })
      .slice(0, 8)
      .map((r) => r.event);
  });

  /**
   * Gọi từ mỗi lần gõ. Ô nhập cập nhật tức thì, còn việc lọc chờ người dùng
   * ngừng tay — xem `SEARCH_DEBOUNCE_MS`.
   */
  setSearchQuery(q: string): void {
    this.searchInput.set(q);
    this.searchInput$.next(q);
  }

  /**
   * Xoá tức thì, không chờ debounce — dùng khi người dùng đã chọn xong một
   * kết quả và ô tìm kiếm phải trống ngay.
   *
   * Vẫn phải đẩy chuỗi rỗng vào luồng: một lần gõ đang chờ trong hàng đợi
   * debounce sẽ nổ sau đó và ghi đè lại từ khoá vừa xoá. Đẩy chuỗi rỗng vào
   * khiến debounceTime bỏ giá trị cũ và chỉ giữ giá trị mới nhất.
   */
  clearSearch(): void {
    this.searchInput.set('');
    this.searchQuery.set('');
    this.searchInput$.next('');
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

  private loadedUserId: string | null = null;

  constructor() {
    // debounceTime tự huỷ giá trị trước mỗi khi có phím mới, nên không bao
    // giờ có hai bộ đếm chạy song song và luôn chỉ lọc theo giá trị mới nhất.
    // distinctUntilChanged chặn việc lọc lại khi từ khoá không đổi (gõ rồi
    // xoá về đúng chuỗi cũ). takeUntilDestroyed huỷ đăng ký khi store chết.
    this.searchInput$
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((q) => this.searchQuery.set(q));

    // Mỗi lần .next() RESET đồng hồ 500ms — dồn cả chuỗi lời mời liên tiếp
    // thành đúng MỘT lượt tải lại, chạy ngầm, không có gì báo "đang tải".
    // takeUntilDestroyed() dọn subscription này cùng lúc dọn cái ở trên, nên
    // không cần thêm cơ chế cleanup riêng.
    this.attendeeInviteRefresh$
      .pipe(debounceTime(EVENTS_REFRESH_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(() => void this.flushAttendeeInviteNotifications());

    this.notificationQueue.onSnoozeReminder = (reminderId, minutes) => {
      void this.snoozeReminder(reminderId, minutes);
    };

    effect(() => {
      const userId = this.authStore.user()?.id ?? null;
      // Supabase tự refresh session khi tab được focus lại, tạo ra object
      // session/user mới (đổi reference) dù vẫn cùng một người dùng — nếu
      // gọi loadAll() mỗi lần effect này chạy thì cả trang sẽ load lại (hiện
      // skeleton) mỗi khi người dùng chuyển tab qua lại. Chỉ load lại khi id
      // người dùng thực sự đổi (đăng nhập / đăng xuất / đổi tài khoản).
      if (userId === this.loadedUserId) return;
      this.loadedUserId = userId;

      if (userId) {
        void this.loadAll();
      } else {
        this.calendars.set([]);
        this.events.set([]);
        this.visibleCalendarIds.set(new Set());
        this.pendingInvites.set([]);
        this.todos.set([]);
        this.todoLists.set([]);
        this.todosLoaded.set(false);
        this.realtime.disconnect();
      }
    });

    effect(() => {
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, this.sidebarCollapsed() ? '1' : '0');
    });
  }

  async loadAll(): Promise<void> {
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
    void this.refreshEventInvites();
    void this.groupStore.loadGroups();
    void this.loadTodosState();

    this.realtime.connect();
    this.joinAllCalendarRooms();
    this.bindRealtimeListenersOnce();
    void this.checkMissedReminders();
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
    // Kết nối lại thì kéo lại sự kiện + lời mời đã lỡ trong lúc mất mạng, và cả
    // nhắc lịch đã bắn lúc offline (reminder:fire chỉ tới được socket đang mở —
    // rớt mạng đúng lúc cron chạy thì mất, không có gì lưu để bù nếu không hỏi).
    this.realtime.onReconnect(() => {
      void this.refreshEvents();
      void this.refreshPendingInvites();
      void this.refreshEventInvites();
      void this.checkMissedReminders();
    });
    this.realtime.on<EventApiDto>('event:created', (dto) => this.handleRemoteCreated(dto));
    this.realtime.on<{ calendarId: string; batchId?: string; events: EventApiDto[] }>(
      'events:bulk-created',
      (payload) => this.handleRemoteBulkCreated(payload),
    );
    this.realtime.on<EventApiDto>('event:updated', (dto) => this.handleRemoteUpdated(dto));
    this.realtime.on<{ id: string }>('event:deleted', (payload) =>
      this.handleRemoteDeleted(payload.id),
    );
    this.realtime.on<{ calendarId: string; events: EventApiDto[] }>(
      'events:bulk-updated',
      (payload) => this.handleRemoteBulkUpdated(payload),
    );
    this.realtime.on<{ calendarId: string; ids: string[] }>('events:bulk-deleted', (payload) =>
      this.handleRemoteBulkDeleted(payload),
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
    this.realtime.on<{ event: EventApiDto; conflicts: ConflictApiDto[] }>(
      'event:conflict',
      (payload) => this.handleEventConflict(payload),
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

  /**
   * Lịch mà những chỗ TỰ CHỌN hộ người dùng nên ghi vào (trợ lý AI, import).
   *
   * Không phải phần tử đầu danh sách: API trả theo created_at nên đầu danh
   * sách thường là một lịch NHÓM mà người dùng chỉ được xem. Ghi vào đó thì
   * RLS chặn và người dùng nhận lỗi 500 không hiểu vì sao.
   */
  readonly defaultWritableCalendar = computed<CalendarDef | null>(
    () => this.calendars().find((c) => c.canEdit) ?? null,
  );

  async ensureCalendarExists(): Promise<CalendarDef> {
    const writable = this.defaultWritableCalendar();
    if (writable) return writable;
    // Chỉ có lịch chỉ-đọc: tạo cho người dùng một lịch riêng thay vì ném họ
    // vào lỗi quyền.
    if (this.calendars().length > 0 && !this.calendars().some((c) => c.canEdit)) {
      const cal = await this.createDefaultCalendarOnce();
      this.calendars.update((list) => [...list, cal]);
      this.visibleCalendarIds.update((set) => new Set([...set, cal.id]));
      return cal;
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
        canEdit: true,
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

  /** Xoá một lịch CÁ NHÂN (không phải lịch nhóm — lịch nhóm xoá qua "Xóa
   *  nhóm" để không làm nhóm mồ côi calendar_id). Backend cascade xoá luôn
   *  events/thành viên/lời mời gắn với lịch này. */
  async deleteCalendar(calendarId: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.apiUrl}/calendars/${calendarId}`));
    this.calendars.update((list) => list.filter((c) => c.id !== calendarId));
    this.events.update((list) => list.filter((e) => e.calendarId !== calendarId));
    this.visibleCalendarIds.update((set) => {
      const next = new Set(set);
      next.delete(calendarId);
      return next;
    });
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

    // visibleEvents() lọc theo visibleCalendarIds — set này chỉ được dựng một
    // lần lúc loadAll() từ những calendarId ĐÃ THẤY khi đó. Sự kiện đầu tiên
    // của một lịch trước giờ chưa có sự kiện nào (ví dụ lịch nhóm vừa tạo) thì
    // calendarId của nó chưa từng lọt vào set, nên dù upsert vào events() rồi
    // vẫn bị lọc mất khỏi lưới — người dùng phải F5 để loadAll() chạy lại và
    // thấy được calendarId này qua GET /events. Thêm thẳng vào đây thay vì chờ
    // reload.
    if (!this.visibleCalendarIds().has(event.calendarId)) {
      this.visibleCalendarIds.update((set) => new Set(set).add(event.calendarId));
    }
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

  /**
   * Sự kiện này có phải do chính người dùng đang đăng nhập tạo ra không.
   *
   * Đây là câu trả lời ĐÁNG TIN, khác với `selfOriginIds`: nó dựa trên
   * `created_by` do server ghi, nên đúng bất kể gói socket tới trước hay sau
   * phản hồi HTTP. `selfOriginIds` chỉ được đánh dấu SAU khi phản hồi HTTP về
   * (vì trước đó client chưa biết id), mà backend lại phát `event:created`
   * ngay lúc insert — nên gói socket gần như luôn thắng cuộc đua và lọt qua
   * được chốt chặn đó. Đó chính là lý do một lần tạo sự kiện lại hiện hai
   * thông báo: "Đã tạo sự kiện" từ form, và "Sự kiện mới" từ tiếng vọng này.
   *
   * Trả về false khi backend chưa gửi `createdBy` (bản cũ) để rơi về cách
   * nhận diện cũ thay vì im lặng bỏ qua thông báo của người khác.
   */
  private isCreatedByCurrentUser(dto: EventApiDto): boolean {
    const userId = this.authStore.user()?.id;
    return !!userId && !!dto.createdBy && dto.createdBy === userId;
  }

  private handleRemoteCreated(dto: EventApiDto): void {
    const event = toCalendarEvent(dto);
    // Vẫn phải cập nhật lịch: gói tin này cũng là cách các tab khác của chính
    // người dùng thấy được sự kiện vừa tạo. Chỉ phần THÔNG BÁO mới bị bỏ.
    this.upsertEvent(event);

    // Người dùng vừa tự tay tạo sự kiện thì form đã báo "Đã tạo sự kiện" rồi —
    // không cần một thông báo thứ hai kiểu "Sự kiện mới" với các nút Xem chi
    // tiết / Hoãn / Bỏ qua, vốn dành cho việc do NGƯỜI KHÁC làm hoặc cho nhắc
    // lịch tới giờ.
    if (this.isCreatedByCurrentUser(dto)) {
      this.selfOriginIds.delete(event.id);
      return;
    }

    const timeLabel = eventTimeLabel(event, this.timeFormatService.format());
    if (!this.notifyIfNotSelfOrigin(event.id, 'created', `Sự kiện mới: ${event.title}`, timeLabel)) {
      return;
    }
    this.notifications.ingest(
      eventCreatedDraft(this.nt, {
        eventId: event.id,
        title: event.title,
        timeLabel,
        start: dto.start,
        end: dto.end,
      }),
    );
  }

  /**
   * Một lô sự kiện vừa được import vào lịch mà ta đang tham gia.
   *
   * Luôn đưa sự kiện vào lưới — kể cả khi chính ta là người import, vì gói
   * này có thể về trước phản hồi HTTP. Nhưng chỉ BÁO khi người khác làm:
   * người vừa bấm import đã tự dựng thông báo tổng ở importEvents(), báo
   * thêm lần nữa là trùng.
   */
  private handleRemoteBulkCreated(payload: {
    calendarId: string;
    batchId?: string;
    events: EventApiDto[];
  }): void {
    const events = payload.events ?? [];
    for (const dto of events) this.upsertEvent(toCalendarEvent(dto));
    if (events.length === 0) return;

    // Cả lô chỉ có đúng một người tạo (import, chuỗi sự kiện lặp lại từ form
    // hoặc từ AI) — kiểm phần tử đầu là đủ. Cách này KHÔNG phụ thuộc batchId:
    // import (bulkCreate) có gửi kèm batchId nên có thể chống trùng theo
    // cách cũ bên dưới, nhưng chuỗi lặp lại (createSeries — cả đường thủ công
    // lẫn đường AI) chưa từng gửi batchId, nên nếu chỉ dựa vào batchId thì
    // MỌI lần chính người dùng tự tạo một chuỗi lặp lại sẽ luôn nhận thêm một
    // toast "Đã nhập N sự kiện" thừa, dù form/khung chat đã tự báo kết quả rồi.
    if (this.isCreatedByCurrentUser(events[0])) return;

    const calendarName = this.calendars().find((c) => c.id === payload.calendarId)?.name ?? null;
    const message = `Đã nhập ${events.length} sự kiện vào lịch${calendarName ? ` "${calendarName}"` : ''}.`;

    // Khoá chống trùng là batchId chứ không phải id sự kiện: cả lô chỉ có
    // đúng một gói tin nên xoá-khi-trúng vẫn đúng.
    if (payload.batchId && !this.notifyIfNotSelfOrigin(payload.batchId, 'created', 'Import lịch hoàn tất', message)) {
      return;
    }
    if (!payload.batchId) {
      this.notificationQueue.push({ title: 'Import lịch hoàn tất', body: message, kind: 'created' });
    }

    this.notifications.ingest(
      eventsImportedDraft(this.nt, {
        // Thiếu batchId (client cũ) thì dựng khoá từ chính nội dung lô, để
        // socket phát lại không đẻ ra thông báo thứ hai.
        batchId: payload.batchId ?? `${payload.calendarId}-${events.map((e) => e.id).join('.')}`,
        count: events.length,
        calendarName,
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
      eventUpdatedDraft(this.nt, {
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
    this.notifications.ingest(eventDeletedDraft(this.nt, id, title));
  }

  /**
   * Sửa hàng loạt lần lặp trong một chuỗi lặp lại (scope 'following'/'all').
   * Không dùng notifyIfNotSelfOrigin() vì đó là thiết kế cho MỘT id — ở đây
   * so khớp self-origin với TOÀN BỘ id trong lô, vì id được đánh dấu ở
   * updateEventSeries() chỉ là lần lặp người dùng bấm sửa, không phải cả lô.
   */
  private handleRemoteBulkUpdated(payload: { calendarId: string; events: EventApiDto[] }): void {
    const events = payload.events ?? [];
    for (const dto of events) this.upsertEvent(toCalendarEvent(dto));
    if (events.length === 0) return;

    const isSelfOrigin = events.some((e) => this.selfOriginIds.has(e.id));
    if (isSelfOrigin) {
      for (const e of events) this.selfOriginIds.delete(e.id);
      return;
    }
    this.notificationQueue.push({
      title: 'Sự kiện lặp lại đã được cập nhật',
      body: `${events.length} lần lặp đã được cập nhật.`,
      kind: 'updated',
    });
  }

  private handleRemoteBulkDeleted(payload: { calendarId: string; ids: string[] }): void {
    const ids = payload.ids ?? [];
    if (ids.length === 0) return;
    this.events.update((list) => list.filter((e) => !ids.includes(e.id)));

    const isSelfOrigin = ids.some((id) => this.selfOriginIds.has(id));
    if (isSelfOrigin) {
      for (const id of ids) this.selfOriginIds.delete(id);
      return;
    }
    this.notificationQueue.push({
      title: 'Sự kiện lặp lại đã bị xoá',
      body: `${ids.length} lần lặp đã bị xoá.`,
      kind: 'deleted',
    });
  }

  private handleAttendeeInvited(payload: {
    eventId: string;
    attendee: AttendeeApiDto;
  }): void {
    if (payload.attendee.userId !== this.authStore.user()?.id) return;
    // Toast báo ngay — nó không cần biết tên sự kiện (body rỗng) nên không
    // phải chờ refreshEvents(). Chỉ phần TẢI LẠI DANH SÁCH mới gộp lại.
    this.notificationQueue.push({
      eventId: payload.eventId,
      title: 'Bạn được mời tham gia một sự kiện',
      body: '',
      kind: 'created',
    });
    this.pendingAttendeeInviteEventIds.push(payload.eventId);
    this.attendeeInviteRefresh$.next();
  }

  /**
   * Chạy sau khi dòng `attendee:invited` liên tiếp đã yên 500ms (xem
   * EVENTS_REFRESH_DEBOUNCE_MS). Tải lại ĐÚNG MỘT LẦN cho cả đợt, rồi mới đi
   * tra tên từng sự kiện để đưa vào Notification Center — phải tải lại
   * trước, vì các sự kiện này còn chưa có trong `events()` (người dùng vừa
   * được thêm làm khách mời, chưa từng thấy qua sự kiện đó).
   */
  private async flushAttendeeInviteNotifications(): Promise<void> {
    const eventIds = this.pendingAttendeeInviteEventIds;
    this.pendingAttendeeInviteEventIds = [];
    if (eventIds.length === 0) return;

    await this.refreshEvents();
    for (const eventId of eventIds) {
      const title = this.events().find((e) => e.id === eventId)?.title ?? null;
      this.notifications.ingest(eventInvitationDraft(this.nt, eventId, title));
    }
  }

  private handleAttendeeStatusChanged(payload: { eventId: string; attendee: AttendeeApiDto }): void {
    const label = payload.attendee.status === 'accepted' ? 'đã đồng ý tham gia' : 'đã từ chối tham gia';
    this.notificationQueue.push({
      eventId: payload.eventId,
      title: `Một người tham gia ${label}`,
      body: '',
      kind: 'updated',
    });
    const eventTitle = this.events().find((e) => e.id === payload.eventId)?.title ?? null;
    this.notifications.ingest(
      attendeeStatusDraft(this.nt, {
        eventId: payload.eventId,
        attendeeId: payload.attendee.id,
        attendeeEmail: payload.attendee.email,
        eventTitle,
        status: payload.attendee.status === 'accepted' ? 'accepted' : 'declined',
      }),
    );
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
      calendarInvitationDraft(this.nt, {
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
      calendarMemberJoinedDraft(this.nt, payload.calendarId, calendar.name, payload.member.userId),
    );
  }

  /** Backend đã lưu sự kiện xong rồi mới báo — CẢNH BÁO thuần, không chặn gì
   *  cả. Bắn cả toast (popup) lẫn mục trong chuông thông báo. */
  private handleEventConflict(payload: { event: EventApiDto; conflicts: ConflictApiDto[] }): void {
    if (payload.conflicts.length === 0) return;
    const [first, ...rest] = payload.conflicts;
    const body =
      rest.length > 0 ? `Trùng giờ với "${first.title}" và ${rest.length} sự kiện khác.` : `Trùng giờ với "${first.title}".`;
    this.notificationQueue.push({
      eventId: payload.event.id,
      title: `Trùng lịch: ${payload.event.title}`,
      body,
      kind: 'conflict',
    });
    this.notifications.ingest(
      eventConflictDraft(this.nt, {
        eventId: payload.event.id,
        eventTitle: payload.event.title,
        conflicts: payload.conflicts,
      }),
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
    this.notifications.ingest(reminderDraft(this.nt, payload));
  }

  /**
   * Bù lại nhắc lịch đã bắn lúc tab đóng / máy ngủ / mất mạng — reminder:fire
   * chỉ tới được socket đang mở tại đúng khoảnh khắc cron chạy, không có gì
   * lưu để phát lại nếu không chủ động hỏi. Gọi 1 lần lúc load app và mỗi lần
   * socket reconnect; dùng lại đúng handleReminderFire nên hiện y hệt một
   * nhắc lịch vừa nhận realtime (toast + mục trong chuông thông báo).
   */
  private async checkMissedReminders(): Promise<void> {
    try {
      const missed = await firstValueFrom(
        this.http.get<
          { reminderId: string; eventId: string; title: string; startAt: string }[]
        >(`${this.apiUrl}/reminders/missed`),
      );
      for (const reminder of missed) this.handleReminderFire(reminder);
    } catch (err) {
      console.error('Không kiểm tra được nhắc lịch bị lỡ:', err);
    }
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

  /**
   * Lưu cả danh sách sự kiện đọc được từ file, trong MỘT request.
   *
   * Ném lỗi nguyên vẹn cho người gọi — màn hình Import cần phân biệt được
   * "server từ chối" với "không gọi tới được server" để quyết định có dùng
   * đường dự phòng hay không, nên ở đây không nuốt lỗi.
   */
  async importEvents(
    calendarId: string,
    drafts: readonly CalendarEventDraft[],
  ): Promise<CalendarEvent[]> {
    const batchId = crypto.randomUUID();
    // Đánh dấu TRƯỚC khi gọi: server phát socket ngay khi insert xong nên gói
    // tin hoàn toàn có thể về trước phản hồi HTTP này.
    this.markSelfOrigin(batchId);

    const created = await firstValueFrom(
      this.http.post<EventApiDto[]>(`${this.apiUrl}/events/bulk-create`, {
        calendarId,
        batchId,
        events: drafts.map((d) => toEventApiPayload(d)),
      }),
    );

    const events = (created ?? []).map(toCalendarEvent);
    for (const event of events) this.upsertEvent(event);
    this.notifyEventsImported(calendarId, events.length, batchId);
    return events;
  }

  /**
   * Thông báo tổng cho một lần import.
   *
   * Tách ra công khai vì màn hình Import còn một đường dự phòng (mất mạng thì
   * tạo từng sự kiện một) — đường đó cũng phải báo đúng như đường chính.
   */
  notifyEventsImported(calendarId: string, count: number, batchId = crypto.randomUUID()): void {
    if (count <= 0) return;
    const calendarName = this.calendars().find((c) => c.id === calendarId)?.name ?? null;
    this.notifications.ingest(eventsImportedDraft(this.nt, { batchId, count, calendarName }));
  }

  /**
   * Tạo sự kiện. Ném lỗi nếu backend không lưu được — CỐ Ý không có đường lùi.
   *
   * Trước đây hàm này bắt mọi lỗi rồi tự dựng một sự kiện `local-<timestamp>`
   * chỉ nằm trong bộ nhớ và trả về như thể đã lưu thành công. Hậu quả đúng
   * bằng chức năng của một cái lịch: người dùng thấy sự kiện hiện lên, form
   * đóng lại như bình thường, rồi tải lại trang là mất sạch — vì bản ghi đó
   * chưa bao giờ tới cơ sở dữ liệu. Tệ hơn, `console.warn` là dấu vết duy
   * nhất, nên chính lỗi thật (mất mạng? 400? RLS từ chối?) cũng bị giấu luôn.
   *
   * Sự kiện chỉ được coi là đã tạo khi backend trả về bản ghi thật. Lỗi để
   * nguyên cho phía gọi hiển thị, vì chỉ ở đó mới biết đặt thông báo ở đâu
   * cho người dùng nhìn thấy.
   */
  async createEvent(
    draft: CalendarEventDraft,
    recurrenceRule?: RecurrenceRule | null,
  ): Promise<CalendarEvent> {
    if (recurrenceRule) {
      const created = await firstValueFrom(
        this.http.post<EventApiDto[] | EventApiDto>(`${this.apiUrl}/events/series`, {
          ...toEventApiPayload(draft),
          recurrenceRule,
        }),
      );
      const rawList = Array.isArray(created) ? created : [created];
      const events = rawList.map(toCalendarEvent);
      for (const event of events) {
        this.markSelfOrigin(event.id);
        this.upsertEvent(event);
      }
      return events[0];
    }

    const created = await firstValueFrom(
      this.http.post<EventApiDto>(`${this.apiUrl}/events`, toEventApiPayload(draft)),
    );
    const event = toCalendarEvent(created);
    this.markSelfOrigin(event.id);
    // upsert chứ KHÔNG append: server phát event:created cho cả phòng lịch
    // ngay khi insert xong, nên gói socket có thể về TRƯỚC phản hồi HTTP này.
    // Khi đó handleRemoteCreated đã thêm sự kiện vào danh sách (và chưa thể
    // nhận ra là tự mình tạo, vì markSelfOrigin cần id chỉ có ở đây), append
    // thêm lần nữa sẽ tạo hai bản ghi trùng id.
    this.upsertEvent(event);
    return event;
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

  /** scope 'this' chỉ chuyển thẳng sang updateEvent() hiện có — sự kiện
   *  không thuộc chuỗi lặp lại nào thì hành vi giữ nguyên như trước. */
  async updateEventSeries(
    id: string,
    changes: Partial<CalendarEventDraft>,
    scope: SeriesEditScope,
  ): Promise<void> {
    if (scope === 'this') return this.updateEvent(id, changes);
    this.markSelfOrigin(id);
    try {
      const updated = await firstValueFrom(
        this.http.patch<EventApiDto[]>(
          `${this.apiUrl}/events/${id}/series?scope=${scope}`,
          toEventApiPayload(changes),
        ),
      );
      for (const dto of updated) this.upsertEvent(toCalendarEvent(dto));
    } catch (err) {
      console.warn('Cập nhật chuỗi sự kiện lặp lại thất bại:', err);
    }
  }

  /** scope 'this' chỉ chuyển thẳng sang deleteEvent() hiện có.
   *
   * KHÔNG nuốt lỗi như deleteEvent(): một chuỗi lặp có thể có hàng chục hàng,
   * và caller cần biết chắc backend đã xoá thật trước khi báo "Đã xoá" —
   * ngược với xoá một sự kiện đơn (mất một hàng không sao, tự dọn cục bộ vẫn
   * ổn), lỡ báo thành công cho cả chuỗi mà backend thất bại thì người dùng cứ
   * đinh ninh đã xoá trong khi lịch vẫn còn nguyên. */
  async deleteEventSeries(id: string, scope: SeriesEditScope): Promise<void> {
    if (scope === 'this') return this.deleteEvent(id);
    this.markSelfOrigin(id);
    const result = await firstValueFrom(
      this.http.delete<{ ids: string[] }>(`${this.apiUrl}/events/${id}/series?scope=${scope}`),
    );
    const ids = new Set(result.ids);
    this.events.update((list) => list.filter((e) => !ids.has(e.id)));
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
    this.notifications.respond(`event-invite-${eventId}`, status);
    // Backend đã ghi nhận phản hồi — nếu làm mới danh sách sự kiện lỗi (mạng,
    // RLS grid chưa apply migration 23...) thì KHÔNG được coi là mời hụt: lịch
    // sẽ tự đồng bộ ở lần tải lại / gói realtime kế tiếp.
    try {
      await this.refreshEvents();
    } catch (err) {
      console.warn('respondToInvite: refreshEvents lỗi (bỏ qua):', err);
    }
    return toAttendee(result);
  }

  async refreshPendingInvites(): Promise<void> {
    const result = await firstValueFrom(
      this.http.get<CalendarInviteApiDto[]>(`${this.apiUrl}/calendars/invites/mine`),
    );
    const pendingList = result
      .filter((dto) => dto.status === 'pending')
      .map(toCalendarInvite);
    this.pendingInvites.set(pendingList);

    for (const invite of pendingList) {
      this.notifications.ingest(
        calendarInvitationDraft(this.nt, {
          inviteId: invite.id,
          calendarId: invite.calendarId,
          calendarName: invite.calendarName,
          inviterEmail: invite.inviterEmail ?? null,
          createdAt: invite.createdAt.toISOString(),
        }),
      );
    }
  }

  /**
   * Kéo lời mời tham gia SỰ KIỆN còn đang chờ của mình lúc mở app.
   *
   * Trước đây lời mời sự kiện chỉ tới qua gói realtime `attendee:invited` —
   * ai đang offline lúc bị mời thì mất hẳn, không có gì bù lại (khác lời mời
   * LỊCH vốn được kéo lại ở refreshPendingInvites). Nay đổ chúng vào chuông
   * thông báo (kèm nút Đồng ý/Từ chối) mỗi lần load — id `event-invite-<id>`
   * ổn định nên gọi lại nhiều lần không nhân bản.
   */
  async refreshEventInvites(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.http.get<
          { attendeeId: string; eventId: string; title: string; start: string; end: string; calendarId: string }[]
        >(`${this.apiUrl}/events/invites/mine`),
      );
      for (const invite of result) {
        this.notifications.ingest(eventInvitationDraft(this.nt, invite.eventId, invite.title ?? null));
      }
    } catch (err) {
      console.error('Không kéo được lời mời sự kiện:', err);
    }
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
    this.notifications.respond(`calendar-invite-${inviteId}`, status);

    if (status === 'accepted') {
      await this.loadAll();
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

  /** Nguồn dữ liệu todo/todo-list DUY NHẤT của toàn app — FloatingHub, TasksPage
   *  và EventFormModal đều đọc thẳng `todos()`/`todoLists()` và gọi các hàm bên
   *  dưới thay vì tự giữ bản sao riêng, để tạo/sửa/xoá ở bất kỳ đâu cũng phản
   *  ánh ngay lập tức ở mọi nơi khác — giống cách Google Tasks đồng bộ. */
  private async loadTodosState(): Promise<void> {
    try {
      const [lists, todos] = await Promise.all([
        firstValueFrom(this.http.get<TodoListApiDto[]>(`${this.apiUrl}/todo-lists`)),
        firstValueFrom(this.http.get<TodoApiDto[]>(`${this.apiUrl}/todos`)),
      ]);
      this.todoLists.set(lists.map(toTodoList));
      this.todos.set(todos.map(toTodo));
      if (this.todoLists().length === 0) {
        // Người dùng chưa từng tạo todo nào nên migration chưa backfill được
        // danh sách nào cho họ — tạo sẵn một cái để không nơi nào trống trơn.
        await this.createTodoList('Việc cần làm của tôi');
      }
    } catch (err) {
      console.error('Lỗi khi tải việc cần làm:', err);
    } finally {
      this.todosLoaded.set(true);
    }
  }

  /** Chèn ngay vào `todos()` với id tạm trước khi request bay đi — checkbox/nút
   *  sao/thêm/xoá phản hồi tức thì thay vì đợi round-trip, UI chỉ "giật lùi"
   *  lại nếu request thật sự lỗi. Cùng cách làm cho todo lẫn todo-list bên dưới. */
  async createTodo(
    content: string,
    listId: string,
    extra?: { description?: string; dueAt?: Date },
  ): Promise<Todo> {
    const tempId = `temp-${crypto.randomUUID()}`;
    const now = new Date();
    const optimistic: Todo = {
      id: tempId,
      listId,
      content,
      description: extra?.description,
      done: false,
      dueAt: extra?.dueAt,
      starred: false,
      createdAt: now,
      updatedAt: now,
    };
    this.todos.update((list) => [optimistic, ...list]);
    try {
      const result = await firstValueFrom(
        this.http.post<TodoApiDto>(`${this.apiUrl}/todos`, {
          content,
          listId,
          ...(extra?.description ? { description: extra.description } : {}),
          ...(extra?.dueAt ? { dueAt: extra.dueAt.toISOString() } : {}),
        }),
      );
      const todo = toTodo(result);
      this.todos.update((list) => list.map((t) => (t.id === tempId ? todo : t)));
      return todo;
    } catch (err) {
      this.todos.update((list) => list.filter((t) => t.id !== tempId));
      throw err;
    }
  }

  async updateTodo(
    id: string,
    changes: {
      content?: string;
      done?: boolean;
      listId?: string;
      description?: string;
      dueAt?: Date;
      clearDueAt?: boolean;
      starred?: boolean;
    },
  ): Promise<Todo> {
    const previous = this.todos().find((t) => t.id === id);
    if (previous) {
      const optimistic: Todo = {
        ...previous,
        ...(changes.content !== undefined ? { content: changes.content } : {}),
        ...(changes.done !== undefined ? { done: changes.done } : {}),
        ...(changes.listId !== undefined ? { listId: changes.listId } : {}),
        ...(changes.description !== undefined ? { description: changes.description } : {}),
        ...(changes.starred !== undefined ? { starred: changes.starred } : {}),
        dueAt: changes.clearDueAt ? undefined : (changes.dueAt ?? previous.dueAt),
      };
      this.todos.update((list) => list.map((t) => (t.id === id ? optimistic : t)));
    }

    const { dueAt, ...rest } = changes;
    try {
      const result = await firstValueFrom(
        this.http.patch<TodoApiDto>(`${this.apiUrl}/todos/${id}`, {
          ...rest,
          ...(dueAt ? { dueAt: dueAt.toISOString() } : {}),
        }),
      );
      const todo = toTodo(result);
      this.todos.update((list) => list.map((t) => (t.id === id ? todo : t)));
      return todo;
    } catch (err) {
      if (previous) this.todos.update((list) => list.map((t) => (t.id === id ? previous : t)));
      throw err;
    }
  }

  async deleteTodo(id: string): Promise<void> {
    const removed = this.todos().find((t) => t.id === id);
    this.todos.update((list) => list.filter((t) => t.id !== id));
    try {
      await firstValueFrom(this.http.delete<void>(`${this.apiUrl}/todos/${id}`));
    } catch (err) {
      if (removed) this.todos.update((list) => [removed, ...list]);
      throw err;
    }
  }

  async createTodoList(name: string): Promise<TodoList> {
    const tempId = `temp-${crypto.randomUUID()}`;
    const now = new Date();
    const optimistic: TodoList = { id: tempId, name, position: this.todoLists().length, createdAt: now, updatedAt: now };
    this.todoLists.update((ls) => [...ls, optimistic]);
    try {
      const result = await firstValueFrom(
        this.http.post<TodoListApiDto>(`${this.apiUrl}/todo-lists`, { name }),
      );
      const list = toTodoList(result);
      this.todoLists.update((ls) => ls.map((l) => (l.id === tempId ? list : l)));
      return list;
    } catch (err) {
      this.todoLists.update((ls) => ls.filter((l) => l.id !== tempId));
      throw err;
    }
  }

  async renameTodoList(id: string, name: string): Promise<TodoList> {
    const previous = this.todoLists().find((l) => l.id === id);
    if (previous) {
      this.todoLists.update((ls) => ls.map((l) => (l.id === id ? { ...l, name } : l)));
    }
    try {
      const result = await firstValueFrom(
        this.http.patch<TodoListApiDto>(`${this.apiUrl}/todo-lists/${id}`, { name }),
      );
      const list = toTodoList(result);
      this.todoLists.update((ls) => ls.map((l) => (l.id === id ? list : l)));
      return list;
    } catch (err) {
      if (previous) this.todoLists.update((ls) => ls.map((l) => (l.id === id ? previous : l)));
      throw err;
    }
  }

  async deleteTodoList(id: string): Promise<void> {
    const removedList = this.todoLists().find((l) => l.id === id);
    const removedTodos = this.todos().filter((t) => t.listId === id);
    this.todoLists.update((ls) => ls.filter((l) => l.id !== id));
    this.todos.update((ts) => ts.filter((t) => t.listId !== id));
    try {
      await firstValueFrom(this.http.delete<void>(`${this.apiUrl}/todo-lists/${id}`));
    } catch (err) {
      if (removedList) this.todoLists.update((ls) => [...ls, removedList]);
      if (removedTodos.length > 0) this.todos.update((ts) => [...removedTodos, ...ts]);
      throw err;
    }
  }

  /** Phòng trường hợp gọi trước khi loadTodosState() xong hoặc todoLists() rỗng
   *  do lỗi tải thoáng qua — vẫn đảm bảo luôn có ít nhất 1 danh sách để dùng. */
  private defaultTodoListInFlight: Promise<TodoList> | null = null;

  ensureDefaultTodoList(): Promise<TodoList> {
    const existing = this.todoLists()[0];
    if (existing) return Promise.resolve(existing);
    this.defaultTodoListInFlight ??= this.createTodoList('Việc cần làm của tôi').finally(() => {
      this.defaultTodoListInFlight = null;
    });
    return this.defaultTodoListInFlight;
  }

  /**
   * Gửi một file .xlsx/.docx/.pdf cho AI đọc.
   *
   * CỐ Ý không lưu gì: backend chỉ trả về đề xuất, việc ghi vào lịch / việc
   * cần làm do người dùng bấm xác nhận ở bảng xem trước mới xảy ra.
   */
  async analyzeAiFile(file: File, message: string): Promise<AiFileAnalysis> {
    const form = new FormData();
    form.append('file', file);
    form.append('message', message);
    return firstValueFrom(
      this.http.post<AiFileAnalysis>(`${this.apiUrl}/ai/analyze-file`, form),
    );
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
      // events (nếu có) là TOÀN BỘ chuỗi lặp lại — mỗi lần xuất hiện phải
      // được đánh dấu self-origin và đưa vào lịch riêng, không chỉ mỗi
      // `event` đầu tiên, nếu không các lần xuất hiện còn lại sẽ hiện lên
      // kèm một thông báo "Sự kiện mới" tưởng như do người khác tạo.
      const events = result.events?.length ? result.events : [result.event];
      for (const dto of events) {
        this.markSelfOrigin(dto.id);
        this.upsertEvent(toCalendarEvent(dto));
      }
    }
    return result;
  }
}

/** Một việc AI đề xuất. Backend CỐ Ý không lưu — đây mới chỉ là bản nháp chờ
 *  người dùng duyệt ở bảng xem trước. */
export interface AiSuggestedTodo {
  readonly content: string;
  readonly description?: string;
  /** Vắng mặt khi người dùng không nêu thời gian. Không tự điền hộ. */
  readonly due_at?: string;
}

export type AiChatResult =
  | {
      intent: 'create_event';
      /** Sự kiện đầu tiên — luôn có mặt, kể cả khi `events` chứa cả chuỗi
       *  lặp lại, để mã cũ chỉ đọc `event` vẫn chạy đúng. */
      event: EventApiDto;
      /** Toàn bộ các lần xuất hiện đã tạo — chỉ có khi đây là một lịch LẶP
       *  LẠI theo nhiều thứ trong tuần (vd "lịch 246"). Vắng mặt (hoặc chỉ 1
       *  phần tử) nghĩa là một sự kiện một lần như trước giờ. */
      events?: readonly EventApiDto[];
    }
  | { intent: 'create_todos'; goal: string; todos: readonly AiSuggestedTodo[] }
  | { intent: 'chat'; reply: string }
  | {
      intent: 'unclear';
      title?: string;
      message: string;
      /** Còn thiếu gì để tạo được sự kiện — dùng để hỏi đúng câu. */
      missingFields?: readonly ('date' | 'time' | 'title')[];
      /** Giờ AI đã hiểu được dù chưa đủ ngày, "HH:mm". */
      startTime?: string;
      endTime?: string;
    };

/**
 * Một sự kiện AI đọc được từ file đính kèm.
 *
 * `start`/`end` tuỳ chọn vì file có thể nêu tên sự kiện mà không nêu ngày
 * giờ — khi đó `missing` giải thích thiếu gì, và AI KHÔNG được đoán bừa.
 */
export interface AiFileEvent {
  readonly title: string;
  readonly start?: string;
  readonly end?: string;
  readonly allDay?: boolean;
  readonly location?: string;
  readonly description?: string;
  readonly missing?: string;
}

export interface AiFileAnalysis {
  readonly kind: 'events' | 'todos' | 'mixed' | 'none';
  readonly summary: string;
  readonly events: readonly AiFileEvent[];
  readonly todos: readonly AiSuggestedTodo[];
  readonly fileName: string;
}

export interface AiChatHistoryEntry {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}
