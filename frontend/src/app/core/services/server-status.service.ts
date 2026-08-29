import { Injectable, signal } from '@angular/core';

/**
 * Trạng thái kết nối tới backend của chính app.
 *
 * `waking` = TRUE khi có request đang bị thử lại vì server không phản hồi —
 * thường là lúc backend trên gói Render Free đang "ngủ dậy" (mất 30–50s). UI
 * hiện dải "Đang kết nối..." thay vì màn trống gây hiểu lầm là mất dữ liệu.
 *
 * Đếm tham chiếu: nhiều request cùng fail lúc mở app, chỉ tắt dải khi TẤT CẢ
 * đã xong (thành công hoặc bỏ cuộc).
 */
@Injectable({ providedIn: 'root' })
export class ServerStatusService {
  private inFlight = 0;

  readonly waking = signal(false);

  beginRetry(): void {
    this.inFlight += 1;
    this.waking.set(true);
  }

  endRetry(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    if (this.inFlight === 0) this.waking.set(false);
  }
}
