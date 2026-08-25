import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { BirthdayPopupService } from '../../../core/services/birthday-popup.service';
import { TranslationService } from '../../../core/i18n/translation.service';

interface BirthdayParticle {
  readonly emoji: string;
  readonly leftPercent: number;
  readonly delaySeconds: number;
  readonly durationSeconds: number;
  readonly sizePx: number;
}

const PARTICLE_EMOJIS = ['🎉', '🎂', '🎈', '✨', '🎁', '⭐', '🎊', '💖'];

function buildParticles(): readonly BirthdayParticle[] {
  return Array.from({ length: 24 }, (_, i) => ({
    emoji: PARTICLE_EMOJIS[i % PARTICLE_EMOJIS.length],
    leftPercent: (i * 137.5) % 100,
    delaySeconds: (i % 6) * 0.35,
    durationSeconds: 6 + (i % 4),
    sizePx: 16 + (i % 4) * 5,
  }));
}

@Component({
  selector: 'app-birthday-popup',
  templateUrl: './birthday-popup.html',
  styleUrl: './birthday-popup.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class BirthdayPopup {
  private readonly popupService = inject(BirthdayPopupService);
  protected readonly i18n = inject(TranslationService);

  protected readonly visible = this.popupService.visible;
  protected readonly data = this.popupService.data;
  protected readonly closing = signal(false);
  protected readonly candleBlownOut = signal(false);
  protected readonly wishMade = signal(false);

  protected readonly particles = computed<readonly BirthdayParticle[]>(() => buildParticles());

  blowCandle(): void {
    if (this.candleBlownOut()) return;
    this.candleBlownOut.set(true);
    this.wishMade.set(true);
  }

  close(): void {
    if (this.closing()) return;
    this.closing.set(true);
    setTimeout(() => {
      this.popupService.dismiss();
      this.closing.set(false);
      this.candleBlownOut.set(false);
      this.wishMade.set(false);
    }, 280);
  }

  onEscape(): void {
    if (this.visible()) this.close();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }
}
