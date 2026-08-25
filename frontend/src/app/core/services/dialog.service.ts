import { Injectable, signal } from '@angular/core';

export type DialogKind = 'confirm' | 'alert' | 'prompt';

export interface DialogRequest {
  readonly kind: DialogKind;
  readonly message: string;
  readonly title?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  /** Sơn nút xác nhận màu đỏ — dùng cho hành động phá huỷ (xoá...). */
  readonly danger?: boolean;
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

  private open(request: DialogRequest, resolve: (value: unknown) => void): void {
    // Hai lệnh gọi chồng nhau (hiếm, nhưng có thể xảy ra) — huỷ cái cũ với
    // giá trị "từ chối" an toàn thay vì để Promise treo vĩnh viễn.
    this.resolver?.(request.kind === 'confirm' ? false : null);
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
    this.request.set(null);
    resolver?.(value);
  }
}
