import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { HOLIDAYS } from '../../../data/holidays.data';
import { HolidayThemeService } from '../../../features/calendar/data/holiday-theme.service';
import { holidayCalendarType, holidayDateDescription, holidayName, resolveOccurrenceDatesForYear } from '../../../features/calendar/utils/holiday-resolver';
import { TranslationService } from '../../../core/i18n/translation.service';
import { VietnamCalendarDayService } from '../../../core/services/vietnam-calendar-day.service';
import { HolidayVisual } from '../holiday-popup/holiday-visual';
import { DEFAULT_HOLIDAY_THEME, Holiday } from '../../../models/holiday-theme.model';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-holiday-catalog',
  imports: [HolidayVisual, FormsModule],
  templateUrl: './holiday-catalog.html',
  styleUrl: './holiday-catalog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HolidayCatalog {
  protected readonly i18n = inject(TranslationService);
  protected readonly themes = inject(HolidayThemeService);
  private readonly day = inject(VietnamCalendarDayService);
  readonly previewStarted = output<void>();
  protected readonly year = signal(this.day.today().getFullYear());
  protected readonly years = [this.year() - 1, this.year(), this.year() + 1];
  protected readonly filter = signal('all');
  protected readonly selectedId = signal(this.themes.activeHolidayId() ?? 'tet-nguyen-dan');
  protected readonly holidays = computed(() => HOLIDAYS
    .filter((h) => this.filter() === 'all' || holidayCalendarType(h) === this.filter())
    .map((holiday) => ({ holiday, start: resolveOccurrenceDatesForYear(holiday, this.year())[0] }))
    .filter((item) => item.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime() || a.holiday.priority - b.holiday.priority));
  protected readonly selected = computed<Holiday | undefined>(() => this.holidays().find(({ holiday }) => holiday.id === this.selectedId())?.holiday ?? this.holidays()[0]?.holiday);
  protected readonly theme = computed(() => this.selected()?.theme ?? DEFAULT_HOLIDAY_THEME);
  protected readonly description = computed(() => this.selected()
    ? holidayDateDescription(this.selected()!, this.year(), this.i18n.locale()) : '');
  protected name(id: string): string {
    const holiday = HOLIDAYS.find((h) => h.id === id);
    return holiday ? holidayName(holiday, this.i18n.locale()) : '';
  }
  protected preview(): void {
    const holiday = this.selected();
    if (!holiday) return;
    this.themes.preview(holiday.id, this.year());
    this.previewStarted.emit();
  }
}
