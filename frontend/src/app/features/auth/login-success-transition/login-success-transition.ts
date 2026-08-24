import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { BrandLogo, BrandLogoPhase } from '../../../shared/components/brand-logo/brand-logo';

/** Logo thật trong header — đích hạ cánh của hiệu ứng. */
const HEADER_BRAND_SELECTOR = 'app-calendar-header .brand';

/**
 * Mốc thời gian (ms) tính từ lúc overlay hiện. Tổng ~4.6s nếu dữ liệu sẵn
 * sàng đúng hẹn, nằm trong khoảng 4–5.5s đã thống nhất.
 */
const T = {
  split: 650,
  word: 1600,
  flyEarliest: 3100,
  flyDuration: 800,
  veilAfterFly: 600,
} as const;

type Phase = 'mark' | 'split' | 'word' | 'fly' | 'out';

@Component({
  selector: 'app-login-success-transition',
  templateUrl: './login-success-transition.html',
  styleUrl: './login-success-transition.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrandLogo],
})
export class LoginSuccessTransition {
  private readonly destroyRef = inject(DestroyRef);
  private readonly logo = viewChild.required<ElementRef<HTMLElement>>('logo');

  /**
   * Trang lịch đã tải xong chưa. Chặng bay về header chỉ khởi động khi cờ này
   * bật — dữ liệu về chậm thì overlay nán lại ở wordmark, đóng luôn vai màn
   * hình chờ, thay vì kéo màn ra để lộ một trang trống.
   */
  readonly ready = input(true);

  /** Phát khi overlay đã xong việc và có thể gỡ khỏi DOM. */
  readonly finished = output<void>();

  protected readonly phase = signal<Phase>('mark');
  protected readonly todayDate = new Date().getDate();

  /** Từ chặng 'fly' trở đi logo giữ nguyên hình dạng đầy đủ. */
  protected readonly logoPhase = computed<BrandLogoPhase>(() => {
    const p = this.phase();
    if (p === 'mark' || p === 'split' || p === 'word') return p;
    return 'word';
  });

  private readonly canFly = signal(false);
  private flown = false;
  private readonly timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    afterNextRender(() => {
      this.at(T.split, () => this.phase.set('split'));
      this.at(T.word, () => this.phase.set('word'));
      this.at(T.flyEarliest, () => this.canFly.set(true));
    });

    // Bay khi hội đủ hai điều kiện: hết thời gian giữ nhịp VÀ dữ liệu sẵn sàng.
    effect(() => {
      if (this.canFly() && this.ready() && !this.flown) {
        this.startFly();
      }
    });

    this.destroyRef.onDestroy(() => {
      for (const timer of this.timers) clearTimeout(timer);
    });
  }

  private at(delay: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, delay));
  }

  private startFly(): void {
    this.flown = true;
    this.measureAndFly();
    this.phase.set('fly');
    // Bay xong thì kéo màn, màn tan xong mới gỡ overlay.
    this.at(T.flyDuration, () => this.phase.set('out'));
    this.at(T.flyDuration + T.veilAfterFly, () => this.finished.emit());
  }

  /**
   * FLIP: đo logo thật trong header rồi dịch/thu khối bay về đúng ô đó. Đo tại
   * thời điểm bay nên tự đúng ở mọi cỡ màn hình, không phụ thuộc toạ độ cứng.
   *
   * Khối bay dùng `left:50%; top:50%` + `translate(-50%,-50%) … scale(k)` với
   * transform-origin là tâm, nên tâm nó luôn trùng tâm màn hình bất kể k. Chèn
   * thêm translate(dx,dy) vào giữa chuỗi thì tâm dời đúng (dx,dy) pixel màn
   * hình — phần scale phía sau không nhân vào quãng dời này.
   */
  private measureAndFly(): void {
    const el = this.logo().nativeElement;
    const target = document.querySelector(HEADER_BRAND_SELECTOR);

    // Header chưa dựng xong (hiếm): bỏ chặng bay, chỉ mờ dần cho êm.
    if (!target) {
      el.style.opacity = '0';
      return;
    }

    const from = el.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    if (!from.width || !to.width) {
      el.style.opacity = '0';
      return;
    }

    // Tỉ lệ đích tính từ offsetWidth — bề rộng LAYOUT, chưa bị transform
    // nhân vào. Bản trước đọc biến --scale bằng getPropertyValue rồi
    // parseFloat: với custom property chưa đăng ký, hàm đó trả về nguyên
    // chuỗi token chứ không phải số đã tính, nên luôn ra NaN rồi rơi về 1
    // — logo hạ cánh sai cỡ so với logo thật trong header.
    const naturalWidth = el.offsetWidth;
    if (!naturalWidth) {
      el.style.opacity = '0';
      return;
    }
    el.style.setProperty('--fly-x', `${to.left + to.width / 2 - (from.left + from.width / 2)}px`);
    el.style.setProperty('--fly-y', `${to.top + to.height / 2 - (from.top + from.height / 2)}px`);
    el.style.setProperty('--fly-scale', `${to.width / naturalWidth}`);
  }
}
