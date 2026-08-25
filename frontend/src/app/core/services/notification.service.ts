import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { NotificationSoundService } from './notification-sound.service';
import {
  AppNotification,
  NotificationDraft,
  NotificationResponseStatus,
} from './notification.model';

const STORAGE_KEY = 'notifications';

/** Giữ bao nhiêu thông báo là đủ. Thông báo có vòng đời ngắn — đọc xong là hết
 *  giá trị — nên không cần lưu vô hạn, và cắt bớt giúp localStorage không phình
 *  ra theo thời gian. */
const MAX_STORED = 60;

function readStored(): readonly AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // Dữ liệu cũ có thể sai hình dạng sau khi model đổi — lọc thay vì tin
    // tưởng, để một bản ghi hỏng không làm chết cả Notification Center.
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (n): n is AppNotification =>
        !!n && typeof n === 'object' &&
        typeof (n as AppNotification).id === 'string' &&
        typeof (n as AppNotification).type === 'string' &&
        typeof (n as AppNotification).createdAt === 'string',
    );
  } catch {
    // Chế độ riêng tư chặn localStorage, hoặc JSON hỏng — vẫn chạy, chỉ là
    // không nhớ được.
    return [];
  }
}

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
  private readonly sound = inject(NotificationSoundService);

  // Khôi phục từ localStorage thay vì khởi tạo rỗng: trước đây state chỉ nằm
  // trong RAM nên mỗi lần F5 là mất sạch thông báo đã nhận.
  private readonly notificationsState = signal<readonly AppNotification[]>(readStored());

  constructor() {
    // Ghi lại mỗi khi state đổi. Một effect duy nhất ở đây thay vì rải lời gọi
    // lưu vào từng method — thêm method mới sau này không thể quên lưu.
    effect(() => {
      const list = this.notificationsState().slice(0, MAX_STORED);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch {
        // Hết dung lượng hoặc bị chặn — bỏ qua, không để việc lưu làm hỏng UI.
      }
    });
  }

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

    const notification: AppNotification = { ...draft, isRead: false };
    this.notificationsState.update((list) => [notification, ...list]);

    // Âm báo là bước CUỐI và hoàn toàn phụ: state đã cập nhật xong ở trên, nên
    // dù âm thanh lỗi hay bị trình duyệt chặn thì thông báo vẫn hiện bình thường.
    this.sound.notify(notification);
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

  /** Xoá toàn bộ — người dùng chủ động dọn sạch trung tâm thông báo. */
  clearAll(): void {
    this.notificationsState.set([]);
  }
}
