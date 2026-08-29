import { Injectable, computed, signal } from '@angular/core';

export type NotificationKind =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'reminder'
  | 'invite'
  | 'decision'
  | 'success'
  | 'conflict'
  | 'message';

/**
 * Ranh giới giữa hai hệ thống thông báo (yêu cầu "tách luồng"):
 *
 * - **Quả chuông** (`NotificationService.ingest`) = NHẬT KÝ HOẠT ĐỘNG. Mọi việc
 *   "chỉ để biết" đi vào đây: có người nhắn tin, ai đó đổi trạng thái / xoá /
 *   được giao một công việc, thành viên mới vào nhóm. Không tự bật popup.
 * - **Popup** (`NotificationQueue`) = việc CẦN CHÚ Ý NGAY:
 *     · `kind: 'reminder'` — nhắc trước / tới giờ họp.
 *     · `kind: 'invite'` / `kind: 'decision'` — cần một quyết định (nhận/từ chối
 *       lời mời sự kiện, DUYỆT yêu cầu vào nhóm). Kèm nút hành động, KHÔNG tự tắt
 *       (bỏ thanh đếm giờ trong `notification-popup.html`).
 *
 * Một việc "cần quyết định" vẫn ingest vào chuông song song để có bản lưu vết.
 */
export interface NotificationItem {
  id: string;
  eventId?: string;
  groupId?: string;
  messageId?: string;
  /** Chỉ với `kind: 'decision'` — yêu cầu tham gia nhóm cần duyệt. */
  requestId?: string;
  title: string;
  body: string;
  kind: NotificationKind;
  reminderId?: string;
  meetLink?: string;
}

const SNOOZE_MS = 5 * 60 * 1000;
/** Import/tạo hàng loạt bắn về nhiều "Sự kiện mới" gần như cùng lúc — 2 làm
 *  người dùng tưởng nhầm là các thông báo còn lại bị mất, trong khi chúng chỉ
 *  đang xếp hàng chờ (7s/toast thì vài chục sự kiện phải đợi rất lâu mới thấy
 *  hết). Nâng lên 4 để một đợt import vẫn thấy rõ nhiều toast xếp chồng ngay,
 *  không phải chờ toast trước tự tắt mới thấy cái tiếp theo. */
/** Chỉ hiển thị duy nhất 1 popup thông báo tại một thời điểm theo yêu cầu giao diện. */
const MAX_VISIBLE = 1;

@Injectable({ providedIn: 'root' })
export class NotificationQueue {
  readonly queue = signal<NotificationItem[]>([]);
  readonly visible = computed(() => this.queue().slice(0, MAX_VISIBLE));

  /** Nếu 1 reminder có reminderId (đến từ backend), gọi API snooze thật thay
   * vì chỉ hẹn giờ lại cục bộ — set bởi CalendarStore để tránh phụ thuộc
   * vòng (store phụ thuộc queue, không phải ngược lại). */
  onSnoozeReminder: ((reminderId: string, minutes: number) => void) | null = null;

  /** Popup "cần quyết định" (duyệt yêu cầu vào nhóm...). Không tự tắt — người
   *  dùng phải bấm Đồng ý / Từ chối / Bỏ qua. `id` ổn định nên nhận lại event
   *  realtime nhiều lần không nhân đôi. */
  pushDecision(item: {
    id: string;
    title: string;
    body: string;
    groupId?: string;
    requestId?: string;
  }): void {
    this.push({ ...item, kind: 'decision' });
  }

  push(item: Omit<NotificationItem, 'id'> & { id?: string }): void {
    const full: NotificationItem = { ...item, id: item.id ?? crypto.randomUUID() };
    this.queue.update((list) => {
      // 1. Khai trùng ID
      if (list.some((n) => n.id === full.id)) return list;

      // 2. Khai trùng nội dung (tiêu đề + thông điệp y hệt)
      if (list.some((n) => n.title === full.title && n.body === full.body)) return list;

      // 3. Khai trùng loại thông báo theo cùng một sự kiện (trùng lịch, nhắc lịch...)
      if (full.eventId && full.kind && list.some((n) => n.eventId === full.eventId && n.kind === full.kind)) {
        return list;
      }

      return [...list, full];
    });
    this.notifyBrowserIfHidden(full);
  }

  dismiss(id: string): void {
    this.queue.update((list) => list.filter((n) => n.id !== id));
  }

  /** `minutes` để trống thì dùng mặc định 5 phút — giữ nguyên hành vi của mọi
   *  lời gọi cũ, đồng thời cho UI chọn 10/30/60 phút. */
  snooze(id: string, minutes?: number): void {
    const item = this.queue().find((n) => n.id === id);
    this.dismiss(id);
    if (!item) return;

    const delayMs = minutes ? minutes * 60_000 : SNOOZE_MS;

    if (item.reminderId && this.onSnoozeReminder) {
      this.onSnoozeReminder(item.reminderId, delayMs / 60_000);
      return;
    }

    setTimeout(() => {
      this.push({
        eventId: item.eventId,
        title: item.title,
        body: item.body,
        kind: item.kind,
        meetLink: item.meetLink,
      });
    }, delayMs);
  }

  requestPermission(): void {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }

  private notifyBrowserIfHidden(item: NotificationItem): void {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    if (!document.hidden) return;
    new Notification(item.title, { body: item.body });
  }
}
