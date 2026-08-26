import { DestroyRef, Directive, ElementRef, NgZone, inject } from '@angular/core';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Ghi hai CSS custom property `--holiday-px`/`--holiday-py` (-1..1, có kẹp
 * biên) lên host theo vị trí con trỏ so với khung nhìn của nó — các lớp
 * nền/giữa/tiền cảnh bên trong scene 1/5, 2/9 tự nhân với độ sâu riêng qua
 * `transform: translate(calc(var(--holiday-px) * <depth>), ...)`, directive
 * này không biết gì về nội dung scene, chỉ phát toạ độ.
 *
 * Lắng nghe ở `window`, KHÔNG phải ở chính host: host (`.holiday-backdrop`)
 * bắt buộc `pointer-events: none` (spec §VI — decoration không được chặn
 * click/hover của lịch thật phía trên), mà phần tử `pointer-events: none`
 * không bao giờ nhận được sự kiện con trỏ của chính nó — gắn listener trực
 * tiếp lên host sẽ không bao giờ bắn.
 *
 * Không gắn listener nào khi chuột không phải loại "fine" (cảm ứng/mobile)
 * hoặc khi `prefers-reduced-motion` bật — đúng yêu cầu spec "mobile: tắt
 * mouse parallax" và "reduced motion: tắt mouse parallax" trong cùng một chỗ,
 * thay vì lắng nghe rồi bỏ qua giá trị (tốn CPU vô ích trên di động).
 *
 * Chạy ngoài NgZone + rAF-throttle: đây là style thuần (transform), không có
 * gì cần Angular change detection chạy lại trên từng pixel di chuột.
 */
@Directive({
  selector: '[appHolidayParallax]',
})
export class HolidayParallax {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);

  private rafId: number | null = null;
  private pendingX = 0;
  private pendingY = 0;

  constructor() {
    const canParallax =
      typeof window !== 'undefined' &&
      window.matchMedia('(pointer: fine)').matches &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!canParallax) return;

    const destroyRef = inject(DestroyRef);

    this.zone.runOutsideAngular(() => {
      window.addEventListener('pointermove', this.onPointerMove, { passive: true });

      destroyRef.onDestroy(() => {
        window.removeEventListener('pointermove', this.onPointerMove);
        if (this.rafId !== null) cancelAnimationFrame(this.rafId);
      });
    });
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    const rect = this.host.nativeElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    // Kẹp biên [-1,1]: con trỏ ở ngoài khung (vẫn còn trong window) dừng lại
    // ở mức lệch tối đa thay vì lệch không giới hạn.
    this.pendingX = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    this.pendingY = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
    this.schedule();
  };

  private schedule(): void {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      const style = this.host.nativeElement.style;
      style.setProperty('--holiday-px', this.pendingX.toFixed(3));
      style.setProperty('--holiday-py', this.pendingY.toFixed(3));
    });
  }
}
