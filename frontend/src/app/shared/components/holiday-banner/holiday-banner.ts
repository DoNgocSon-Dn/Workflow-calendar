import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { HolidayThemeService } from '../../../features/calendar/data/holiday-theme.service';
import { HolidayPopupService } from '../../../core/services/holiday-popup.service';
import { TranslationService } from '../../../core/i18n/translation.service';
import { VietnamCalendarDayService } from '../../../core/services/vietnam-calendar-day.service';
import { holidayDateDescription, holidayName } from '../../../features/calendar/utils/holiday-resolver';

@Component({
  selector: 'app-holiday-banner',
  template: `@if (themes.activeHoliday(); as holiday) {
    <aside [attr.aria-label]="i18n.t('holidayCatalog.title')" [class.preview]="themes.previewing()">
      <div class="copy">
        <span class="eyebrow">{{ i18n.t(themes.previewing() ? 'holidayCatalog.previewing' : 'holidayCatalog.todayLabel') }}</span>
        <strong>{{ name() }}</strong><span class="date">{{ date() }}</span>
      </div>
      <div class="actions">
        <button type="button" (click)="open()">{{ i18n.t('holidayCatalog.greeting') }}</button>
        @if (themes.previewing()) {
          <button type="button" (click)="themes.clearPreview()">{{ i18n.t('holidayCatalog.today') }}</button>
        }
      </div>
    </aside>
  }`,
  styles: `:host { display: block; flex-shrink: 0; }
    aside { display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 10px 20px; border-bottom: 1px solid var(--holiday-border);
      background: var(--holiday-accent-soft); color: var(--color-text); }
    .copy { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 12px; }
    .eyebrow, .date { font-size: .75rem; color: var(--color-text-secondary); }
    strong { font-size: .85rem; color: var(--holiday-accent); }
    .actions { display: flex; flex-shrink: 0; gap: 8px; }
    button { min-height: 36px; padding: 7px 10px; font: inherit; font-size: .75rem; cursor: pointer;
      border: 1px solid var(--holiday-border); color: var(--holiday-accent); background: var(--color-surface); border-radius: 8px; }
    button:focus-visible { outline: 2px solid var(--holiday-accent); outline-offset: 2px; }
    @media(max-width: 600px) { aside { padding: 8px 12px; align-items: flex-start; flex-direction: column; gap: 6px; }
      .copy { gap: 4px 8px; } .actions button { min-height: 40px; } }
    @media print { :host { display: none; } }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HolidayBanner {
  protected readonly themes = inject(HolidayThemeService);
  protected readonly i18n = inject(TranslationService);
  private readonly popup = inject(HolidayPopupService);
  private readonly day = inject(VietnamCalendarDayService);
  protected readonly name = computed(() => holidayName(this.themes.activeHoliday()!, this.i18n.locale()));
  protected readonly date = computed(() => holidayDateDescription(this.themes.activeHoliday()!,
    this.themes.previewing() ? this.themes.previewYear() : this.day.today().getFullYear(), this.i18n.locale()));
  protected open(): void {
    const holiday = this.themes.activeHoliday();
    if (holiday) this.popup.showHoliday(holiday, this.themes.previewing() ? this.themes.previewYear() : this.day.today().getFullYear());
  }
}
