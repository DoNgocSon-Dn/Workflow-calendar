import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { CalendarStore } from '../../data/calendar-store';
import { CALENDAR_COLOR_HEX, CalendarEvent } from '../../models/calendar.models';
import { DatePipe } from '@angular/common';

export interface GroupedAgendaDay {
  date: Date;
  dateLabel: string;
  events: CalendarEvent[];
}

export type AgendaRangeFilter = 'month' | 'next30' | 'all';

@Component({
  selector: 'app-agenda-view',
  templateUrl: './agenda-view.html',
  styleUrl: './agenda-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
})
export class AgendaView {
  protected readonly store = inject(CalendarStore);
  protected readonly colorHex = CALENDAR_COLOR_HEX;

  readonly selectEvent = output<string>();

  protected readonly filterMode = signal<AgendaRangeFilter>('month');
  protected readonly maxDisplayedDays = signal<number>(10);

  setFilterMode(mode: AgendaRangeFilter): void {
    this.filterMode.set(mode);
    this.maxDisplayedDays.set(10);
  }

  loadMore(): void {
    this.maxDisplayedDays.update((prev) => prev + 10);
  }

  protected colorFor(event: CalendarEvent): string {
    return this.colorHex[this.store.calendarColor().get(event.calendarId) ?? 'blue'];
  }

  protected readonly currentMonthLabel = computed(() => {
    const d = this.store.focusedDate();
    return d.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
  });

  protected readonly allGroupedDays = computed<GroupedAgendaDay[]>(() => {
    const allEvents = this.store.visibleEvents();
    const focused = this.store.focusedDate();
    const mode = this.filterMode();

    let filtered = allEvents;

    if (mode === 'month') {
      const year = focused.getFullYear();
      const month = focused.getMonth();
      filtered = allEvents.filter((e) => {
        const d = new Date(e.start);
        return d.getFullYear() === year && d.getMonth() === month;
      });
    } else if (mode === 'next30') {
      const startMs = new Date(
        focused.getFullYear(),
        focused.getMonth(),
        focused.getDate(),
      ).getTime();
      const endMs = startMs + 30 * 24 * 60 * 60 * 1000;
      filtered = allEvents.filter((e) => {
        const time = new Date(e.start).getTime();
        return time >= startMs && time <= endMs;
      });
    }

    const map = new Map<string, { date: Date; events: CalendarEvent[] }>();

    for (const e of filtered) {
      const startDate = new Date(e.start);
      const endDate = new Date(e.end);
      const year = startDate.getFullYear();
      const month = String(startDate.getMonth() + 1).padStart(2, '0');
      const day = String(startDate.getDate()).padStart(2, '0');
      const dayKey = `${year}-${month}-${day}`;

      if (!map.has(dayKey)) {
        map.set(dayKey, { date: startDate, events: [] });
      }
      map.get(dayKey)!.events.push({
        ...e,
        start: startDate,
        end: endDate,
      });
    }

    const keys = Array.from(map.keys()).sort();
    return keys.map((key) => {
      const item = map.get(key)!;
      return {
        date: item.date,
        dateLabel: item.date.toLocaleDateString('vi-VN', {
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }),
        events: item.events,
      };
    });
  });

  protected readonly visibleGroupedDays = computed<GroupedAgendaDay[]>(() => {
    return this.allGroupedDays().slice(0, this.maxDisplayedDays());
  });

  protected readonly hasMore = computed<boolean>(() => {
    return this.allGroupedDays().length > this.maxDisplayedDays();
  });
}
