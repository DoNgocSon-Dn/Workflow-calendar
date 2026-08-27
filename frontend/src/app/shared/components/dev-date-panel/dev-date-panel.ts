import { ChangeDetectionStrategy, Component, computed, inject, isDevMode, signal } from '@angular/core';
import { Clock } from '../../../core/clock';
import { AuthStore } from '../../../core/auth/auth-store';

/** Đang chạy bản dev (ng serve / build development) — đọc một lần, không đổi
 *  trong suốt phiên. */
const IS_DEV_BUILD = isDevMode();

/** Ngoài bản dev, công cụ giả lập ngày chỉ mở cho các tài khoản này (dùng để
 *  test hiệu ứng lễ / sinh nhật / deadline ngay trên bản đã deploy). */
const DEV_DATE_TOOL_EMAILS = new Set([
  'sondokiri2006@gmail.com',
  'tpken2496@gmail.com',
  'myheroacademiatsh1242@gmail.com',
]);

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
 * Hiện với: bản dev (`isDevMode()`), HOẶC tài khoản trong
 * `DEV_DATE_TOOL_EMAILS` (để dùng được ngay trên bản đã deploy). Ngoài ra
 * component KHÔNG render gì cả (`@if (canUse())`), không phải chỉ ẩn bằng CSS
 * — nên người dùng thường không thấy kể cả khi mở devtools.
 */
@Component({
  selector: 'app-dev-date-panel',
  templateUrl: './dev-date-panel.html',
  styleUrl: './dev-date-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevDatePanel {
  private readonly clock = inject(Clock);
  private readonly authStore = inject(AuthStore);

  /** Panel chỉ hiện khi tài khoản đăng nhập nằm trong danh sách
   *  được cấp quyền (`DEV_DATE_TOOL_EMAILS`). Ngoài trường hợp đó thì
   *  component không render gì. */
  protected readonly canUse = computed(() => {
    const email = this.authStore.user()?.email?.toLowerCase();
    return !!email && DEV_DATE_TOOL_EMAILS.has(email);
  });
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
