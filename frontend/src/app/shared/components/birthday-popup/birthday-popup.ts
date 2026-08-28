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

export interface BirthdayGifItem {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly badge: string;
}

const PARTICLE_EMOJIS = ['🎉', '🎂', '🎈', '✨', '🎁', '⭐', '🎊', '💖', '💸', '🌟', '🥳', '👑'];

export const BIRTHDAY_GIFS: readonly BirthdayGifItem[] = [
  { id: 'gif-36', url: 'assets/birthday-gifs/gif-36.gif', title: 'Bánh Kem Pháo Hoa 🎂✨', badge: '🎂 HAPPY BIRTHDAY' },
  { id: 'gif-3', url: 'assets/birthday-gifs/gif-3.gif', title: 'Bữa Tiệc Rực Rỡ 🎉🌟', badge: '🎉 PARTY TIME' },
  { id: 'gif-5', url: 'assets/birthday-gifs/gif-5.gif', title: 'Khung Cảnh Tràn Năng Lượng ⚡💖', badge: '💖 WISH YOU ALL THE BEST' },
  { id: 'gif-7', url: 'assets/birthday-gifs/gif-7.gif', title: 'Hào Quang Tuổi Mới ✨👑', badge: '👑 SHINE LIKE A STAR' },
  { id: 'gif-31', url: 'assets/birthday-gifs/gif-31.gif', title: 'Sinh Nhật Ngọt Ngào 🍓🎁', badge: '🎁 SPECIAL DAY' },
  { id: 'gif-40', url: 'assets/birthday-gifs/gif-40.gif', title: 'Quẩy Banh Nóc 🎈🥳', badge: '🥳 CELEBRATE TODAY' },
];

export const BIRTHDAY_WISHES: readonly string[] = [
  'Workflow Calendar chúc bạn một tuổi mới tràn đầy năng lượng, sức khỏe dồi dào, hạnh phúc và gặt hái thật nhiều thành công rực rỡ!',
  'Chúc mừng sinh nhật bạn! Mong rằng tuổi mới sẽ mang đến cho bạn vô vàn cơ hội mới, niềm vui mới và những bước tiến vượt bậc trong công việc & cuộc sống.',
  'Chúc bạn một sinh nhật thật ấm áp, ý nghĩa và một tuổi mới bứt phá mọi giới hạn, chinh phục mọi mục tiêu đã đề ra!',
  'Chúc mừng sinh nhật! Cảm ơn bạn đã đồng hành cùng Workflow Calendar. Chúc bạn luôn giữ vững ngọn lửa đam mê và gặt hái nhiều thắng lợi mới!',
  'Tuổi mới - Hành trình mới! Chúc bạn luôn bình an, may mắn, giàu sức khỏe và gặt hái thành công trên mọi chặng đường sắp tới.',
  'Chúc mừng sinh nhật bạn! Chúc mỗi ngày trong tuổi mới của bạn đều là một ngày tràn ngập niềm vui, cảm hứng làm việc và năng lượng tích cực!',
  'Chúc bạn tuổi mới rạng rỡ, làm chủ thời gian, dẫn đầu mục tiêu và đón nhận thật nhiều điều tuyệt vời nhất!',
  'Chúc mừng sinh nhật! Chúc bạn thêm một tuổi mới tài lộc vượng tiến, công danh rộng mở và cuộc sống luôn trọn vẹn niềm vui!',
  'Thêm 1 tuổi mới, bớt 1 phần âu lo! Chúc bạn luôn trẻ trung, nhiều tiền và tràn ngập tiếng cười mỗi ngày!',
  'Happy Birthday! Chúc ước mơ của bạn hôm nay sẽ biến thành hiện thực trong tuổi mới!',
];

function buildParticles(): readonly BirthdayParticle[] {
  return Array.from({ length: 28 }, (_, i) => ({
    emoji: PARTICLE_EMOJIS[i % PARTICLE_EMOJIS.length],
    leftPercent: (i * 137.5) % 100,
    delaySeconds: (i % 6) * 0.35,
    durationSeconds: 5 + (i % 4),
    sizePx: 18 + (i % 5) * 4,
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
  protected readonly wishMade = signal(false);

  protected readonly currentGifIndex = signal<number>(Math.floor(Math.random() * BIRTHDAY_GIFS.length));
  protected readonly currentWishIndex = signal<number>(Math.floor(Math.random() * BIRTHDAY_WISHES.length));
  protected readonly stageAnimClass = signal<string>('pop-in');

  protected readonly gifs = BIRTHDAY_GIFS;
  protected readonly currentGif = computed(() => this.gifs[this.currentGifIndex()]);
  protected readonly currentWish = computed(() => BIRTHDAY_WISHES[this.currentWishIndex()]);

  protected readonly particles = computed<readonly BirthdayParticle[]>(() => buildParticles());

  nextRandomGifAndWish(): void {
    this.stageAnimClass.set('pop-out');
    setTimeout(() => {
      let nextGifIdx = Math.floor(Math.random() * BIRTHDAY_GIFS.length);
      if (nextGifIdx === this.currentGifIndex() && BIRTHDAY_GIFS.length > 1) {
        nextGifIdx = (nextGifIdx + 1) % BIRTHDAY_GIFS.length;
      }
      let nextWishIdx = Math.floor(Math.random() * BIRTHDAY_WISHES.length);
      if (nextWishIdx === this.currentWishIndex() && BIRTHDAY_WISHES.length > 1) {
        nextWishIdx = (nextWishIdx + 1) % BIRTHDAY_WISHES.length;
      }

      this.currentGifIndex.set(nextGifIdx);
      this.currentWishIndex.set(nextWishIdx);
      this.stageAnimClass.set('pop-in');
    }, 150);
  }

  makeWish(): void {
    this.wishMade.set(true);
  }

  close(): void {
    if (this.closing()) return;
    this.closing.set(true);
    setTimeout(() => {
      this.popupService.dismiss();
      this.closing.set(false);
      this.wishMade.set(false);
    }, 280);
  }

  dontShowAgain(): void {
    if (this.closing()) return;
    this.popupService.disableForCurrentYear();
    this.close();
  }

  onEscape(): void {
    if (this.visible()) this.close();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }
}
