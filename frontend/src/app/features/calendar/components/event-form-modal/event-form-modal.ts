import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth-store';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { TimeFormatService } from '../../../../core/time-format/time-format-service';
import { CalendarStore } from '../../data/calendar-store';
import {
  Attendee,
  CALENDAR_COLOR_HEX,
  CalendarEvent,
  ConflictEvent,
  ReminderDraft,
  ReminderType,
} from '../../models/calendar.models';
import {
  addDays,
  addMinutes,
  formatTimeLabel,
  fromDateInputValue,
  parseTime24,
  startOfDay,
  toDateInputValue,
} from '../../utils/date-utils';
import { CommentsSection } from '../comments-section/comments-section';
import { TimePicker } from '../time-picker/time-picker';

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'error' in err) {
    const inner = (err as { error?: { message?: string | string[] } }).error;
    const msg = inner?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
  }
  return fallback;
}

import { convertSolarToLunar } from '../../utils/lunar-calendar';

interface DurationPreset {
  labelKey: string;
  minutes: number;
}

/** Sự kiện MỚI được tick sẵn một lời nhắc: lịch không nhắc thì mất nửa công
 *  dụng, mà mục "Lời nhắc" lại thu gọn mặc định nên rất dễ bị bỏ qua hoàn toàn.
 *  Người không cần vẫn bỏ tick được như thường. Sự kiện đang sửa KHÔNG bị áp
 *  giá trị này — nó nạp đúng lời nhắc đã lưu. */
const DEFAULT_REMINDER_OFFSET_MINUTES = 15;

/** Giá trị đặc biệt trong ô chọn danh sách — chọn vào là mở luồng tạo danh
 *  sách mới ngay tại chỗ, thay vì phải rời modal sang trang Tasks. */
const NEW_TODO_LIST_VALUE = '__create_new__';

const DURATION_PRESETS: DurationPreset[] = [
  { labelKey: 'event.duration15m', minutes: 15 },
  { labelKey: 'event.duration30m', minutes: 30 },
  { labelKey: 'event.duration45m', minutes: 45 },
  { labelKey: 'event.duration1h', minutes: 60 },
  { labelKey: 'event.duration1h30m', minutes: 90 },
  { labelKey: 'event.duration2h', minutes: 120 },
];

@Component({
  selector: 'app-event-form-modal',
  templateUrl: './event-form-modal.html',
  styleUrl: './event-form-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TimePicker, CommentsSection],
})
export class EventFormModal {
  private readonly fb = inject(FormBuilder);
  private readonly store = inject(CalendarStore);
  private readonly authStore = inject(AuthStore);
  protected readonly i18n = inject(TranslationService);
  private readonly timeFormatService = inject(TimeFormatService);

  readonly event = input<CalendarEvent | null>(null);
  readonly defaultStart = input<Date | null>(null);
  readonly defaultEnd = input<Date | null>(null);
  readonly defaultAllDay = input<boolean>(false);
  readonly defaultTitle = input<string>('');

  readonly closed = output<void>();

  readonly durationPresets = DURATION_PRESETS;

  /** Chỉ áp dụng khi tạo mới — sửa sự kiện có sẵn thì luôn ở chế độ 'event'. */
  readonly createMode = signal<'event' | 'todo'>('event');
  readonly savingTodo = signal(false);
  readonly todoError = signal<string | null>(null);
  readonly todoDueDateOpen = signal(false);
  // Đọc thẳng từ CalendarStore — cùng nguồn với FloatingHub và trang Tasks,
  // nên danh sách vừa tạo ở đây hiện ngay ở hai chỗ kia, không cần tải lại.
  readonly todoLists = this.store.todoLists;
  readonly todoListId = signal<string | null>(null);
  readonly loadingTodoLists = signal(false);

  protected readonly lunarDateHint = computed(() => {
    const startDateStr = this.form.controls.startDate.value;
    if (!startDateStr) return '';
    const d = new Date(startDateStr);
    if (isNaN(d.getTime())) return '';
    const lunar = convertSolarToLunar(d);
    return this.i18n.t('event.lunarHint', {
      day: String(lunar.day),
      month: String(lunar.month),
      year: String(lunar.year),
    });
  });
  readonly calendars = this.store.calendars;
  readonly calendarsLoading = this.store.calendarsLoading;
  readonly colorHex = CALENDAR_COLOR_HEX;
  readonly rangeError = signal(false);

