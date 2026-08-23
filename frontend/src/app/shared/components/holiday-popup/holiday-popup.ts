import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslationService } from '../../../core/i18n/translation.service';
import { HolidayPopupService } from '../../../core/services/holiday-popup.service';
import {
  DEFAULT_HOLIDAY_THEME,
  HolidayDecoration,
} from '../../../models/holiday-theme.model';
import { HolidayVisual } from './holiday-visual';

const HOLIDAY_TYPE_KEY: Record<string, string> = {
  'le-lon': 'holiday.typeLeLon',
  'ky-niem': 'holiday.typeKyNiem',
  'quoc-te': 'holiday.typeQuocTe',
  'le-hoi': 'holiday.typeLeHoi',
};

interface HolidayParticleView {
  readonly emoji: string;
  readonly leftPercent: number;
  readonly delaySeconds: number;
  readonly durationSeconds: number;
  readonly sizePx: number;
}

/** Deterministic pseudo-random spread (golden-angle) — no Math.random, so
 *  layout stays stable across change-detection runs. */
function buildParticles(decoration: HolidayDecoration): readonly HolidayParticleView[] {
  const emojiSet = decoration.particleEmoji;
  if (!emojiSet || emojiSet.length === 0) return [];
  const count = decoration.particleCount ?? 0;
  return Array.from({ length: count }, (_, index) => ({
    emoji: emojiSet[index % emojiSet.length],
    leftPercent: (index * 137.5) % 100,
    delaySeconds: (index % 7) * 0.4,
    durationSeconds: 7 + (index % 5),
    sizePx: 14 + (index % 4) * 4,
  }));
}

@Component({
  selector: 'app-holiday-popup',
  templateUrl: './holiday-popup.html',
  styleUrl: './holiday-popup.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HolidayVisual],
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class HolidayPopup {
  private readonly popupService = inject(HolidayPopupService);
  protected readonly i18n = inject(TranslationService);

  protected readonly holiday = this.popupService.activeHoliday;
  protected readonly visible = this.popupService.visible;
  protected readonly closing = signal(false);

  protected readonly theme = computed(() => this.holiday()?.theme ?? DEFAULT_HOLIDAY_THEME);

  protected readonly typeLabel = computed<string | null>(() => {
    const type = this.holiday()?.type;
    const key = type ? HOLIDAY_TYPE_KEY[type] : null;
    return key ? this.i18n.t(key) : null;
  });

  protected readonly title = computed(() => {
    const holiday = this.holiday();
    if (!holiday) return '';
    const raw = this.i18n.locale() === 'en' ? (holiday.content.titleEn ?? holiday.content.title) : holiday.content.title;
    return this.popupService.resolveText(raw);
  });

  protected readonly subtitle = computed<string | null>(() => {
    const holiday = this.holiday();
    if (!holiday) return null;
    const raw =
      this.i18n.locale() === 'en'
        ? holiday.content.subtitleEn ?? holiday.content.subtitle
        : holiday.content.subtitle;
    return raw ? this.popupService.resolveText(raw) : null;
  });

  /** The popup only ever shows on the day it matches, so "today" is simply now. */
  protected readonly dateLabel = computed(() =>
    new Intl.DateTimeFormat(this.i18n.locale() === 'en' ? 'en-US' : 'vi-VN', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date()),
  );

  protected readonly particles = computed<readonly HolidayParticleView[]>(() =>
    buildParticles(this.theme().decoration),
  );

  close(): void {
    if (this.closing()) return;
    this.closing.set(true);
    // Matches the CSS exit animation duration so the popup fades out before
    // it's removed from the DOM instead of disappearing abruptly.
    setTimeout(() => this.popupService.dismiss(), 220);
  }

  onEscape(): void {
    if (this.visible()) this.close();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }
}
