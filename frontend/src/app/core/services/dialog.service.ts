import { Injectable, signal } from '@angular/core';

export type DialogKind = 'confirm' | 'alert' | 'prompt' | 'choice';

export interface DialogChoiceOption {
  readonly value: string;
  readonly label: string;
}

export interface DialogRequest {
  readonly kind: DialogKind;
  readonly message: string;
  readonly title?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  /** Sơn nút xác nhận màu đỏ — dùng cho hành động phá huỷ (xoá...). */
  readonly danger?: boolean;
  /** Chỉ dùng khi kind = 'choice' — mỗi lựa chọn hiện thành một nút riêng. */
  readonly options?: readonly DialogChoiceOption[];
}

/**
 * Thay thế window.confirm()/alert()/prompt() bằng dialog vẽ trong giao diện,
 * theo đúng theme sáng/tối của app — popup gốc của trình duyệt xấu, không
 * theo theme, và một số trình duyệt/tiện ích chặn hẳn (đặc biệt window.prompt).
 *
 * Chỉ MỘT dialog hiển thị tại một thời điểm (đúng như hành vi gốc của
 * confirm/alert — chúng chặn luồng thực thi). `<app-dialog-host>` được gắn
 * một lần duy nhất ở app root nên dialog luôn nổi trên MỌI modal khác, bất kể
 * gọi từ component nào.
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  readonly request = signal<DialogRequest | null>(null);
  readonly inputValue = signal('');

  /**
   * Dialog đã trả lời xong nhưng còn đang chạy animation biến mất.
   * Host đọc cờ này để đổi sang animation đóng thay vì gỡ phần tử ngay,
   * vốn khiến dialog "tắt phụt" giữa chừng.
   */
  readonly closing = signal(false);

  /** Khớp thời lượng keyframe đóng trong dialog-host.css. */
  private static readonly EXIT_MS = 140;
  private exitTimer: ReturnType<typeof setTimeout> | null = null;

  private resolver: ((value: unknown) => void) | null = null;

  confirm(
    message: string,
    opts?: { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean },
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.open({ kind: 'confirm', message, ...opts }, resolve as (value: unknown) => void);
    });
  }

  alert(message: string, opts?: { title?: string }): Promise<void> {
    return new Promise<void>((resolve) => {
      this.open({ kind: 'alert', message, ...opts }, () => resolve());
    });
  }

  prompt(message: string, defaultValue = '', opts?: { title?: string }): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      this.inputValue.set(defaultValue);
      this.open({ kind: 'prompt', message, ...opts }, resolve as (value: unknown) => void);
    });
  }

  /** Hộp thoại nhiều lựa chọn (mỗi lựa chọn một nút) — vd phạm vi sửa/xoá một
   *  lần lặp trong chuỗi lặp lại: "Chỉ sự kiện này" / "... và các sự kiện
   *  sau" / "Tất cả sự kiện". Trả về `value` của nút được bấm, hoặc `null`
   *  nếu người dùng huỷ (Esc / bấm ra ngoài). */
  choice(
    message: string,
    options: readonly DialogChoiceOption[],
    opts?: { title?: string },
  ): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      this.open(
        { kind: 'choice', message, options, ...opts },
        resolve as (value: unknown) => void,
      );
    });
  }

  respondChoice(value: string | null): void {
    this.resolve(value);
  }

  private open(request: DialogRequest, resolve: (value: unknown) => void): void {
    // Hai lệnh gọi chồng nhau (hiếm, nhưng có thể xảy ra) — huỷ cái cũ với
    // giá trị "từ chối" an toàn thay vì để Promise treo vĩnh viễn.
    this.resolver?.(request.kind === 'confirm' ? false : null);

    // Dialog mới mở đè lên một dialog đang biến mất: dừng hẹn giờ dọn dẹp,
    // nếu không nó sẽ nổ ít mili giây sau và xoá mất dialog vừa mở.
    if (this.exitTimer) {
      clearTimeout(this.exitTimer);
      this.exitTimer = null;
    }
    this.closing.set(false);

    this.resolver = resolve;
    this.request.set(request);
  }

  respondYes(): void {
    this.resolve(true);
  }

  respondNo(): void {
    this.resolve(false);
  }

  acknowledge(): void {
    this.resolve(undefined);
  }

  submitPrompt(): void {
    const value = this.inputValue().trim();
    this.resolve(value || null);
  }

  cancelPrompt(): void {
    this.resolve(null);
  }

  private resolve(value: unknown): void {
    const resolver = this.resolver;
    this.resolver = null;

    // Trả lời NGAY, rồi mới chạy animation biến mất. Đợi animation xong
    // mới resolve sẽ làm mọi thao tác sau đó trễ thêm — và với luồng huỷ
    // import, ta MUỐN trang bắt đầu đóng chồng lên lúc dialog đang mờ đi,
    // để hai chuyển động nối liền chứ không giật cục.
    resolver?.(value);

    this.closing.set(true);
    this.exitTimer = setTimeout(() => {
      this.exitTimer = null;
      this.closing.set(false);
      this.request.set(null);
    }, DialogService.EXIT_MS);
  }
}