  readonly conflicts = signal<ConflictEvent[] | null>(null);
  readonly checkingConflicts = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  readonly dateTimeOpen = signal(false);
  readonly locationOpen = signal(false);
  readonly descriptionOpen = signal(false);
  readonly attendeesOpen = signal(false);
  readonly remindersOpen = signal(false);
  readonly commentsOpen = signal(false);

  /** Tóm tắt một dòng khi phần ngày/giờ đang thu gọn — vd "Thứ Bảy, 29 tháng 8, 9:00 – 10:00". */
  protected readonly dateTimeSummary = computed(() => {
    const v = this.form.getRawValue();
    if (!v.startDate || !v.endDate) return '';
    const locale = this.i18n.locale();
    const intlLocale = locale === 'en' ? 'en-US' : 'vi-VN';
    const startDate = fromDateInputValue(v.startDate);
    const endDate = fromDateInputValue(v.endDate);
    const dateFmt = new Intl.DateTimeFormat(intlLocale, { weekday: 'long', day: 'numeric', month: 'long' });
    const sameDay = v.startDate === v.endDate;

    if (v.allDay) {
      return sameDay ? dateFmt.format(startDate) : `${dateFmt.format(startDate)} – ${dateFmt.format(endDate)}`;
    }

    const format = this.timeFormatService.format();
    const start = parseTime24(v.startTime, startDate);
    const end = parseTime24(v.endTime, endDate);
    const startLabel = formatTimeLabel(start, locale, format);
    const endLabel = formatTimeLabel(end, locale, format);
    return sameDay
      ? `${dateFmt.format(startDate)}, ${startLabel} – ${endLabel}`
      : `${dateFmt.format(startDate)}, ${startLabel} – ${dateFmt.format(endDate)}, ${endLabel}`;
  });

