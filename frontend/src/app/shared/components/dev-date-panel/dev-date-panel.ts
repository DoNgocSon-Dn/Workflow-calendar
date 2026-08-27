import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Clock } from '../../../core/clock';

/** Gõ liền dãy này ở BẤT KỲ đâu (ngoài ô nhập chữ) thì mở khoá panel trong
 *  PHIÊN NÀY — không nhớ qua lần tải trang sau, không tự hiện theo tài khoản
 *  hay theo bản dev nữa. Mặc định ẩn tuyệt đối, gõ lại từ đầu mỗi lần cần. */
const UNLOCK_SEQUENCE = '@@@@';

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Nút nổi để giả lập "hôm nay" — test hiệu ứng lễ/sinh nhật/deadline mà không
 * phải chờ tới đúng ngày thật, cũng không cần sửa code mỗi lần.
 *
 * Mặc định ẩn tuyệt đối, kể cả với bản dev hay tài khoản của người phát
 * triển — chỉ hiện SAU KHI gõ đúng dãy `UNLOCK_SEQUENCE` ("@@@@") ở đâu đó
 * trên trang trong phiên đang mở, và ẩn lại ngay khi tải lại trang (không
 * lưu localStorage). Component KHÔNG render gì cả khi chưa mở khoá
 * (`@if (canUse())`), không phải chỉ ẩn bằng CSS — nên kể cả mở devtools soi
 * DOM cũng không thấy dấu vết.
 */
@Component({
  selector: 'app-dev-date-panel',
  templateUrl: './dev-date-panel.html',
  styleUrl: './dev-date-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onGlobalKeydown($event)',
  },
})
export class DevDatePanel {
  private readonly clock = inject(Clock);

  private readonly secretUnlocked = signal(false);
  /** Vài ký tự gõ gần nhất — so khớp đuôi với UNLOCK_SEQUENCE mỗi lần gõ,
   *  không cần biết trước lúc nào người dùng "bắt đầu" gõ mã. */
  private keyBuffer = '';

  protected readonly canUse = computed(() => this.secretUnlocked());
  protected readonly open = signal(false);
  protected readonly draftDate = signal(toDateInputValue(this.clock.now()));

  protected readonly activeOverrideLabel = computed(() => {
    const override = this.clock.devOverride();
    return override ? toDateInputValue(override) : null;
  });

  toggleOpen(): void {
    this.open.update((v) => !v);
  }

  onDraftChange(value: string): void {
    this.draftDate.set(value);
  }

  apply(): void {
    const value = this.draftDate();
    if (!value) return;
    const [y, m, d] = value.split('-').map(Number);
    this.clock.setDevOverride(new Date(y, m - 1, d));
  }

  reset(): void {
    this.clock.setDevOverride(null);
  }

  /** Gõ "@@@@" ở BẤT KỲ đâu trên trang (kể cả không focus vào panel) thì mở
   *  khoá panel. Bỏ qua khi đang gõ trong ô nhập chữ thật — người dùng có thể
   *  vô tình gõ liền mấy dấu @ khi đang soạn email/ghi chú, không nên bị hiểu
   *  nhầm thành mã bí mật. */
  protected onGlobalKeydown(event: KeyboardEvent): void {
    if (this.secretUnlocked()) return;

    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;

    this.keyBuffer = (this.keyBuffer + event.key).slice(-UNLOCK_SEQUENCE.length);
    if (this.keyBuffer !== UNLOCK_SEQUENCE) return;

    this.secretUnlocked.set(true);
    this.open.set(true);
  }
}
