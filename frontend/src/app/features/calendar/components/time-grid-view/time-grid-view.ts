import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Clock } from '../../../../core/clock';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { TimeFormatService } from '../../../../core/time-format/time-format-service';
import { CreateRequest } from '../month-view/month-view';
import { CalendarStore } from '../../data/calendar-store';
import { CALENDAR_COLOR_HEX, CalendarEvent, NOTE_COLOR_HEX, Note } from '../../models/calendar.models';
import {
  addDays,
  addMinutes,
  clampToDay,
  diffMinutes,
  formatHourLabel,
  formatTimeLabel,
  isSameDay,
  minutesSinceMidnight,
  startOfDay,
  toDateInputValue,
  weekdayShort,
} from '../../utils/date-utils';
import { isEventOnDay } from '../../utils/event-utils';
import { PositionedEvent, layoutDayEvents } from '../../utils/time-grid-layout';

import { convertSolarToLunar, LunarDate, lunarCellLabel } from '../../utils/lunar-calendar';
import {
  resolveTopHolidayForDate,
  holidayCalendarType,
  holidayName,
} from '../../utils/holiday-resolver';
import { Holiday } from '../../../../models/holiday-theme.model';
import { VN_HOLIDAY_CALENDAR_ID } from '../../data/vietnam-holidays';

const HOUR_HEIGHT = 48;
const SNAP_MINUTES = 15;

interface DragCreateState {
  dayKey: string;
  startMin: number;
  endMin: number;
}

interface DragDeltaState {
  eventId: string;
  deltaMin: number;
  deltaDays?: number;
}

function snap(min: number): number {
  return Math.max(0, Math.min(1440, Math.round(min / SNAP_MINUTES) * SNAP_MINUTES));
}

@Component({
  selector: 'app-time-grid-view',
  templateUrl: './time-grid-view.html',
  styleUrl: './time-grid-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // Thả ghi chú ra ngoài cột ngày / bấm Esc huỷ kéo → không có `drop`, viền
    // vàng "ô nhận ghi chú" sẽ kẹt lại. `dragend` luôn bắn khi kết thúc kéo
    // dù thành công hay không, nên dọn ở đây cho chắc.
    '(document:dragend)': 'dragOverDayKey.set(null)',
    '(document:drop)': 'dragOverDayKey.set(null)',
  },
})
export class TimeGridView {
  protected readonly store = inject(CalendarStore);
  private readonly clock = inject(Clock);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly i18n = inject(TranslationService);
  protected readonly timeFormatService = inject(TimeFormatService);

  getLunarInfo(day: Date): LunarDate {
    return convertSolarToLunar(day);
  }

  /** Phần số của ngày âm cho tiêu đề cột — chữ "ÂL" hiện một lần ở máng giờ. */
  lunarLabel(day: Date): string {
    return lunarCellLabel(this.getLunarInfo(day));
  }

  /** Sự kiện "ngày lễ" tổng hợp để mở HolidayInfoModal khi bấm nhãn lễ — lễ
   *  đã không còn nằm trong hàng "Cả ngày" cùng sự kiện người dùng tạo. */
  holidayEventFor(day: Date): CalendarEvent | null {
    const holiday = this.holidayFor(day);
    if (!holiday) return null;
    const base = startOfDay(day);
    return {
      id: `${VN_HOLIDAY_CALENDAR_ID}::${holiday.id}::${day.getFullYear()}`,
      calendarId: VN_HOLIDAY_CALENDAR_ID,
      title: holidayName(holiday, this.i18n.locale()),
      start: base,
      end: base,
      allDay: true,
      calendarType: holidayCalendarType(holiday),
    };
  }

  openHoliday(day: Date, domEvent: MouseEvent): void {
    domEvent.stopPropagation();
    const event = this.holidayEventFor(day);
    if (event) this.editRequested.emit(event);
  }

  lunarTooltip(day: Date): string {
    const info = this.getLunarInfo(day);
    return this.i18n.t('calendar.lunarTooltip', { day: info.day, month: info.month });
  }

  holidayFor(day: Date): Holiday | null {
    // Tôn trọng công tắc "Ngày lễ ở Việt Nam" trong thanh bên.
    if (!this.store.visibleCalendarIds().has(VN_HOLIDAY_CALENDAR_ID)) return null;
    return resolveTopHolidayForDate(day);
  }

