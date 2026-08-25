import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { CalendarEvent } from '../../models/calendar.models';
import { resolveHolidayIdFromEvent } from '../../data/vietnam-holidays';
import { HOLIDAYS } from '../../../../data/holidays.data';
import { DEFAULT_HOLIDAY_THEME } from '../../../../models/holiday-theme.model';

const HOLIDAY_TYPE_KEY: Record<string, string> = {
  'le-lon': 'holiday.typeLeLon',
  'ky-niem': 'holiday.typeKyNiem',
  'quoc-te': 'holiday.typeQuocTe',
  'le-hoi': 'holiday.typeLeHoi',
};

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
  protected readonly i18n = inject(TranslationService);

  readonly event = input.required<CalendarEvent>();
  readonly closed = output<void>();

  protected readonly displayDate = computed(() =>
    this.event().start.toLocaleDateString(this.i18n.locale() === 'en' ? 'en-US' : 'vi-VN', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
  );

  private readonly matchedHoliday = computed(() => {
    const holidayId = resolveHolidayIdFromEvent(this.event());
    return holidayId ? (HOLIDAYS.find((h) => h.id === holidayId) ?? null) : null;
  });

  protected readonly theme = computed(() => this.matchedHoliday()?.theme ?? DEFAULT_HOLIDAY_THEME);

  /** Prefers the curated holiday's English title when the display language is
   *  English; falls back to the raw calendar-event title otherwise (covers
   *  fixed holidays that don't have a themed entry). */
  protected readonly displayTitle = computed(() => {
    const content = this.matchedHoliday()?.content;
    if (this.i18n.locale() === 'en' && content?.titleEn) return content.titleEn;
    return content?.title ?? this.event().title;
  });

  protected readonly badgeLabel = computed(() => {
    const type = this.matchedHoliday()?.type;
    const key = type ? HOLIDAY_TYPE_KEY[type] : null;
    return key ? this.i18n.t(key) : this.i18n.t('holiday.viewOnlyBadge');
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
