import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  input,
} from '@angular/core';

/**
 * Các chặng dựng logo. `idle` là trạng thái tĩnh dùng ở header và trang đăng
 * nhập; ba chặng còn lại chỉ do LoginSuccessTransition điều khiển.
 */
export type BrandLogoPhase = 'idle' | 'mark' | 'split' | 'word';

/**
 * Logo Workflow dùng chung cho header, trang đăng nhập và hiệu ứng chuyển
 * cảnh sau đăng nhập — một nguồn duy nhất, không có bản sao riêng để chạy
 * animation.
 *
 * Chính tả luôn là "Workflow": W hoa đầu, w thường cuối. Ở chặng `split` chữ
 * cuối tạm mượn glyph hoa cho cân đối, rồi crossfade về thường ở chặng `word`.
 */
@Component({
  selector: 'app-brand-logo',
  templateUrl: './brand-logo.html',
  styleUrl: './brand-logo.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandLogo {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly phase = input<BrandLogoPhase>('idle');
  /** Số ngày hiện trên icon lịch. Bỏ trống thì icon để trống. */
  readonly dayNumber = input<number | null>(null);

  protected readonly middle = ['o', 'r', 'k', 'f', 'l', 'o'];

  constructor() {
    // Chỉ đo khi thật sự cần chạy animation. Ở header/login (idle) mọi thứ
    // dùng bề rộng tự nhiên nên không tốn gì.
    afterNextRender(() => {
      if (this.phase() !== 'idle') this.measure();
    });
  }

  /**
   * Đo bề rộng tự nhiên của từng chữ rồi ghim vào biến CSS.
   *
   * Cần thiết vì animation phải chạy `width: 0 → bề rộng thật`, mà
   * `width: auto` thì trình duyệt không transition được — để nguyên sẽ thành
   * chữ bật ra từng nấc và đẩy cả logo nhảy ngang.
   */
  private measure(): void {
    const root = this.host.nativeElement;

    for (const letter of Array.from(root.querySelectorAll<HTMLElement>('.bl-l'))) {
      // Inline style thắng rule trong stylesheet, nên tạm mở khoá để đo.
      letter.style.width = 'auto';
      // offsetWidth chứ không phải getBoundingClientRect: khối logo đang bị
      // scale lên nhiều lần, rect sẽ trả về số đã nhân.
      const natural = letter.offsetWidth;
      letter.style.width = '';
      letter.style.setProperty('--w', `${natural}px`);
    }

    // Hai glyph của chữ cuối chồng tuyệt đối lên nhau nên ô chứa không tự có
    // bề rộng — phải đo riêng từng cái để chặng đổi case giãn ô cho khớp.
    const up = root.querySelector<HTMLElement>('.bl-up');
    const low = root.querySelector<HTMLElement>('.bl-low');
    const last = root.querySelector<HTMLElement>('.bl-last');
    if (up && low && last) {
      last.style.setProperty('--w-up', `${up.offsetWidth}px`);
      last.style.setProperty('--w-low', `${low.offsetWidth}px`);
    }
  }
}
