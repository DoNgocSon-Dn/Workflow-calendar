import { ChangeDetectionStrategy, Component, computed, inject, isDevMode, signal } from '@angular/core';
import { Clock } from '../../../core/clock';

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Nút nổi DEV-ONLY để giả lập "hôm nay" — test hiệu ứng lễ/sinh nhật/deadline
 * mà không phải chờ tới đúng ngày thật, cũng không cần sửa code mỗi lần.
 * Tự ẩn hoàn toàn ở bản production (`isDevMode()`), không phải chỉ ẩn bằng
 * CSS — component không render gì cả nên không lộ ra ngoài devtools của
 * người dùng thật.
 */
@Component({
  selector: 'app-dev-date-panel',
  templateUrl: './dev-date-panel.html',
  styleUrl: './dev-date-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevDatePanel {
  private readonly clock = inject(Clock);

  protected readonly isDev = isDevMode();
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
}
