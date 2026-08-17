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

function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'error' in err) {
    const inner = (err as { error?: { message?: string | string[] } }).error;
    const msg = inner?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
  }
  return 'Đã xảy ra lỗi, vui lòng thử lại.';
}

interface DurationPreset {
  label: string;
  minutes: number;
}

const DURATION_PRESETS: DurationPreset[] = [
  { label: '15 phút', minutes: 15 },
  { label: '30 phút', minutes: 30 },
  { label: '45 phút', minutes: 45 },
  { label: '1 giờ', minutes: 60 },
  { label: '1.5 giờ', minutes: 90 },
  { label: '2 giờ', minutes: 120 },
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

  readonly event = input<CalendarEvent | null>(null);
  readonly defaultStart = input<Date | null>(null);
  readonly defaultEnd = input<Date | null>(null);
  readonly defaultAllDay = input<boolean>(false);
  readonly defaultTitle = input<string>('');

  readonly closed = output<void>();

  readonly durationPresets = DURATION_PRESETS;
  readonly calendars = this.store.calendars;
  readonly calendarsLoading = this.store.calendarsLoading;
  readonly colorHex = CALENDAR_COLOR_HEX;
  readonly rangeError = signal(false);

  readonly conflicts = signal<ConflictEvent[] | null>(null);
  readonly checkingConflicts = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  readonly locationOpen = signal(false);
  readonly descriptionOpen = signal(false);
  readonly attendeesOpen = signal(false);
  readonly remindersOpen = signal(false);
  readonly commentsOpen = signal(false);

  readonly attendees = signal<Attendee[]>([]);
  readonly inviteEmailControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.email],
  });
  readonly inviteError = signal<string | null>(null);
  readonly inviting = signal(false);

  readonly reminderPresets: { label: string; offsetMinutes: number }[] = [
    { label: '15 phút trước', offsetMinutes: 15 },
    { label: '1 giờ trước', offsetMinutes: 60 },
    { label: '1 ngày trước', offsetMinutes: 1440 },
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
      this.reminderSelections.set(new Map());
      this.customReminderMinutes.reset(null);
      this.attendeesOpen.set(false);
      this.remindersOpen.set(false);
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
        this.saveError.set('Đang tải danh sách lịch, vui lòng đợi trong giây lát.');
      } else if (this.form.controls.title.invalid) {
        this.saveError.set('Vui lòng nhập tiêu đề sự kiện.');
      } else {
        this.saveError.set('Vui lòng kiểm tra lại các trường bắt buộc.');
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
      this.saveError.set(extractErrorMessage(err));
    } finally {
      this.saving.set(false);
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
      this.inviteError.set(extractErrorMessage(err));
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
    if (status === 'accepted') return 'Đã đồng ý';
    if (status === 'declined') return 'Đã từ chối';
    return 'Chờ phản hồi';
  }

  protected conflictLabel(c: ConflictEvent): string {
    return `${c.title} (${formatTimeLabel(c.start)} - ${formatTimeLabel(c.end)})`;
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
