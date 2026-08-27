import { Injectable, signal } from '@angular/core';

/** Gõ liền dãy này ở BẤT KỲ đâu trên trang (ngoài ô nhập chữ thật) để mở khoá
 *  các công cụ dev ẩn — chỉ trong PHIÊN NÀY, không nhớ qua lần tải trang sau,
 *  không tự hiện theo tài khoản hay theo bản dev. */
const UNLOCK_SEQUENCE = '@@@@';

/**
 * Cơ chế mở khoá dùng CHUNG cho mọi nút/công cụ chỉ dành cho dev (panel giả
 * lập "hôm nay", nút xem thử popup sinh nhật...) — gõ đúng mã một lần thì mọi
 * nơi đang gate theo `unlocked()` đều hiện ra cùng lúc, không cần gõ lại cho
 * từng cái. `providedIn: 'root'` nên chỉ một listener duy nhất cho cả app,
 * sống suốt vòng đời trang (không cần gỡ khi service là singleton).
 */
@Injectable({ providedIn: 'root' })
export class DevUnlockService {
  private readonly _unlocked = signal(false);
  readonly unlocked = this._unlocked.asReadonly();

  /** Vài ký tự gõ gần nhất — so khớp đuôi với UNLOCK_SEQUENCE mỗi lần gõ,
   *  không cần biết trước lúc nào người dùng "bắt đầu" gõ mã. */
  private keyBuffer = '';

  constructor() {
    document.addEventListener('keydown', (event) => this.onGlobalKeydown(event));
  }

  private onGlobalKeydown(event: KeyboardEvent): void {
    if (this._unlocked()) return;

    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;

    this.keyBuffer = (this.keyBuffer + event.key).slice(-UNLOCK_SEQUENCE.length);
    if (this.keyBuffer !== UNLOCK_SEQUENCE) return;

    this._unlocked.set(true);
  }
}
