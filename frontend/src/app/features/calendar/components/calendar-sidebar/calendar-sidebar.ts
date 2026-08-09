import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { CalendarStore } from '../../data/calendar-store';
import { CALENDAR_COLOR_HEX } from '../../models/calendar.models';
import { MiniCalendar } from '../mini-calendar/mini-calendar';

@Component({
  selector: 'app-calendar-sidebar',
  templateUrl: './calendar-sidebar.html',
  styleUrl: './calendar-sidebar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MiniCalendar],
})
export class CalendarSidebar {
  protected readonly store = inject(CalendarStore);
  protected readonly colorHex = CALENDAR_COLOR_HEX;

  readonly createClicked = output<void>();

  onDateSelected(date: Date): void {
    this.store.goTo(date);
  }

  isVisible(calendarId: string): boolean {
    return this.store.visibleCalendarIds().has(calendarId);
  }
}
