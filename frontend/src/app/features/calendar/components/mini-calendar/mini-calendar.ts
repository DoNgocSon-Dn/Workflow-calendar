import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  addMonths,
  buildMonthGrid,
  isSameDay,
  isSameMonth,
  monthYearLabel,
  startOfMonth,
} from '../../utils/date-utils';

const WEEKDAY_HEADERS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

@Component({
  selector: 'app-mini-calendar',
  templateUrl: './mini-calendar.html',
  styleUrl: './mini-calendar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MiniCalendar {
  readonly focusedDate = input.required<Date>();
  readonly today = input.required<Date>();
  readonly dateSelected = output<Date>();

  readonly weekdayHeaders = WEEKDAY_HEADERS;

  readonly viewMonth = computed(() => startOfMonth(this.focusedDate()));
  readonly label = computed(() => monthYearLabel(this.viewMonth()));
  readonly days = computed(() => buildMonthGrid(this.viewMonth()));

  isToday(day: Date): boolean {
    return isSameDay(day, this.today());
  }

  isSelected(day: Date): boolean {
    return isSameDay(day, this.focusedDate());
  }

  isCurrentMonth(day: Date): boolean {
    return isSameMonth(day, this.viewMonth());
  }

  prevMonth(): void {
    this.dateSelected.emit(startOfMonth(addMonths(this.viewMonth(), -1)));
  }

  nextMonth(): void {
    this.dateSelected.emit(startOfMonth(addMonths(this.viewMonth(), 1)));
  }

  selectDay(day: Date): void {
    this.dateSelected.emit(day);
  }
}
