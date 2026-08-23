import { Injectable, computed, signal } from '@angular/core';
import { buildDemoNotifications } from './notification-demo-data';
import {
  AppNotification,
  NotificationDraft,
  NotificationResponseStatus,
} from './notification.model';

/**
 * Nguồn dữ liệu tập trung duy nhất cho Notification Center.
 *
 * Service này KHÔNG biết gì về socket. Mọi thông báo thật đi vào đây qua
 * `ingest()`, do `NotificationRealtimeBridge` gọi sau khi dịch sự kiện realtime
 * sang `NotificationDraft`. Nhờ vậy khi đổi transport (Socket.IO → SSE →
 * Supabase Realtime) chỉ phải thay bridge, không đụng service lẫn UI.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  // Dữ liệu demo chỉ là seed ban đầu cho các loại backend chưa phát sự kiện —
  // xoá dòng này là hết sạch dữ liệu giả, phần realtime vẫn chạy nguyên vẹn.
  private readonly notificationsState = signal<readonly AppNotification[]>(buildDemoNotifications());

  /** Mới nhất lên đầu, xếp theo `createdAt` của backend chứ không theo thời
   *  điểm client nhận được event (event realtime có thể tới sai thứ tự). */
  readonly notifications = computed(() =>
    [...this.notificationsState()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );

  readonly latest = computed<AppNotification | null>(() => this.notifications()[0] ?? null);

  readonly unreadCount = computed(() => this.notificationsState().filter((n) => !n.isRead).length);

  readonly unreadBadgeLabel = computed<string | null>(() => {
    const count = this.unreadCount();
    if (count <= 0) return null;
    return count > 99 ? '99+' : String(count);
  });

  /**
   * Điểm vào duy nhất cho thông báo mới. Trả về `false` nếu đã có notification
   * cùng `id` — dedupe dựa trên id ổn định do bridge sinh ra từ sự kiện nguồn,
   * nên socket gửi lại/gửi trùng đều không tạo bản sao.
   */
  ingest(draft: NotificationDraft): boolean {
    if (this.notificationsState().some((n) => n.id === draft.id)) return false;
    this.notificationsState.update((list) => [{ ...draft, isRead: false }, ...list]);
    return true;
  }

  markAsRead(id: string): void {
    this.notificationsState.update((list) =>
      list.map((n) => (n.id === id && !n.isRead ? { ...n, isRead: true } : n)),
    );
  }

  markAllAsRead(): void {
    this.notificationsState.update((list) => list.map((n) => (n.isRead ? n : { ...n, isRead: true })));
  }

  respond(id: string, status: NotificationResponseStatus): void {
    this.notificationsState.update((list) =>
      list.map((n) => (n.id === id ? { ...n, actionStatus: status, isRead: true } : n)),
    );
  }

  /** Dùng khi sự kiện nguồn bị thu hồi (lời mời bị rút lại, task bị xoá...). */
  remove(id: string): void {
    this.notificationsState.update((list) => list.filter((n) => n.id !== id));
  }
}
