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
/**
 * Nhắm thẳng vào <app-brand-logo> trong header chứ không phải lớp bọc
 * .brand: lớp bọc là flex item của .left nên hộp của nó có thể cao/rộng hơn
 * chính khối logo, làm tâm lệch đi và hạ cánh không trùng.
 */
const HEADER_LOGO_SELECTOR = 'app-calendar-header .brand app-brand-logo';
const HEADER_BRAND_FALLBACK = 'app-calendar-header .brand';

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

/** Chờ font tối đa bấy nhiêu rồi bay bất kể. Font hỏng hoặc mạng chết thì
 *  thà hạ cánh lệch còn hơn treo overlay vĩnh viễn trước mặt người dùng. */
const FONT_WAIT_MAX_MS = 1200;

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
  /** Font chữ đã tải xong chưa — xem giải thích ở constructor. */
  private readonly fontsReady = signal(false);
  private flown = false;
  private readonly timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    afterNextRender(() => {
      this.at(T.split, () => this.phase.set('split'));
      this.at(T.word, () => this.phase.set('word'));
      this.at(T.flyEarliest, () => this.canFly.set(true));
    });

    /*
     * Chặng bay đo bề rộng chữ "Workflow" để tính tỉ lệ thu nhỏ. Đo trước khi
     * web font về thì đo trúng font dự phòng — bề rộng khác hẳn, tỉ lệ sai, và
     * logo hạ cánh LỆCH khỏi ô header. Đây đúng là loại lỗi lúc có lúc không:
     * font đã nằm trong cache thì đo đúng, lần đầu vào trang thì đo sai.
     */
    const markFontsReady = (): void => this.fontsReady.set(true);
    if (typeof document !== 'undefined' && 'fonts' in document) {
      void document.fonts.ready.then(markFontsReady, markFontsReady);
      this.at(FONT_WAIT_MAX_MS, markFontsReady);
    } else {
      markFontsReady();
    }

    // Bay khi hội đủ BA điều kiện: hết nhịp giữ, dữ liệu sẵn sàng, font đã về.
    effect(() => {
      if (this.canFly() && this.ready() && this.fontsReady() && !this.flown) {
        this.startFly();
      }
    });

    // Giấu logo thật suốt thời gian overlay chạy: chỉ được có MỘT logo trên
    // màn hình tại một thời điểm. Hai bản chồng nhau, dù trùng khít, vẫn làm
    // nét chữ dày lên do khử răng cưa cộng dồn.
    afterNextRender(() => this.setHeaderLogoVisible(false));

    this.destroyRef.onDestroy(() => {
      for (const timer of this.timers) clearTimeout(timer);
      // Lưới an toàn: overlay bị gỡ giữa chừng cũng không được để header
      // mất logo vĩnh viễn.
      this.setHeaderLogoVisible(true);
    });
  }

  /** Bật/tắt logo trong header bằng visibility — giữ nguyên chỗ trong bố cục. */
  private setHeaderLogoVisible(visible: boolean): void {
    const brand = document.querySelector<HTMLElement>(HEADER_BRAND_FALLBACK);
    if (brand) brand.style.visibility = visible ? '' : 'hidden';
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
    this.at(T.flyDuration + T.veilAfterFly, () => {
      // Hiện logo thật rồi mới gỡ overlay, trong cùng một nhịp. Hai bản đang
      // nằm chồng khít nên mắt không thấy khoảnh khắc đổi tay.
      this.setHeaderLogoVisible(true);
      this.finished.emit();
    });
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
    // So khối logo với khối logo, không so lớp bọc với lớp bọc.
    const flying = el.querySelector('app-brand-logo') ?? el;
    const target =
      document.querySelector(HEADER_LOGO_SELECTOR) ??
      document.querySelector(HEADER_BRAND_FALLBACK);

    // Header chưa dựng xong (hiếm): bỏ chặng bay, chỉ mờ dần cho êm.
    if (!target) {
      el.style.opacity = '0';
      return;
    }

    const from = flying.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    if (!from.width || !to.width) {
      el.style.opacity = '0';
      return;
    }

    // Hệ số phóng hiện tại đọc thẳng từ ma trận transform đã tính — chính
    // xác tuyệt đối. Trước đây lấy offsetWidth làm mốc, mà offsetWidth làm
    // tròn tới pixel: lệch chưa tới 1px ở mẫu số cũng đủ làm tỉ lệ sai vài
    // phần nghìn, và sai số đó nhân lên dọc theo chiều dài chữ — nên hai
    // bản logo càng về bên phải càng lệch, nhìn thành chữ đè chữ.
    const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    const currentScale = matrix.a || 1;
    el.style.setProperty('--fly-x', `${to.left + to.width / 2 - (from.left + from.width / 2)}px`);
    el.style.setProperty('--fly-y', `${to.top + to.height / 2 - (from.top + from.height / 2)}px`);
    el.style.setProperty('--fly-scale', `${(currentScale * to.width) / from.width}`);
  }
}