  holidayTooltip(day: Date): string {
    const holiday = this.holidayFor(day);
    return holiday
      ? this.i18n.t('holiday.badgeTooltip', { name: holidayName(holiday, this.i18n.locale()) })
      : '';
  }

  /** Nhãn hiển thị của ngày lễ, dịch theo ngôn ngữ hiện tại. */
  holidayLabel(holiday: Holiday): string {
    return holidayName(holiday, this.i18n.locale());
  }

  conflictTooltip(eventId: string): string {
    return this.store.conflictingEventIds().has(eventId) ? this.i18n.t('calendar.conflictTooltip') : '';
  }

  protected readonly colorHex = CALENDAR_COLOR_HEX;
  protected readonly noteColorHex = NOTE_COLOR_HEX;

  readonly days = input.required<Date[]>();
  readonly createRequested = output<CreateRequest>();
  readonly editRequested = output<CalendarEvent>();

  protected formatHourLabel(hour: number): string {
    return formatHourLabel(hour, this.i18n.locale(), this.timeFormatService.format());
  }

  protected formatTimeLabel(date: Date): string {
    return formatTimeLabel(date, this.i18n.locale(), this.timeFormatService.format());
  }

  protected weekdayShort(day: Date): string {
    return weekdayShort(day, this.i18n.locale());
  }

  protected readonly HOUR_HEIGHT = HOUR_HEIGHT;
  protected readonly DAY_HEIGHT = HOUR_HEIGHT * 24;
  protected readonly hours = Array.from({ length: 24 }, (_, i) => i);

  private readonly scrollContainer = viewChild<ElementRef<HTMLElement>>('scrollContainer');
  // Điện thoại: mỗi cột ngày được ép một bề rộng tối thiểu (xem CSS) để 7 cột
  // không bị bóp còn vài chục pixel, nên .scroll-area cuộn NGANG lẫn dọc. Hai
  // hàng còn lại (tiêu đề + "Cả ngày") phải cuộn ngang THEO — không có thanh
  // cuộn riêng của chúng (CSS đặt overflow-x: hidden), scrollLeft của chúng bị
  // đẩy bằng tay ở đây mỗi khi .scroll-area cuộn.
  private readonly dayHeaderRow = viewChild<ElementRef<HTMLElement>>('dayHeaderRow');
  private readonly allDayRow = viewChild<ElementRef<HTMLElement>>('allDayRow');

  protected readonly scrollbarWidth = signal(6);

  protected readonly now = signal(this.clock.now());
  protected readonly nowTop = computed(() => (minutesSinceMidnight(this.now()) / 60) * HOUR_HEIGHT);

  protected readonly dragCreate = signal<DragCreateState | null>(null);
  protected readonly dragMove = signal<DragDeltaState | null>(null);
  protected readonly dragResize = signal<DragDeltaState | null>(null);

  protected readonly Math = Math;

  protected readonly timedEventsByDay = computed(() => {
    const map = new Map<string, PositionedEvent[]>();
    const resizeState = this.dragResize();
    const moveState = this.dragMove();

    // Map events with active drag modifications so multi-day clipping works dynamically during live dragging
    const events = this.store.visibleEvents().map((e) => {
      if (resizeState && resizeState.eventId === e.id) {
        const newEnd = addMinutes(e.end, resizeState.deltaMin);
        return { ...e, end: newEnd };
      }
      if (moveState && moveState.eventId === e.id) {
        const newStart = addMinutes(e.start, moveState.deltaMin);
        const newEnd = addMinutes(e.end, moveState.deltaMin);
        return { ...e, start: newStart, end: newEnd };
      }
      return e;
    });

    for (const day of this.days()) {
      const dayStart = startOfDay(day);
      const dayEnd = addDays(dayStart, 1);
      const dayEvents = events.filter(
        (e) =>
          e.calendarId !== VN_HOLIDAY_CALENDAR_ID &&
          !e.allDay &&
          e.start.getTime() < dayEnd.getTime() &&
          e.end.getTime() > dayStart.getTime(),
      );
      map.set(toDateInputValue(day), layoutDayEvents(dayEvents, HOUR_HEIGHT, day));
    }
    return map;
  });

