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
import { DialogService } from '../../../../core/services/dialog.service';
import { CalendarStore } from '../../data/calendar-store';
import {
  Attendee,
  CALENDAR_COLOR_HEX,
  CalendarColor,
  CalendarEvent,
  ConflictEvent,
  ReminderDraft,
  ReminderType,
  SeriesEditScope,
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
import { DatePicker } from '../date-picker/date-picker';
import {
  RecurrenceEndType,
  RecurrenceOption,
  RecurrenceRule,
  RecurrenceUnit,
  buildPresetOptions,
  describeRecurrence,
} from '../../utils/recurrence';

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
  imports: [ReactiveFormsModule, TimePicker, DatePicker, CommentsSection],
})
export class EventFormModal {
  private readonly fb = inject(FormBuilder);
  private readonly store = inject(CalendarStore);
  private readonly authStore = inject(AuthStore);
  protected readonly i18n = inject(TranslationService);
  private readonly timeFormatService = inject(TimeFormatService);
  private readonly dialog = inject(DialogService);

  readonly event = input<CalendarEvent | null>(null);
  readonly defaultStart = input<Date | null>(null);
  readonly defaultEnd = input<Date | null>(null);
  readonly defaultAllDay = input<boolean>(false);
  readonly defaultTitle = input<string>('');

  readonly closed = output<void>();

  readonly durationPresets = DURATION_PRESETS;

  /** Chỉ hiển thị — app chưa hỗ trợ đa múi giờ, đây luôn là múi giờ trình duyệt. */
  protected readonly timezoneLabel = Intl.DateTimeFormat().resolvedOptions().timeZone;

  /** Đánh số thứ theo RecurrenceRule.byWeekdays (0 = CN .. 6 = Thứ Bảy). */
  protected readonly weekdayChips: { value: number; labelKey: string }[] = [
    { value: 1, labelKey: 'event.weekdayMon' },
    { value: 2, labelKey: 'event.weekdayTue' },
    { value: 3, labelKey: 'event.weekdayWed' },
    { value: 4, labelKey: 'event.weekdayThu' },
    { value: 5, labelKey: 'event.weekdayFri' },
    { value: 6, labelKey: 'event.weekdaySat' },
    { value: 0, labelKey: 'event.weekdaySun' },
  ];

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
  readonly calendarPickerOpen = signal(false);
  readonly locationOpen = signal(false);
  readonly descriptionOpen = signal(false);
  readonly attendeesOpen = signal(false);
  readonly remindersOpen = signal(false);
  readonly commentsOpen = signal(false);

  /** Chỉ sửa được lúc TẠO MỚI — sự kiện đã có chỉ hiển thị tóm tắt quy tắc
   *  lặp (xem describeRecurrence trong template), không cho đổi giữa chừng. */
  readonly recurrenceRule = signal<RecurrenceRule | null>(null);
  readonly repeatPickerOpen = signal(false);
  readonly customRecurrenceOpen = signal(false);
  readonly customInterval = signal(1);
  readonly customUnit = signal<RecurrenceUnit>('week');
  readonly customByWeekdays = signal<Set<number>>(new Set());
  readonly customEndType = signal<RecurrenceEndType>('never');
  readonly customUntil = signal('');
  readonly customCount = signal(10);

