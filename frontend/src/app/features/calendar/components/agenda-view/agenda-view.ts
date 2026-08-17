import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
} from '@angular/core';
import { CalendarStore } from '../../data/calendar-store';
import { CALENDAR_COLOR_HEX, CalendarEvent } from '../../models/calendar.models';
import { DatePipe } from '@angular/common';

export interface GroupedAgendaDay {
  date: Date;
  dateLabel: string;
  events: CalendarEvent[];
}

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

  protected colorFor(event: CalendarEvent): string {
    return this.colorHex[this.store.calendarColor().get(event.calendarId) ?? 'blue'];
  }

  protected readonly groupedDays = computed<GroupedAgendaDay[]>(() => {
    const events = this.store.visibleEvents();
    const map = new Map<string, CalendarEvent[]>();

    for (const e of events) {
      const dayKey = e.start.toISOString().split('T')[0];
      if (!map.has(dayKey)) map.set(dayKey, []);
      map.get(dayKey)!.push(e);
    }

    const keys = Array.from(map.keys()).sort();
    return keys.map((key) => {
      const date = new Date(key);
      return {
        date,
        dateLabel: date.toLocaleDateString('vi-VN', {
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }),
        events: map.get(key)!,
      };
    });
  });
}
