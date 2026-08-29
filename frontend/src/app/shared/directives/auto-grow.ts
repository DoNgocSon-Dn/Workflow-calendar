import { AfterViewInit, Directive, ElementRef, inject } from '@angular/core';

/**
 * `<textarea appAutoGrow>` — ô tự cao dần theo nội dung (không phải kéo góc),
 * bị chặn bởi `max-height` trong CSS (phần dư thì cuộn).
 *
 * Chạy khi gõ VÀ một nhịp sau khi khởi tạo — để mô tả nạp sẵn (sự kiện import,
 * mở lại để sửa) cũng hiện đủ chiều cao ngay, không bị "gò" trong 3 dòng.
 */
@Directive({
  selector: 'textarea[appAutoGrow]',
  host: {
    '(input)': 'grow()',
    style: 'overflow-y: auto',
  },
})
export class AutoGrow implements AfterViewInit {
  private readonly el = inject<ElementRef<HTMLTextAreaElement>>(ElementRef);

  ngAfterViewInit(): void {
    // formControl gán value ở microtask kế tiếp — đo sau khi đã có nội dung.
    queueMicrotask(() => this.grow());
  }

  protected grow(): void {
    const ta = this.el.nativeElement;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }
}