  protected readonly allDayEventsByDay = computed(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const day of this.days()) {
      map.set(
        toDateInputValue(day),
        this.store
          .visibleEvents()
          .filter(
            (e) =>
              e.calendarId !== VN_HOLIDAY_CALENDAR_ID &&
              e.allDay &&
              isEventOnDay(e, day),
          ),
      );
    }
    return map;
  });

  constructor() {
    const intervalId = setInterval(() => this.now.set(this.clock.now()), 30_000);
    this.destroyRef.onDestroy(() => clearInterval(intervalId));

    afterNextRender(() => {
      this.scrollContainer()?.nativeElement.scrollTo({ top: 7 * HOUR_HEIGHT - 32 });
      this.measureScrollbarWidth();
    });

    const onResize = () => this.measureScrollbarWidth();
    window.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => window.removeEventListener('resize', onResize));
  }

  private measureScrollbarWidth(): void {
    const el = this.scrollContainer()?.nativeElement;
    if (!el) return;
    this.scrollbarWidth.set(el.offsetWidth - el.clientWidth);
  }

  protected onGridScroll(event: Event): void {
    const scrollLeft = (event.target as HTMLElement).scrollLeft;
    const header = this.dayHeaderRow()?.nativeElement;
    const allDay = this.allDayRow()?.nativeElement;
    if (header) header.scrollLeft = scrollLeft;
    if (allDay) allDay.scrollLeft = scrollLeft;
  }

  isNextDay(dayKeyA: string, dayB: Date): boolean {
    const parts = dayKeyA.split('-').map(Number);
    if (parts.length !== 3) return false;
    const dayA = new Date(parts[0], parts[1] - 1, parts[2]);
    const nextDayA = addDays(dayA, 1);
    return isSameDay(nextDayA, dayB);
  }

  dayKey(day: Date): string {
    return toDateInputValue(day);
  }

  isToday(day: Date): boolean {
    return isSameDay(day, this.store.today());
  }

  eventsFor(day: Date): PositionedEvent[] {
    return this.timedEventsByDay().get(this.dayKey(day)) ?? [];
  }

  allDayEventsFor(day: Date): CalendarEvent[] {
    return this.allDayEventsByDay().get(this.dayKey(day)) ?? [];
  }

  /** Ghi chú do người dùng kéo-thả "dán" lên đúng ngày này — cùng cơ chế với
   *  month-view (xem `CalendarStore.pinNoteToDay()`). Đặt ở hàng "Cả ngày" vì
   *  ghi chú không có giờ, giống hệt lý do sự kiện cả ngày cũng nằm ở đó. */
  private readonly notesByDay = computed(() => {
    const map = new Map<string, Note[]>();
    for (const note of this.store.notes()) {
      if (!note.pinnedDate) continue;
      const key = this.dayKey(note.pinnedDate);
      const list = map.get(key) ?? [];
      list.push(note);
      map.set(key, list);
    }
    return map;
  });

  notesFor(day: Date): Note[] {
    return this.notesByDay().get(this.dayKey(day)) ?? [];
  }

  /** Áp dụng cho CẢ hàng "Cả ngày" LẪN toàn bộ cột giờ bên dưới — ghi chú
   *  không có khái niệm giờ nên thả vào bất kỳ đâu trong cột của một ngày
   *  đều "dán" lên đúng ngày đó, không cần nhắm chính xác vào dải mỏng phía
   *  trên (dễ bị bỏ lỡ, đặc biệt lần đầu dùng). */
  private isNoteDrag(event: DragEvent): boolean {
    return !!event.dataTransfer?.types.includes('application/x-note-id');
  }

  protected readonly dragOverDayKey = signal<string | null>(null);

  onNoteDropZoneDragEnter(event: DragEvent, day: Date): void {
    if (!this.isNoteDrag(event)) return;
    this.dragOverDayKey.set(this.dayKey(day));
  }

  onNoteDropZoneDragLeave(_event: DragEvent, day: Date): void {
    if (this.dragOverDayKey() === this.dayKey(day)) this.dragOverDayKey.set(null);
  }

  isDragOver(day: Date): boolean {
    return this.dragOverDayKey() === this.dayKey(day);
  }

  onNoteDropZoneDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onNoteDropZoneDrop(event: DragEvent, day: Date): void {
    event.preventDefault();
    // Thả trúng cột ngày → dán vào ngày; chặn nổi bọt để handler `document:drop`
    // của <app-screen-notes> không dán chồng lên màn hình.
    event.stopPropagation();
    this.dragOverDayKey.set(null);
    const noteId = event.dataTransfer?.getData('application/x-note-id');
    if (noteId) void this.store.pinNoteToDay(noteId, day);
  }

  /** Bấm vào một ghi chú đã dán trên lịch để gỡ nó ra — nội dung vẫn còn
   *  nguyên trong sidebar, chỉ mất liên kết ngày. */
  unpinNote(event: MouseEvent, noteId: string): void {
    event.stopPropagation();
    void this.store.unpinNote(noteId);
  }

  blockTop(pe: PositionedEvent): number {
    return pe.top;
  }

  blockHeight(pe: PositionedEvent): number {
    return pe.height;
  }

  colorFor(event: CalendarEvent): string {
    return this.colorHex[this.store.calendarColor().get(event.calendarId) ?? 'blue'];
  }

  onChipClick(event: CalendarEvent, domEvent: MouseEvent): void {
    domEvent.stopPropagation();
    this.editRequested.emit(event);
  }

  onAllDayCellClick(day: Date): void {
    // end is the inclusive last day here — save() in event-form-modal adds
    // the +1 day itself to get the exclusive storage end.
    this.createRequested.emit({
      start: startOfDay(day),
      end: startOfDay(day),
      allDay: true,
    });
  }

  onGridMouseDown(mouseEvent: MouseEvent, day: Date): void {
    if (mouseEvent.button !== 0) return;
    const columnEl = mouseEvent.currentTarget as HTMLElement;
    const rect = columnEl.getBoundingClientRect();
    const startMin = snap(((mouseEvent.clientY - rect.top) / HOUR_HEIGHT) * 60);
    const dayKey = this.dayKey(day);
    const container = this.scrollContainer()?.nativeElement;

    this.dragCreate.set({ dayKey, startMin, endMin: startMin + 30 });

    let moved = false;
    let animFrameId: number | null = null;
    let lastClientY = mouseEvent.clientY;

    const updateCreate = () => {
      animFrameId = null;
      if (container) {
        const cRect = container.getBoundingClientRect();
        if (lastClientY < cRect.top + 40) {
          container.scrollTop -= 12;
        } else if (lastClientY > cRect.bottom - 40) {
          container.scrollTop += 12;
        }
      }

      const currentMin = snap(((lastClientY - rect.top) / HOUR_HEIGHT) * 60);
      moved = true;
      const lo = Math.min(startMin, currentMin);
      const hi = Math.max(startMin, currentMin);
      this.dragCreate.set({ dayKey, startMin: lo, endMin: Math.max(hi, lo + SNAP_MINUTES) });
    };

    const onMove = (e: MouseEvent) => {
      lastClientY = e.clientY;
      if (!animFrameId) {
        animFrameId = requestAnimationFrame(updateCreate);
      }
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (animFrameId) cancelAnimationFrame(animFrameId);
      const state = this.dragCreate();
      this.dragCreate.set(null);
      if (!state) return;
      const start = minutesToDate(day, state.startMin);
      const end = moved ? minutesToDate(day, state.endMin) : minutesToDate(day, startMin + 60);
      this.createRequested.emit({ start, end, allDay: false });
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  onBlockMouseDown(mouseEvent: MouseEvent, pe: PositionedEvent): void {
    if (mouseEvent.button !== 0) return;
    mouseEvent.preventDefault();
    mouseEvent.stopPropagation();

    const startClientY = mouseEvent.clientY;
    const startClientX = mouseEvent.clientX;
    const container = this.scrollContainer()?.nativeElement;

    let moved = false;
    let animFrameId: number | null = null;
    let lastClientY = startClientY;
    let lastClientX = startClientX;

    this.dragMove.set({ eventId: pe.event.id, deltaMin: 0, deltaDays: 0 });

    const updateMove = () => {
      animFrameId = null;
      const deltaY = lastClientY - startClientY;
      const deltaX = lastClientX - startClientX;
      if (Math.abs(deltaY) > 3 || Math.abs(deltaX) > 10) moved = true;

      if (container) {
        const cRect = container.getBoundingClientRect();
        if (lastClientY < cRect.top + 40) {
          container.scrollTop -= 12;
        } else if (lastClientY > cRect.bottom - 40) {
          container.scrollTop += 12;
        }
      }

      const deltaMin = snapSigned((deltaY / HOUR_HEIGHT) * 60);

      // Determine day column under mouse cursor for horizontal dragging
      let deltaDays = 0;
      if (container) {
        const columns = container.querySelectorAll('.day-col');
        let targetDayIndex = -1;
        columns.forEach((col, idx) => {
          const r = col.getBoundingClientRect();
          if (lastClientX >= r.left && lastClientX <= r.right) {
            targetDayIndex = idx;
          }
        });
        if (targetDayIndex !== -1) {
          const startDayIndex = this.days().findIndex((d) => isSameDay(d, pe.event.start));
          if (startDayIndex !== -1) {
            deltaDays = targetDayIndex - startDayIndex;
          }
        }
      }

      this.dragMove.set({ eventId: pe.event.id, deltaMin, deltaDays });
    };

    const onMove = (e: MouseEvent) => {
      lastClientY = e.clientY;
      lastClientX = e.clientX;
      if (!animFrameId) {
        animFrameId = requestAnimationFrame(updateMove);
      }
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (animFrameId) cancelAnimationFrame(animFrameId);
      const state = this.dragMove();
      this.dragMove.set(null);

      if (!moved || !state) {
        this.editRequested.emit(pe.event);
        return;
      }

      let newStart = addMinutes(pe.event.start, state.deltaMin);
      let newEnd = addMinutes(pe.event.end, state.deltaMin);
      if (state.deltaDays) {
        newStart = addDays(newStart, state.deltaDays);
        newEnd = addDays(newEnd, state.deltaDays);
      }

      this.store.updateEvent(pe.event.id, {
        start: newStart,
        end: newEnd,
      });
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  onResizeMouseDown(mouseEvent: MouseEvent, pe: PositionedEvent): void {
    if (mouseEvent.button !== 0) return;
    mouseEvent.preventDefault();
    mouseEvent.stopPropagation();

    const startClientY = mouseEvent.clientY;
    const originalDuration = diffMinutes(pe.event.start, pe.event.end);
    const container = this.scrollContainer()?.nativeElement;

    let animFrameId: number | null = null;
    let lastClientY = startClientY;

    this.dragResize.set({ eventId: pe.event.id, deltaMin: 0 });

    const updateResize = () => {
      animFrameId = null;
      if (container) {
        const cRect = container.getBoundingClientRect();
        if (lastClientY < cRect.top + 40) {
          container.scrollTop -= 12;
        } else if (lastClientY > cRect.bottom - 40) {
          container.scrollTop += 12;
        }
      }

      const deltaY = lastClientY - startClientY;
      let deltaMin = snapSigned((deltaY / HOUR_HEIGHT) * 60);
      if (originalDuration + deltaMin < SNAP_MINUTES) deltaMin = SNAP_MINUTES - originalDuration;
      this.dragResize.set({ eventId: pe.event.id, deltaMin });
    };

    const onMove = (e: MouseEvent) => {
      lastClientY = e.clientY;
      if (!animFrameId) {
        animFrameId = requestAnimationFrame(updateResize);
      }
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (animFrameId) cancelAnimationFrame(animFrameId);
      const state = this.dragResize();
      this.dragResize.set(null);
      if (!state || state.deltaMin === 0) return;
      this.store.updateEvent(pe.event.id, { end: addMinutes(pe.event.end, state.deltaMin) });
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
}

function snapSigned(min: number): number {
  return Math.round(min / SNAP_MINUTES) * SNAP_MINUTES;
}

function minutesToDate(day: Date, totalMinutes: number): Date {
  return clampToDay(
    new Date(2000, 0, 1, Math.floor(totalMinutes / 60), totalMinutes % 60),
    day,
  );
}
