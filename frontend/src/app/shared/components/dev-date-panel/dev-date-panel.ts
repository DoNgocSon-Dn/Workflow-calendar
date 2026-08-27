import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Clock } from '../../../core/clock';
import { DevUnlockService } from '../../../core/services/dev-unlock.service';

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
})
export class DevDatePanel {
  private readonly clock = inject(Clock);
  private readonly devUnlock = inject(DevUnlockService);

  protected readonly canUse = computed(() => this.devUnlock.unlocked());
  protected readonly open = signal(false);
  protected readonly draftDate = signal(toDateInputValue(this.clock.now()));

  protected readonly activeOverrideLabel = computed(() => {
    const override = this.clock.devOverride();
    return override ? toDateInputValue(override) : null;
  });

  constructor() {
    // Vừa gõ mã mở khoá xong thì bật panel luôn cho thấy ngay, đỡ phải bấm
    // thêm nút 🛠 một lần nữa.
    effect(() => {
      if (this.devUnlock.unlocked()) this.open.set(true);
    });
  }

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
}
