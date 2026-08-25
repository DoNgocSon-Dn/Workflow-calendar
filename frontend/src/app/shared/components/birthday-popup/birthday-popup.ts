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

const BIRTHDAY_WISHES: readonly string[] = [
  'Workflow Calendar chúc bạn một tuổi mới tràn đầy năng lượng, sức khỏe dồi dào, hạnh phúc và gặt hái thật nhiều thành công rực rỡ!',
  'Chúc mừng sinh nhật bạn! Mong rằng tuổi mới sẽ mang đến cho bạn vô vàn cơ hội mới, niềm vui mới và những bước tiến vượt bậc trong công việc & cuộc sống.',
  'Chúc bạn một sinh nhật thật ấm áp, ý nghĩa và một tuổi mới bứt phá mọi giới hạn, chinh phục mọi mục tiêu đã đề ra!',
  'Chúc mừng sinh nhật! Cảm ơn bạn đã đồng hành cùng Workflow Calendar. Chúc bạn luôn giữ vững ngọn lửa đam mê và gặt hái nhiều thắng lợi mới!',
  'Tuổi mới - Hành trình mới! Chúc bạn luôn bình an, may mắn, giàu sức khỏe và gặt hái thành công trên mọi chặng đường sắp tới.',
  'Chúc mừng sinh nhật bạn! Chúc mỗi ngày trong tuổi mới của bạn đều là một ngày tràn ngập niềm vui, cảm hứng làm việc và năng lượng tích cực!',
  'Chúc bạn tuổi mới rạng rỡ, làm chủ thời gian, dẫn đầu mục tiêu và đón nhận thật nhiều điều tuyệt vời nhất!',
  'Chúc mừng sinh nhật! Chúc bạn thêm một tuổi mới tài lộc vượng tiến, công danh rộng mở và cuộc sống luôn trọn vẹn niềm vui!',
];

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
  protected readonly wishText = computed(() => {
    if (!this.visible()) return BIRTHDAY_WISHES[0];
    const index = Math.floor(Math.random() * BIRTHDAY_WISHES.length);
    return BIRTHDAY_WISHES[index];
  });

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