  readonly attendees = signal<Attendee[]>([]);
  readonly inviteEmailControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.email],
  });
  readonly inviteError = signal<string | null>(null);
  readonly inviting = signal(false);

  readonly reminderPresets: { labelKey: string; offsetMinutes: number }[] = [
    { labelKey: 'event.reminder15m', offsetMinutes: 15 },
    { labelKey: 'event.reminder1h', offsetMinutes: 60 },
    { labelKey: 'event.reminder1d', offsetMinutes: 1440 },
  ];
  private readonly presetOffsets = new Set(this.reminderPresets.map((p) => p.offsetMinutes));
  readonly reminderSelections = signal<Map<number, ReminderType>>(new Map());
  readonly customReminderEntries = computed(() =>
    Array.from(this.reminderSelections().entries()).filter(
      ([offset]) => !this.presetOffsets.has(offset),
    ),
  );
  readonly customReminderMinutes = new FormControl<number | null>(null);

  readonly myAttendee = computed(() => {
    const uid = this.authStore.user()?.id;
    if (!uid) return null;
    return this.attendees().find((a) => a.userId === uid) ?? null;
  });

  readonly form = this.fb.nonNullable.group({
    title: ['', Validators.required],
    calendarId: [this.store.calendars()[0]?.id ?? '', Validators.required],
    allDay: [false],
    startDate: [toDateInputValue(this.store.today())],
    startTime: ['09:00'],
    endDate: [toDateInputValue(this.store.today())],
    endTime: ['10:00'],
    location: [''],
    description: [''],
  });

  constructor() {
    effect(() => {
      const evt = this.event();
      const defStart = this.defaultStart();
      const defEnd = this.defaultEnd();
      const defAllDay = this.defaultAllDay();
      const defTitle = this.defaultTitle();

      this.conflicts.set(null);
      this.attendees.set([]);
      this.inviteEmailControl.reset('');
      this.inviteError.set(null);
      // Sự kiện mới: tick sẵn lời nhắc mặc định. Sự kiện cũ: để rỗng ở đây rồi
      // loadReminders() bên dưới đổ đúng dữ liệu đã lưu vào.
      this.reminderSelections.set(
        evt ? new Map() : new Map([[DEFAULT_REMINDER_OFFSET_MINUTES, 'popup' as ReminderType]]),
      );
      this.customReminderMinutes.reset(null);
      this.createMode.set('event');
      this.todoError.set(null);
      this.todoDueDateOpen.set(false);
      this.todoListId.set(null);
      this.dateTimeOpen.set(false);
      this.attendeesOpen.set(false);
      // Mở sẵn cho sự kiện mới để lời nhắc mặc định NHÌN THẤY được và bỏ tick
      // được ngay — thêm lời nhắc ngầm sau lưng người dùng còn tệ hơn không thêm.
      this.remindersOpen.set(!evt);
      this.commentsOpen.set(false);
      if (evt) {
        void this.loadAttendees(evt.id);
        void this.loadReminders(evt.id, evt.start);
      }

      if (evt) {
        this.locationOpen.set(!!evt.location);
        this.descriptionOpen.set(!!evt.description);
        // Stored allDay end is exclusive (day after the last day); the date
        // input shows/edits it inclusively, and save() adds the day back.
        const displayEnd = evt.allDay ? addDays(evt.end, -1) : evt.end;
        this.form.reset({
          title: evt.title,
          calendarId: evt.calendarId,
          allDay: evt.allDay,
          startDate: toDateInputValue(evt.start),
          startTime: hhmm(evt.start),
          endDate: toDateInputValue(displayEnd),
          endTime: hhmm(evt.end),
          location: evt.location ?? '',
          description: evt.description ?? '',
        });
        return;
      }

      this.locationOpen.set(false);
      this.descriptionOpen.set(false);
      const start = defStart ?? this.store.today();
      const end = defEnd ?? addMinutes(start, 60);
      this.form.reset({
        title: defTitle,
        calendarId: this.store.calendars()[0]?.id ?? '',
        allDay: defAllDay,
        startDate: toDateInputValue(start),
        startTime: hhmm(start),
        endDate: toDateInputValue(end),
        endTime: hhmm(end),
        location: '',
        description: '',
      });
    });

    effect(() => {
      const cals = this.calendars();
      if (cals.length > 0) {
        if (!this.form.controls.calendarId.value) {
          this.form.patchValue({ calendarId: cals[0].id });
        }
      } else if (!this.calendarsLoading()) {
        void this.store.ensureCalendarExists();
      }
    });

    this.form.valueChanges
      .pipe(
        map(() => {
          const v = this.form.getRawValue();
          return [v.allDay, v.startDate, v.startTime, v.endDate, v.endTime] as const;
        }),
        distinctUntilChanged((a, b) => a.every((val, i) => val === b[i])),
        debounceTime(300),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        void this.refreshConflicts();
      });

    // Modal có thể mở khi CalendarStore vẫn đang tải danh sách lịch lần đầu
    // (control calendarId được khởi tạo rỗng lúc đó). Effect ở trên chỉ chạy
    // lại khi event/defaultStart/... thay đổi nên không tự cập nhật khi
    // calendars() về sau — effect riêng này theo dõi calendars() để chọn lại
    // lịch mặc định ngay khi dữ liệu tới, miễn là đang tạo sự kiện mới và
    // người dùng chưa tự chọn một lịch hợp lệ khác.
    effect(() => {
      const cals = this.store.calendars();
      if (this.event() || cals.length === 0) return;
      const control = this.form.controls.calendarId;
      if (!cals.some((c) => c.id === control.value)) {
        control.setValue(cals[0].id);
      }
    });
  }

  private async refreshConflicts(): Promise<void> {
    const v = this.form.getRawValue();
    if (v.allDay) {
      this.conflicts.set(null);
      return;
    }
    const start = parseTime24(v.startTime, fromDateInputValue(v.startDate));
    const end = parseTime24(v.endTime, fromDateInputValue(v.endDate));
    if (end.getTime() <= start.getTime()) {
      this.conflicts.set(null);
      return;
    }

    this.checkingConflicts.set(true);
    try {
      const found = await this.store.checkConflicts({
        start,
        end,
        excludeEventId: this.event()?.id,
      });
      this.conflicts.set(found);
    } catch {
      // Chỉ là cảnh báo phụ — không hiện gì nếu kiểm tra được, không chặn lưu.
      this.conflicts.set(null);
    } finally {
      this.checkingConflicts.set(false);
    }
  }

  private async loadAttendees(eventId: string): Promise<void> {
    try {
      const list = await this.store.listAttendees(eventId);
      this.attendees.set(list);
      if (list.length > 0) this.attendeesOpen.set(true);
    } catch {
      this.attendees.set([]);
    }
  }

  private async loadReminders(eventId: string, eventStart: Date): Promise<void> {
    try {
      const reminders = await this.store.listReminders(eventId);
      const map = new Map<number, ReminderType>();
      for (const r of reminders) {
        const offsetMinutes = Math.round(
          (eventStart.getTime() - r.remindAt.getTime()) / 60_000,
        );
        map.set(offsetMinutes, r.type);
      }
      this.reminderSelections.set(map);
      if (map.size > 0) this.remindersOpen.set(true);
    } catch {
      this.reminderSelections.set(new Map());
    }
  }

  toggleField(field: 'location' | 'description' | 'attendees' | 'reminders' | 'comments'): void {
    const signals = {
      location: this.locationOpen,
      description: this.descriptionOpen,
      attendees: this.attendeesOpen,
      reminders: this.remindersOpen,
      comments: this.commentsOpen,
    } as const;
    signals[field].update((open) => !open);
  }

  toggleReminder(offsetMinutes: number): void {
    this.reminderSelections.update((map) => {
      const next = new Map(map);
      if (next.has(offsetMinutes)) next.delete(offsetMinutes);
      else next.set(offsetMinutes, 'popup');
      return next;
    });
  }

  setReminderType(offsetMinutes: number, type: ReminderType): void {
    this.reminderSelections.update((map) => {
      if (!map.has(offsetMinutes)) return map;
      const next = new Map(map);
      next.set(offsetMinutes, type);
      return next;
    });
  }

  addCustomReminder(): void {
    const minutes = this.customReminderMinutes.value;
    if (!minutes || minutes <= 0) return;
    this.reminderSelections.update((map) => {
      const next = new Map(map);
      next.set(Math.round(minutes), 'popup');
      return next;
    });
    this.customReminderMinutes.reset(null);
  }

  private async saveReminders(eventId: string): Promise<void> {
    const reminders: ReminderDraft[] = Array.from(this.reminderSelections().entries()).map(
      ([offsetMinutes, type]) => ({ offsetMinutes, type }),
    );
    try {
      await this.store.setReminders(eventId, reminders);
    } catch {
      // Không chặn việc lưu event nếu riêng phần reminder lỗi.
    }
  }

  applyDuration(minutes: number): void {
    const { startDate, startTime } = this.form.getRawValue();
    const start = parseTime24(startTime, fromDateInputValue(startDate));
    const end = addMinutes(start, minutes);
    this.form.patchValue({
      endDate: toDateInputValue(end),
      endTime: hhmm(end),
    });
  }

  generateVideoCallLink(): void {
    const roomName = 'Meet-' + Math.random().toString(36).substring(2, 9);
    const link = `https://meet.jit.si/${roomName}`;
    const currentLoc = this.form.controls.location.value;
    const newLoc = currentLoc ? `${currentLoc} | ${link}` : link;
    this.form.patchValue({ location: newLoc });
  }

  async save(): Promise<void> {
    this.saveError.set(null);

    const currentCalId = this.form.controls.calendarId.value;
    if (!currentCalId || this.calendars().length === 0) {
      try {
        const cal = await this.store.ensureCalendarExists();
        this.form.patchValue({ calendarId: cal.id });
      } catch (err) {
        console.warn('Không thể khởi tạo lịch:', err);
      }
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.calendarsLoading()) {
        this.saveError.set(this.i18n.t('event.autoCreatingCalendar'));
      } else if (this.form.controls.title.invalid) {
        this.saveError.set(this.i18n.t('event.titleRequired'));
      } else {
        this.saveError.set(this.i18n.t('event.genericError'));
      }
      return;
    }
    const v = this.form.getRawValue();

    const start = v.allDay
      ? startOfDay(fromDateInputValue(v.startDate))
      : parseTime24(v.startTime, fromDateInputValue(v.startDate));
    const end = v.allDay
      ? addMinutesDays(startOfDay(fromDateInputValue(v.endDate)), 1)
      : parseTime24(v.endTime, fromDateInputValue(v.endDate));

    if (end.getTime() <= start.getTime()) {
      this.rangeError.set(true);
      return;
    }
    this.rangeError.set(false);

    const draft = {
      title: v.title.trim(),
      calendarId: v.calendarId,
      allDay: v.allDay,
      start,
      end,
      location: v.location.trim() || undefined,
      description: v.description.trim() || undefined,
    };

    this.saving.set(true);
    try {
      const current = this.event();
      let eventId: string;
      if (current) {
        await this.store.updateEvent(current.id, draft);
        eventId = current.id;
      } else {
        eventId = (await this.store.createEvent(draft)).id;
      }
      await this.saveReminders(eventId);
      this.closed.emit();
    } catch (err) {
      this.saveError.set(extractErrorMessage(err, this.i18n.t('event.genericError')));
    } finally {
      this.saving.set(false);
    }
  }

  setCreateMode(mode: 'event' | 'todo'): void {
    this.createMode.set(mode);
    this.todoError.set(null);
    if (mode === 'todo' && this.todoLists().length === 0 && !this.loadingTodoLists()) {
      void this.loadTodoLists();
    } else if (mode === 'todo' && !this.todoListId()) {
      this.todoListId.set(this.todoLists()[0]?.id ?? null);
    }
  }

  /** CalendarStore đã tự tải todoLists() lúc đăng nhập — nhánh rỗng ở đây chỉ
   *  là lưới an toàn cho trường hợp modal mở ra trước khi tải xong. */
  private async loadTodoLists(): Promise<void> {
    this.loadingTodoLists.set(true);
    try {
      const list = await this.store.ensureDefaultTodoList();
      if (!this.todoListId()) this.todoListId.set(list.id);
    } finally {
      this.loadingTodoLists.set(false);
    }
  }

  protected readonly newTodoListValue = NEW_TODO_LIST_VALUE;

  async onTodoListSelect(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    if (select.value !== NEW_TODO_LIST_VALUE) {
      this.todoListId.set(select.value);
      return;
    }
    const name = prompt('Tên danh sách mới:')?.trim();
    if (!name) {
      // Angular bỏ qua việc ghi lại [value] nếu todoListId() không đổi (dù
      // DOM <select> vừa bị người dùng tự đổi qua tay) — reset thẳng DOM để
      // không kẹt lại ở dòng "+ Tạo danh sách mới".
      select.value = this.todoListId() ?? '';
      return;
    }
    try {
      const list = await this.store.createTodoList(name);
      this.todoListId.set(list.id);
    } catch (err) {
      this.todoError.set(extractErrorMessage(err, this.i18n.t('event.genericError')));
      select.value = this.todoListId() ?? '';
    }
  }

  onSubmit(): void {
    if (this.createMode() === 'todo') {
      void this.saveTodo();
    } else {
      void this.save();
    }
  }

  async saveTodo(): Promise<void> {
    const content = this.form.controls.title.value.trim();
    if (!content) {
      this.form.controls.title.markAsTouched();
      return;
    }
    if (this.savingTodo()) return;

    this.savingTodo.set(true);
    this.todoError.set(null);
    try {
      const listId = this.todoListId() ?? (await this.store.ensureDefaultTodoList()).id;
      const v = this.form.getRawValue();
      const dueAt = this.todoDueDateOpen() && v.startDate
        ? parseTime24(v.startTime || '09:00', fromDateInputValue(v.startDate))
        : undefined;

      await this.store.createTodo(content, listId, {
        description: v.description.trim() || undefined,
        dueAt,
      });
      this.closed.emit();
    } catch (err) {
      this.todoError.set(extractErrorMessage(err, this.i18n.t('event.genericError')));
    } finally {
      this.savingTodo.set(false);
    }
  }

  remove(): void {
    const current = this.event();
    if (current) this.store.deleteEvent(current.id);
    this.closed.emit();
  }

  cancel(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancel();
  }

  async invite(): Promise<void> {
    const evt = this.event();
    const email = this.inviteEmailControl.value.trim();
    if (!evt || !email || this.inviteEmailControl.invalid) {
      this.inviteEmailControl.markAsTouched();
      return;
    }
    this.inviting.set(true);
    this.inviteError.set(null);
    try {
      const attendee = await this.store.inviteAttendee(evt.id, email);
      this.attendees.update((list) => [...list, attendee]);
      this.inviteEmailControl.reset('');
    } catch (err) {
      this.inviteError.set(extractErrorMessage(err, this.i18n.t('event.genericError')));
    } finally {
      this.inviting.set(false);
    }
  }

  async respond(status: 'accepted' | 'declined'): Promise<void> {
    const evt = this.event();
    if (!evt) return;
    const updated = await this.store.respondToInvite(evt.id, status);
    this.attendees.update((list) => list.map((a) => (a.id === updated.id ? updated : a)));
  }

  protected statusLabel(status: Attendee['status']): string {
    if (status === 'accepted') return this.i18n.t('event.statusAccepted');
    if (status === 'declined') return this.i18n.t('event.statusDeclined');
    return this.i18n.t('event.statusPending');
  }

  protected conflictLabel(c: ConflictEvent): string {
    const locale = this.i18n.locale();
    const format = this.timeFormatService.format();
    return `${c.title} (${formatTimeLabel(c.start, locale, format)} - ${formatTimeLabel(c.end, locale, format)})`;
  }
}

function hhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function addMinutesDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
