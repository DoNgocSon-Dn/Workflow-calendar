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

export interface BirthdayMeme {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly emojiBadge: string;
  readonly quote: string;
  readonly subQuote: string;
  readonly bgGradient: string;
  readonly accentColor: string;
}

const PARTICLE_EMOJIS = ['🎉', '🎂', '🎈', '✨', '🎁', '⭐', '🎊', '💖', '💸', '🐱', '🕶️', '👑'];

export const BIRTHDAY_MEMES: readonly BirthdayMeme[] = [
  {
    id: 'cat-vibing',
    title: 'Mèo Quẩy Disco 🐱🎧',
    category: 'Sếp Nhỏ Quẩy Banh Nóc',
    emojiBadge: '🕶️ TỔNG TÀI BẬT NHẠC',
    quote: 'Thêm 1 tuổi, bớt 1 phần thơ dại... nhưng tăng 1000% độ ngầu & độ giàu! 🕶️✨',
    subQuote: 'Hôm nay sinh nhật tui, bật nhạc quẩy banh nhà luôn chứ chờ gì nữa! 💃🕺',
    bgGradient: 'linear-gradient(135deg, #18122B 0%, #393053 50%, #635985 100%)',
    accentColor: '#d8b4fe',
  },
  {
    id: 'doggo-party',
    title: 'Chó Bố Đời Party 🐶👑',
    category: 'Vạn Sự Như Ý',
    emojiBadge: '👑 HUYỀN THOẠI TRỞ LẠI',
    quote: 'Chúc mừng sinh nhật Legend! Năm nay KPI x3, Lương x10, Tình duyên x100! 🚀💰',
    subQuote: 'Không cần chúc may mắn nữa, vì bạn chính là may mắn của vũ trụ này rồi!',
    bgGradient: 'linear-gradient(135deg, #2b1055 0%, #7597de 100%)',
    accentColor: '#fde047',
  },
  {
    id: 'money-rain',
    title: 'Mưa Tiền Vô Tận 💸💵',
    category: 'Thần Tài Gõ Cửa',
    emojiBadge: '💸 TIỀN VÀO NHƯ NƯỚC',
    quote: 'Tuổi mới Tiền vào như nước Sông Đà, Tiền ra nhỏ giọt như cà phê phin! ☕💵',
    subQuote: 'Mong bạn tiêu tiền không cần nhìn giá, sống thong dong như tỷ phú!',
    bgGradient: 'linear-gradient(135deg, #051923 0%, #006494 50%, #00a6fb 100%)',
    accentColor: '#4ade80',
  },
  {
    id: 'capybara-chill',
    title: 'Capybara Chill 🍊🦦',
    category: 'An Nhiên Tự Tại',
    emojiBadge: '🍊 CHILL CÙNG CAPYBARA',
    quote: 'Tuổi mới luôn Chill như Capybara - Không drama, chỉ có vui vẻ & giàu sang! 🧘‍♂️🍊',
    subQuote: 'Bình tĩnh đón nhận thành công và tận hưởng từng khoảnh khắc tuyệt đẹp!',
    bgGradient: 'linear-gradient(135deg, #1c1917 0%, #44403c 50%, #78716c 100%)',
    accentColor: '#fb923c',
  },
  {
    id: 'cake-blast',
    title: 'Bánh Kem Siêu Cấp 🎂💥',
    category: 'Tiệc Tùng Rực Rỡ',
    emojiBadge: '🎂 SIÊU TIỆC BIRTHDAY',
    quote: 'Happy Birthday! Sinh nhật này ước gì được nấy, cầu gì được nấy nha! 🎂✨',
    subQuote: 'Ăn hết cái bánh kem này để nhận lại gấp đôi ngọt ngào trong cuộc sống!',
    bgGradient: 'linear-gradient(135deg, #4c0519 0%, #881337 50%, #be123c 100%)',
    accentColor: '#f43f5e',
  },
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
  protected readonly candleBlownOut = signal(false);
  protected readonly wishMade = signal(false);

  protected readonly activeTab = signal<'meme' | 'cake'>('meme');
  protected readonly currentMemeIndex = signal<number>(0);
  protected readonly memeAnimClass = signal<string>('pop-in');

  protected readonly memes = BIRTHDAY_MEMES;
  protected readonly currentMeme = computed(() => this.memes[this.currentMemeIndex()]);

  protected readonly particles = computed<readonly BirthdayParticle[]>(() => buildParticles());

  nextMeme(): void {
    this.memeAnimClass.set('pop-out');
    setTimeout(() => {
      this.currentMemeIndex.update((i) => (i + 1) % this.memes.length);
      this.memeAnimClass.set('pop-in');
    }, 150);
  }

  setTab(tab: 'meme' | 'cake'): void {
    this.activeTab.set(tab);
  }

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
