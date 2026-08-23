import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { DensityService } from '../../../../core/density/density-service';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { CalendarStore } from '../../data/calendar-store';
import { CALENDAR_COLOR_HEX, CalendarEvent } from '../../models/calendar.models';
import {
  addMinutes,
  buildMonthGrid,
  formatTimeLabel,
  isSameDay,
  isSameMonth,
  startOfDay,
  toDateInputValue,
} from '../../utils/date-utils';
import { isEventOnDay } from '../../utils/event-utils';

import { convertSolarToLunar, LunarDate } from '../../utils/lunar-calendar';

interface DragSelectRange {
  start: Date;
  end: Date;
}

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
  private readonly densityService = inject(DensityService);
  protected readonly i18n = inject(TranslationService);
  protected readonly colorHex = CALENDAR_COLOR_HEX;

  protected readonly weekdayHeaders = computed(() => [
    this.i18n.t('weekday.mon'),
    this.i18n.t('weekday.tue'),
    this.i18n.t('weekday.wed'),
    this.i18n.t('weekday.thu'),
    this.i18n.t('weekday.fri'),
    this.i18n.t('weekday.sat'),
    this.i18n.t('weekday.sun'),
  ]);

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

  // Chế độ "Gọn" (Cài đặt > Hình thức) hiện nhiều sự kiện hơn mỗi ngày vì
  // mỗi dòng chiếm ít chỗ hơn — xem density-service.ts.
  private readonly maxVisiblePerDay = computed(() =>
    this.densityService.density() === 'compact' ? 5 : 3,
  );

  readonly createRequested = output<CreateRequest>();
  readonly editRequested = output<CalendarEvent>();

  readonly days = computed(() => buildMonthGrid(this.store.focusedDate()));
  readonly expandedDayKey = signal<string | null>(null);
  private draggingEventId: string | null = null;

  private isSelecting = false;
  private selectAnchor: Date | null = null;
  readonly dragSelectRange = signal<DragSelectRange | null>(null);

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
    return this.eventsFor(day).slice(0, this.maxVisiblePerDay());
  }

  hiddenCountFor(day: Date): number {
    return Math.max(0, this.eventsFor(day).length - this.maxVisiblePerDay());
  }

  eventLabel(event: CalendarEvent): string {
    return event.allDay ? event.title : `${formatTimeLabel(event.start, this.i18n.locale())} ${event.title}`;
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

  isInDragRange(day: Date): boolean {
    const range = this.dragSelectRange();
    if (!range) return false;
    return day.getTime() >= range.start.getTime() && day.getTime() <= range.end.getTime();
  }

  onCellMouseDown(day: Date, mouseEvent: MouseEvent): void {
    if (mouseEvent.button !== 0) return;
    mouseEvent.preventDefault();
    this.closeExpanded();
    this.isSelecting = true;
    this.selectAnchor = day;
    this.dragSelectRange.set({ start: day, end: day });

    const onUp = () => {
      document.removeEventListener('mouseup', onUp);
      this.isSelecting = false;
      this.selectAnchor = null;
      const range = this.dragSelectRange();
      this.dragSelectRange.set(null);
      if (!range) return;

      if (isSameDay(range.start, range.end)) {
        const start = new Date(range.start);
        start.setHours(9, 0, 0, 0);
        this.createRequested.emit({ start, end: addMinutes(start, 60), allDay: false });
      } else {
        // end stays the inclusive last day here — the form shows/edits dates
        // inclusively and save() is the one place that adds the +1 day to
        // get the exclusive storage end (see event-form-modal.ts).
        this.createRequested.emit({
          start: range.start,
          end: range.end,
          allDay: true,
        });
      }
    };
    document.addEventListener('mouseup', onUp);
  }

  onCellMouseEnter(day: Date): void {
    if (!this.isSelecting || !this.selectAnchor) return;
    const anchor = this.selectAnchor;
    const [start, end] = anchor.getTime() <= day.getTime() ? [anchor, day] : [day, anchor];
    this.dragSelectRange.set({ start: startOfDay(start), end: startOfDay(end) });
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
