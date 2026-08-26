import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';

/**
 * Hiện toàn bộ nội dung của một ô/nhãn khi nội dung dài hơn bề rộng nhìn thấy.
 *
 * Dùng cho ô nhập trong bảng, hoặc nhãn/tiêu đề bị cắt bằng
 * `text-overflow: ellipsis` (kết quả tìm kiếm, chip sự kiện...) — nơi phần tử
 * không được phép giãn theo nội dung. Đọc `.value` nếu là ô nhập, còn lại đọc
 * `.textContent`, nên dùng chung được cho cả input lẫn span/button.
 *
 * Ba điểm khiến nó không thể làm bằng thuộc tính `title` sẵn có của trình duyệt:
 *  - `title` không hiện khi focus bằng bàn phím, chỉ hiện khi rê chuột.
 *  - `title` hiện cả khi nội dung ngắn, gây nhiễu.
 *  - `title` không xuống dòng được với nội dung rất dài.
 */
@Directive({
  selector: '[appOverflowTooltip]',
  host: {
    '(mouseenter)': 'show()',
    '(mouseleave)': 'hide()',
    '(focus)': 'show()',
    '(blur)': 'hide()',
    // Gõ thêm chữ có thể khiến nội dung vừa đủ tràn (hoặc hết tràn) — cập nhật
    // lại trong lúc tooltip đang mở thay vì để nó hiện chữ cũ. Vô hại với các
    // phần tử không phải ô nhập: chúng không bao giờ bắn sự kiện 'input'.
    '(input)': 'refresh()',
  },
})
export class OverflowTooltip {
  private readonly host = inject<ElementRef<HTMLElement & { value?: string }>>(ElementRef);
  private tip: HTMLDivElement | null = null;

  /** Ô nhập đọc `.value`; nhãn/tiêu đề (span, button...) đọc `.textContent`. */
  private text(): string {
    const el = this.host.nativeElement;
    return (el.value ?? el.textContent ?? '').trim();
  }

  /** Đủ rộng để đọc thoải mái, đủ hẹp để không che mất cả bảng. */
  private static readonly MAX_WIDTH = 420;
  private static readonly GAP = 6;
  private static readonly MARGIN = 8;
  private static idCounter = 0;

  constructor() {
    // Tooltip sống ở <body>, ngoài tầm quản lý của Angular — component bị huỷ
    // mà không dọn thì nó nằm lại vĩnh viễn trên màn hình.
    inject(DestroyRef).onDestroy(() => this.hide());
  }

  protected show(): void {
    const el = this.host.nativeElement;
    // Chỉ hiện khi nội dung THỰC SỰ bị cắt. So sánh bề rộng nội dung với bề
    // rộng nhìn thấy được — cách duy nhất biết chắc, vì độ dài chuỗi không nói
    // lên điều gì khi font còn co giãn theo chữ.
    if (el.scrollWidth <= el.clientWidth) return;

    const text = this.text();
    if (!text) return;

    if (!this.tip) {
      this.tip = document.createElement('div');
      this.tip.id = `overflow-tip-${++OverflowTooltip.idCounter}`;
      this.tip.setAttribute('role', 'tooltip');
      this.applyStyles(this.tip);
      document.body.appendChild(this.tip);
      // Trình đọc màn hình đọc được nội dung đầy đủ khi ô được focus.
      el.setAttribute('aria-describedby', this.tip.id);

      // Bảng có vùng cuộn riêng; dùng capture để bắt cả cuộn của vùng đó lẫn
      // của trang, rồi bám lại vị trí. Ẩn đi thay vì bám sẽ làm tooltip biến
      // mất ngay lúc bàn phím tab và bảng tự cuộn ô vào tầm nhìn.
      window.addEventListener('scroll', this.reposition, true);
      window.addEventListener('resize', this.reposition);
    }

    this.tip.textContent = text;
    this.reposition();
  }

  protected refresh(): void {
    if (!this.tip) return;
    const el = this.host.nativeElement;
    // Sửa chữ cho ngắn lại thì không còn lý do hiện tooltip nữa.
    const text = this.text();
    if (el.scrollWidth <= el.clientWidth || !text) {
      this.hide();
      return;
    }
    this.tip.textContent = text;
    this.reposition();
  }

  protected hide(): void {
    if (!this.tip) return;
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
    this.host.nativeElement.removeAttribute('aria-describedby');
    this.tip.remove();
    this.tip = null;
  }

  /**
   * Đặt tooltip ngay dưới ô, lật lên trên nếu chạm đáy màn hình và kéo vào
   * trong nếu chạm mép trái/phải.
   *
   * Là arrow function để giữ nguyên `this` khi dùng làm listener và để
   * removeEventListener nhận đúng tham chiếu hàm đã đăng ký.
   */
  private readonly reposition = (): void => {
    const tip = this.tip;
    if (!tip) return;

    const rect = this.host.nativeElement.getBoundingClientRect();
    const { GAP, MARGIN } = OverflowTooltip;
    const tipRect = tip.getBoundingClientRect();

    let top = rect.bottom + GAP;
    // Không đủ chỗ bên dưới thì lật lên trên ô.
    if (top + tipRect.height > window.innerHeight - MARGIN) {
      top = Math.max(MARGIN, rect.top - tipRect.height - GAP);
    }

    let left = rect.left;
    const maxLeft = window.innerWidth - tipRect.width - MARGIN;
    if (left > maxLeft) left = maxLeft;
    if (left < MARGIN) left = MARGIN;

    tip.style.top = `${Math.round(top)}px`;
    tip.style.left = `${Math.round(left)}px`;
  };

  /**
   * Style đặt thẳng bằng JS: tooltip nằm ở <body> nên CSS phạm vi component
   * không với tới nó, còn đặt vào styles.css toàn cục thì tách rời khỏi chính
   * đoạn mã điều khiển nó.
   */
  private applyStyles(tip: HTMLDivElement): void {
    Object.assign(tip.style, {
      position: 'fixed',
      // Trên mọi lớp phủ hiện có trong ứng dụng.
      zIndex: '1000000',
      // Không bao giờ cướp chuột của ô nhập bên dưới.
      pointerEvents: 'none',
      maxWidth: `${OverflowTooltip.MAX_WIDTH}px`,
      // Không có dòng này thì max-width chỉ tính phần chữ, còn padding và
      // viền cộng thêm ra ngoài — tooltip rộng hơn giới hạn đã đặt.
      boxSizing: 'border-box',
      padding: '6px 10px',
      borderRadius: '6px',
      border: '1px solid var(--color-border-strong)',
      background: 'var(--color-surface)',
      color: 'var(--color-text)',
      fontSize: '0.8125rem',
      lineHeight: '1.45',
      boxShadow: 'var(--shadow-popover)',
      // Nội dung rất dài thì xuống dòng, và không để một chuỗi liền (URL) đẩy
      // tooltip rộng quá khổ.
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
    } satisfies Partial<CSSStyleDeclaration>);
  }
}