  /** Khách mời chờ mời khi đang TẠO MỚI sự kiện — chưa có eventId để gọi
   *  inviteAttendee() ngay, nên gom lại rồi mời hàng loạt sau khi lưu xong. */
  readonly pendingGuestEmails = signal<string[]>([]);
  readonly pendingGuestEmailControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.email],
  });

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

  /** Ẩn endDate picker khi start/end cùng ngày — tránh hiển thị ngày trùng lặp. */
  protected readonly isSameDay = computed(() => {
    const v = this.form.getRawValue();
    return v.startDate === v.endDate;
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
    meetLink: [''],
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
      this.calendarPickerOpen.set(false);
      this.attendeesOpen.set(false);
      // Mở sẵn cho sự kiện mới để lời nhắc mặc định NHÌN THẤY được và bỏ tick
      // được ngay — thêm lời nhắc ngầm sau lưng người dùng còn tệ hơn không thêm.
      this.remindersOpen.set(!evt);
      this.commentsOpen.set(false);
      this.recurrenceRule.set(evt?.seriesId ? evt.recurrenceRule ?? null : null);
      this.repeatPickerOpen.set(false);
      this.customRecurrenceOpen.set(false);
      this.customInterval.set(1);
      this.customUnit.set('week');
      this.customByWeekdays.set(new Set());
      this.customEndType.set('never');
      this.customUntil.set('');
      this.customCount.set(10);
      this.pendingGuestEmails.set([]);
      this.pendingGuestEmailControl.reset('');
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
          meetLink: evt.meetLink ?? '',
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
        meetLink: '',
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
    this.form.patchValue({ meetLink: link });
  }

  removeMeetLink(): void {
    this.form.patchValue({ meetLink: '' });
  }

  /** Đọc trực tiếp FormControl thay vì computed() — xem lý do ở selectedCalendar(). */
  protected recurrenceOptions(): RecurrenceOption[] {
    const startDateStr = this.form.controls.startDate.value;
    if (!startDateStr) return [];
    return buildPresetOptions(fromDateInputValue(startDateStr), this.i18n.locale());
  }

  protected editRecurrenceSummary(): string {
    const evt = this.event();
    if (!evt?.seriesId || !evt.recurrenceRule) return this.i18n.t('event.doesNotRepeat');
    return describeRecurrence(evt.recurrenceRule, evt.start, this.i18n.locale());
  }

  protected createRecurrenceSummary(): string {
    const rule = this.recurrenceRule();
    if (!rule) return this.i18n.t('event.doesNotRepeat');
    const startDateStr = this.form.controls.startDate.value;
    const startDate = startDateStr ? fromDateInputValue(startDateStr) : this.store.today();
    return describeRecurrence(rule, startDate, this.i18n.locale());
  }

  protected isRecurrenceOptionSelected(opt: RecurrenceOption): boolean {
    const current = this.recurrenceRule();
    if (!opt.rule && !current) return true;
    if (!opt.rule || !current) return false;
    return opt.rule.freq === current.freq;
  }

  selectRecurrenceOption(option: RecurrenceOption): void {
    if (option.rule?.freq === 'custom') {
      const existing = this.recurrenceRule();
      const startDateStr = this.form.controls.startDate.value;
      const startDate = startDateStr ? fromDateInputValue(startDateStr) : this.store.today();
      const startWeekday = startDate.getDay();

      if (existing?.freq === 'custom') {
        this.customInterval.set(existing.interval ?? 1);
        this.customUnit.set(existing.unit ?? 'week');
        this.customByWeekdays.set(
          new Set(existing.byWeekdays && existing.byWeekdays.length > 0 ? existing.byWeekdays : [startWeekday]),
        );
        this.customEndType.set(existing.endType ?? 'never');
        this.customUntil.set(existing.until ?? toDateInputValue(addDays(startDate, 30)));
        this.customCount.set(existing.count ?? 10);
      } else {
        this.customInterval.set(1);
        this.customUnit.set('week');
        this.customByWeekdays.set(new Set([startWeekday]));
        this.customEndType.set('never');
        this.customUntil.set(toDateInputValue(addDays(startDate, 30)));
        this.customCount.set(10);
      }
      this.customRecurrenceOpen.set(true);
      this.repeatPickerOpen.set(false);
      return;
    }
    this.recurrenceRule.set(option.rule);
    this.repeatPickerOpen.set(false);
    this.customRecurrenceOpen.set(false);
  }

  toggleCustomWeekday(day: number): void {
    this.customByWeekdays.update((set) => {
      const next = new Set(set);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  applyCustomRecurrence(): void {
    const endType = this.customEndType();
    const startDateStr = this.form.controls.startDate.value;
    const startDate = startDateStr ? fromDateInputValue(startDateStr) : this.store.today();
    const startWeekday = startDate.getDay();

    let byWeekdays: number[] | undefined;
    if (this.customUnit() === 'week') {
      const set = this.customByWeekdays();
      byWeekdays = set.size > 0 ? Array.from(set) : [startWeekday];
    }

    const rule: RecurrenceRule = {
      freq: 'custom',
      interval: Math.max(1, this.customInterval() || 1),
      unit: this.customUnit(),
      byWeekdays,
      endType,
      until: endType === 'until' ? (this.customUntil() || toDateInputValue(addDays(startDate, 30))) : undefined,
      count: endType === 'count' ? Math.max(1, this.customCount() || 1) : undefined,
    };
    this.recurrenceRule.set(rule);
    this.customRecurrenceOpen.set(false);
  }

  cancelCustomRecurrence(): void {
    this.customRecurrenceOpen.set(false);
  }

  addPendingGuest(): void {
    const email = this.pendingGuestEmailControl.value.trim();
    if (!email || this.pendingGuestEmailControl.invalid) {
      this.pendingGuestEmailControl.markAsTouched();
      return;
    }
    if (!this.pendingGuestEmails().includes(email)) {
      this.pendingGuestEmails.update((list) => [...list, email]);
    }
    this.pendingGuestEmailControl.reset('');
  }

  removePendingGuest(email: string): void {
    this.pendingGuestEmails.update((list) => list.filter((e) => e !== email));
  }

  protected guestCount(): number {
    return this.event() ? this.attendees().length : this.pendingGuestEmails().length;
  }

  /** Hỏi phạm vi áp dụng khi sửa/xoá một lần lặp thuộc chuỗi lặp lại. Trả về
   *  null nếu người dùng huỷ — gọi nơi phải dừng lại, không lưu/xoá gì cả. */
  private async resolveSeriesScope(title: string, message: string): Promise<SeriesEditScope | null> {
    const choice = await this.dialog.choice(
      message,
      [
        { value: 'this', label: this.i18n.t('event.scopeThis') },
        { value: 'following', label: this.i18n.t('event.scopeFollowing') },
        { value: 'all', label: this.i18n.t('event.scopeAll') },
      ],
      { title },
    );
    return choice as SeriesEditScope | null;
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
      meetLink: v.meetLink.trim() || undefined,
    };

    const current = this.event();
    let scope: SeriesEditScope = 'this';
    if (current?.seriesId) {
      const resolved = await this.resolveSeriesScope(
        this.i18n.t('event.editScopeTitle'),
        this.i18n.t('event.editScopeMessage'),
      );
      if (!resolved) return; // Người dùng huỷ — không lưu, không đóng modal.
      scope = resolved;
    }

    this.saving.set(true);
    try {
      let eventId: string;
      if (current) {
        if (current.seriesId) {
          await this.store.updateEventSeries(current.id, draft, scope);
          eventId = current.id;
        } else if (this.recurrenceRule()) {
          // Người dùng biến một sự kiện đơn lẻ thành chuỗi lặp: tạo chuỗi mới và xoá sự kiện cũ
          const created = await this.store.createEvent(draft, this.recurrenceRule());
          eventId = created.id;
          await this.store.deleteEvent(current.id);
        } else {
          await this.store.updateEvent(current.id, draft);
          eventId = current.id;
        }
      } else {
        const created = await this.store.createEvent(draft, this.recurrenceRule());
        eventId = created.id;
        for (const email of this.pendingGuestEmails()) {
          try {
            await this.store.inviteAttendee(eventId, email);
          } catch {
            // Sự kiện đã lưu là quan trọng nhất — bỏ qua lỗi mời từng khách lẻ.
          }
        }
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
    const name = (await this.dialog.prompt('Tên danh sách mới:'))?.trim();
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

  async remove(): Promise<void> {
    const current = this.event();
    if (!current) {
      this.closed.emit();
      return;
    }
    if (current.seriesId) {
      const scope = await this.resolveSeriesScope(
        this.i18n.t('event.deleteScopeTitle'),
        this.i18n.t('event.deleteScopeMessage'),
      );
      if (!scope) return; // Người dùng huỷ — không xoá, không đóng modal.
      await this.store.deleteEventSeries(current.id, scope);
    } else {
      await this.store.deleteEvent(current.id);
    }
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

  /** Đọc trực tiếp giá trị FormControl thay vì computed() — calendarId không
   *  phải signal nên computed() sẽ không tự chạy lại khi nó đổi; phương thức
   *  thường được template gọi lại mỗi vòng change detection là đủ. */
  protected selectedCalendar(): { name: string; color: CalendarColor } | null {
    const id = this.form.controls.calendarId.value;
    return this.calendars().find((c) => c.id === id) ?? null;
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
