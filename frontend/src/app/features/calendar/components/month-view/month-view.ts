import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { CalendarStore } from '../../data/calendar-store';
import { CALENDAR_COLOR_HEX, CalendarEvent } from '../../models/calendar.models';
import {
  addMinutes,
  buildMonthGrid,
  formatTimeLabel,
  isSameDay,
  isSameMonth,
  toDateInputValue,
} from '../../utils/date-utils';
import { isEventOnDay } from '../../utils/event-utils';

const WEEKDAY_HEADERS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const MAX_VISIBLE_PER_DAY = 3;

export interface CreateRequest {
  start: Date;
  end: Date;
  allDay: boolean;
}

@Component({
  selector: 'app-month-view',
  templateUrl: './month-view.html',
  styleUrl: './month-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonthView {
  protected readonly store = inject(CalendarStore);
  protected readonly colorHex = CALENDAR_COLOR_HEX;
  protected readonly weekdayHeaders = WEEKDAY_HEADERS;

  readonly createRequested = output<CreateRequest>();
  readonly editRequested = output<CalendarEvent>();

  readonly days = computed(() => buildMonthGrid(this.store.focusedDate()));
  readonly expandedDayKey = signal<string | null>(null);
  private draggingEventId: string | null = null;

  private readonly eventsByDay = computed(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const day of this.days()) {
      const key = toDateInputValue(day);
      const list = this.store.visibleEvents().filter((e) => isEventOnDay(e, day));
      list.sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return a.start.getTime() - b.start.getTime();
      });
      map.set(key, list);
    }
    return map;
  });

  eventsFor(day: Date): CalendarEvent[] {
    return this.eventsByDay().get(toDateInputValue(day)) ?? [];
  }

  visibleEventsFor(day: Date): CalendarEvent[] {
    return this.eventsFor(day).slice(0, MAX_VISIBLE_PER_DAY);
  }

  hiddenCountFor(day: Date): number {
    return Math.max(0, this.eventsFor(day).length - MAX_VISIBLE_PER_DAY);
  }

  eventLabel(event: CalendarEvent): string {
    return event.allDay ? event.title : `${formatTimeLabel(event.start)} ${event.title}`;
  }

  isToday(day: Date): boolean {
    return isSameDay(day, this.store.today());
  }

  isCurrentMonth(day: Date): boolean {
    return isSameMonth(day, this.store.focusedDate());
  }

  dayKey(day: Date): string {
    return toDateInputValue(day);
  }

  isExpanded(day: Date): boolean {
    return this.expandedDayKey() === this.dayKey(day);
  }

  toggleExpanded(day: Date, event: MouseEvent): void {
    event.stopPropagation();
    const key = this.dayKey(day);
    this.expandedDayKey.set(this.expandedDayKey() === key ? null : key);
  }

  closeExpanded(): void {
    this.expandedDayKey.set(null);
  }

  onCellClick(day: Date): void {
    const start = new Date(day);
    start.setHours(9, 0, 0, 0);
    this.createRequested.emit({ start, end: addMinutes(start, 60), allDay: false });
  }

  onChipClick(event: CalendarEvent, domEvent: MouseEvent): void {
    domEvent.stopPropagation();
    this.editRequested.emit(event);
  }

  onDragStart(event: DragEvent, calEvent: CalendarEvent): void {
    this.draggingEventId = calEvent.id;
    event.dataTransfer?.setData('text/plain', calEvent.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onDrop(event: DragEvent, day: Date): void {
    event.preventDefault();
    const id = this.draggingEventId ?? event.dataTransfer?.getData('text/plain');
    if (id) this.store.moveEventToDay(id, day);
    this.draggingEventId = null;
  }
}
