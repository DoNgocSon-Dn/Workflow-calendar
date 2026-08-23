import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CalendarEvent } from '../../models/calendar.models';
import { resolveHolidayThemeId } from '../../data/vietnam-holidays';
import { HOLIDAYS } from '../../../../data/holidays.data';
import { DEFAULT_HOLIDAY_THEME, HOLIDAY_TYPE_LABEL } from '../../../../models/holiday-theme.model';

/**
 * Read-only info card shown when the user clicks a Vietnam holiday entry.
 * Holidays are static reference data (see `data/vietnam-holidays.ts`), not
 * real events, so there is nothing to edit or delete here. When the event
 * matches one of the themed holidays in `data/holidays.data.ts`, the card
 * borrows that theme's colors/badge/icon instead of the generic look.
 */
@Component({
  selector: 'app-holiday-info-modal',
  templateUrl: './holiday-info-modal.html',
  styleUrl: './holiday-info-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HolidayInfoModal {
  readonly event = input.required<CalendarEvent>();
  readonly closed = output<void>();

  protected readonly displayDate = computed(() =>
    this.event().start.toLocaleDateString('vi-VN', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
  );

  private readonly matchedHoliday = computed(() => {
    const themeId = resolveHolidayThemeId(this.event());
    return themeId ? (HOLIDAYS.find((h) => h.id === themeId) ?? null) : null;
  });

  protected readonly theme = computed(() => this.matchedHoliday()?.theme ?? DEFAULT_HOLIDAY_THEME);

  protected readonly badgeLabel = computed(() => {
    const type = this.matchedHoliday()?.type;
    return type ? HOLIDAY_TYPE_LABEL[type] : 'Ngày lễ · Chỉ xem';
  });

  /** First emoji of the matched theme's decoration, falling back to 🎉. */
  protected readonly icon = computed(() => this.theme().decoration.particleEmoji?.[0] ?? '🎉');

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }
}
