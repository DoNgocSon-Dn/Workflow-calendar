import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslationService } from '../../../../core/i18n/translation.service';
import {
  addMonths,
  buildMonthGrid,
  isSameDay,
  isSameMonth,
  monthYearLabel,
  startOfMonth,
} from '../../utils/date-utils';

@Component({
  selector: 'app-mini-calendar',
  templateUrl: './mini-calendar.html',
  styleUrl: './mini-calendar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MiniCalendar {
  protected readonly i18n = inject(TranslationService);

  readonly focusedDate = input.required<Date>();
  readonly today = input.required<Date>();
  readonly dateSelected = output<Date>();

  readonly weekdayHeaders = computed(() => [
    this.i18n.t('weekday.mon'),
    this.i18n.t('weekday.tue'),
    this.i18n.t('weekday.wed'),
    this.i18n.t('weekday.thu'),
    this.i18n.t('weekday.fri'),
    this.i18n.t('weekday.sat'),
    this.i18n.t('weekday.sun'),
  ]);

  readonly viewMonth = computed(() => startOfMonth(this.focusedDate()));
  readonly label = computed(() => monthYearLabel(this.viewMonth(), this.i18n.locale()));
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
