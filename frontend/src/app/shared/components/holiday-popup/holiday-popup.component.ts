import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HolidayPopupService } from '../../../core/services/holiday-popup.service';
import { HolidayDecoration } from '../../../models/holiday-theme.model';

interface HolidayParticleView {
  readonly emoji: string;
  readonly leftPercent: number;
  readonly delaySeconds: number;
  readonly durationSeconds: number;
  readonly sizePx: number;
}

const DEFAULT_PARTICLE_COUNT = 14;

/** Deterministic pseudo-random spread (golden-angle) — no Math.random, so
 *  layout stays stable across change-detection runs. */
function buildParticles(decoration: HolidayDecoration): readonly HolidayParticleView[] {
  const emojiSet = decoration.particleEmoji;
  if (emojiSet.length === 0) return [];
  const count = decoration.particleCount ?? DEFAULT_PARTICLE_COUNT;

  return Array.from({ length: count }, (_, index) => ({
    emoji: emojiSet[index % emojiSet.length],
    leftPercent: (index * 137.5) % 100,
    delaySeconds: (index % 7) * 0.4,
    durationSeconds: 6 + (index % 5),
    sizePx: 14 + (index % 4) * 4,
  }));
}

@Component({
  selector: 'app-holiday-popup',
  templateUrl: './holiday-popup.component.html',
  styleUrl: './holiday-popup.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HolidayPopupComponent {
  private readonly popupService = inject(HolidayPopupService);

  protected readonly holiday = this.popupService.activeHoliday;
  protected readonly visible = this.popupService.visible;
  protected readonly closing = signal(false);

  protected readonly title = computed(() => {
    const holiday = this.holiday();
    return holiday ? this.popupService.resolveText(holiday.content.title) : '';
  });

  protected readonly subtitle = computed<string | null>(() => {
    const subtitle = this.holiday()?.content.subtitle;
    return subtitle ? this.popupService.resolveText(subtitle) : null;
  });

  protected readonly particles = computed<readonly HolidayParticleView[]>(() => {
    const holiday = this.holiday();
    return holiday ? buildParticles(holiday.theme.decoration) : [];
  });

  close(): void {
    if (this.closing()) return;
    this.closing.set(true);
    // Matches the CSS exit animation duration so the popup fades out before
    // it's removed from the DOM instead of disappearing abruptly.
    setTimeout(() => this.popupService.dismiss(), 220);
  }
}
