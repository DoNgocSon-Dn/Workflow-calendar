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
import { CALENDAR_COLOR_HEX, CalendarEvent } from '../../models/calendar.models';
import {
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

import { convertSolarToLunar, LunarDate } from '../../utils/lunar-calendar';

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
}

function snap(min: number): number {
  return Math.max(0, Math.min(1440, Math.round(min / SNAP_MINUTES) * SNAP_MINUTES));
}

@Component({
  selector: 'app-time-grid-view',
  templateUrl: './time-grid-view.html',
  styleUrl: './time-grid-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
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

  lunarTooltip(day: Date): string {
    const info = this.getLunarInfo(day);
    return this.i18n.t('calendar.lunarTooltip', { day: info.day, month: info.month });
  }

  conflictTooltip(eventId: string): string {
    return this.store.conflictingEventIds().has(eventId) ? this.i18n.t('calendar.conflictTooltip') : '';
  }

  protected readonly colorHex = CALENDAR_COLOR_HEX;

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

  protected readonly scrollbarWidth = signal(6);

  protected readonly now = signal(this.clock.now());
  protected readonly nowTop = computed(() => (minutesSinceMidnight(this.now()) / 60) * HOUR_HEIGHT);

  protected readonly dragCreate = signal<DragCreateState | null>(null);
  protected readonly dragMove = signal<DragDeltaState | null>(null);
  protected readonly dragResize = signal<DragDeltaState | null>(null);

  protected readonly timedEventsByDay = computed(() => {
    const map = new Map<string, PositionedEvent[]>();
    for (const day of this.days()) {
      const dayEvents = this.store
        .visibleEvents()
        .filter((e) => !e.allDay && isSameDay(e.start, day));
      map.set(toDateInputValue(day), layoutDayEvents(dayEvents, HOUR_HEIGHT));
    }
    return map;
  });

  protected readonly allDayEventsByDay = computed(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const day of this.days()) {
      map.set(
        toDateInputValue(day),
        this.store.visibleEvents().filter((e) => e.allDay && isEventOnDay(e, day)),
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

  // Chrome/Edge có thể bỏ qua width khai báo ở ::-webkit-scrollbar tuỳ theo
  // scrollbar-width; đo trực tiếp offsetWidth - clientWidth để header và
  // hàng "Cả ngày" luôn thẳng cột với lưới giờ bên dưới, bất kể trình duyệt/hệ điều hành.
  private measureScrollbarWidth(): void {
    const el = this.scrollContainer()?.nativeElement;
    if (!el) return;
    this.scrollbarWidth.set(el.offsetWidth - el.clientWidth);
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

  blockTop(pe: PositionedEvent): number {
    const state = this.dragMove();
    if (state && state.eventId === pe.event.id) {
      return pe.top + (state.deltaMin / 60) * HOUR_HEIGHT;
    }
    return pe.top;
  }

  blockHeight(pe: PositionedEvent): number {
    const state = this.dragResize();
    if (state && state.eventId === pe.event.id) {
      return Math.max(pe.height + (state.deltaMin / 60) * HOUR_HEIGHT, 14);
    }
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
    this.dragCreate.set({ dayKey, startMin, endMin: startMin + 30 });

    let moved = false;
    const onMove = (e: MouseEvent) => {
      const currentMin = snap(((e.clientY - rect.top) / HOUR_HEIGHT) * 60);
      moved = true;
      const lo = Math.min(startMin, currentMin);
      const hi = Math.max(startMin, currentMin);
      this.dragCreate.set({ dayKey, startMin: lo, endMin: Math.max(hi, lo + SNAP_MINUTES) });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
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
    let moved = false;
    this.dragMove.set({ eventId: pe.event.id, deltaMin: 0 });

    const onMove = (e: MouseEvent) => {
      const deltaY = e.clientY - startClientY;
      if (Math.abs(deltaY) > 3) moved = true;
      const deltaMin = snapSigned((deltaY / HOUR_HEIGHT) * 60);
      this.dragMove.set({ eventId: pe.event.id, deltaMin });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const state = this.dragMove();
      this.dragMove.set(null);
      if (!moved || !state) {
        this.editRequested.emit(pe.event);
        return;
      }
      this.store.updateEvent(pe.event.id, {
        start: addMinutes(pe.event.start, state.deltaMin),
        end: addMinutes(pe.event.end, state.deltaMin),
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
    this.dragResize.set({ eventId: pe.event.id, deltaMin: 0 });

    const onMove = (e: MouseEvent) => {
      const deltaY = e.clientY - startClientY;
      let deltaMin = snapSigned((deltaY / HOUR_HEIGHT) * 60);
      if (originalDuration + deltaMin < SNAP_MINUTES) deltaMin = SNAP_MINUTES - originalDuration;
      this.dragResize.set({ eventId: pe.event.id, deltaMin });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
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
