import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthStore } from '../auth/auth-store';
import { NotificationSoundService } from './notification-sound.service';
import { desktopBridge } from '../desktop/desktop-bridge';
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

function readStored(userId: string | null): readonly AppNotification[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${userId}`);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // Dữ liệu cũ có thể sai hình dạng sau khi model đổi — lọc thay vì tin
    // tưởng, để một bản ghi hỏng không làm chết cả Notification Center.
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (n): n is AppNotification =>
        !!n &&
        typeof n === 'object' &&
        typeof (n as AppNotification).id === 'string' &&
        typeof (n as AppNotification).type === 'string' &&
        typeof (n as AppNotification).title === 'string' &&
        typeof (n as AppNotification).message === 'string' &&
        typeof (n as AppNotification).createdAt === 'string',
    ).slice(0, MAX_STORED);
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
  private readonly authStore = inject(AuthStore);
  private accountId = this.authStore.user()?.id ?? null;
  private readonly notificationsState = signal<readonly AppNotification[]>(readStored(this.accountId));

  // A computed view hides the previous owner's data immediately, even before
  // the auth-change effect gets its next turn.
  private readonly currentNotifications = computed(() => {
    const userId = this.authStore.user()?.id ?? null;
    return userId === this.accountId ? this.notificationsState() : readStored(userId);
  });

  constructor() {
    effect(() => {
      const userId = this.authStore.user()?.id ?? null;
      untracked(() => this.activateAccount(userId));
    });
  }

  private activateAccount(userId = this.authStore.user()?.id ?? null): void {
    if (userId === this.accountId) return;
    this.accountId = userId;
    this.notificationsState.set(readStored(userId));
    void desktopBridge()?.clearNotifications().catch(() => undefined);
  }

  private updateNotifications(update: (list: readonly AppNotification[]) => readonly AppNotification[]): void {
    this.activateAccount();
    if (!this.accountId) return;
    const next = update(this.notificationsState()).slice(0, MAX_STORED);
    this.notificationsState.set(next);
    // Persist under the captured owner synchronously, so an immediate account
    // switch cannot save one user's list into another user's key.
    try { localStorage.setItem(`${STORAGE_KEY}:${this.accountId}`, JSON.stringify(next)); }
    catch { /* The in-memory notification center still works without storage. */ }
  }

  /** Mới nhất lên đầu, xếp theo `createdAt` của backend chứ không theo thời
   *  điểm client nhận được event (event realtime có thể tới sai thứ tự). */
  readonly notifications = computed(() =>
    [...this.currentNotifications()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );

  readonly latest = computed<AppNotification | null>(() => this.notifications()[0] ?? null);

  // Lời mời chia sẻ lịch ("calendar-invite-*") có nguồn đếm RIÊNG
  // (CalendarStore.pendingInvites, cộng thêm ở notification-button.ts) — loại
  // chúng khỏi đây để khớp với danh sách đã hiển thị (NotificationPanel.filtered()
  // cũng loại trừ đúng tiền tố này) và để badge không đếm trùng một lời mời hai lần.
  readonly unreadCount = computed(
    () =>
      this.currentNotifications().filter((n) => !n.isRead && !n.id.startsWith('calendar-invite-'))
        .length,
  );

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
    this.activateAccount();
    if (!this.accountId || this.notificationsState().some((n) => n.id === draft.id)) return false;

    const notification: AppNotification = { ...draft, isRead: false };
    this.updateNotifications((list) => [notification, ...list]);

    // Âm báo là bước CUỐI và hoàn toàn phụ: state đã cập nhật xong ở trên, nên
    // dù âm thanh lỗi hay bị trình duyệt chặn thì thông báo vẫn hiện bình thường.
    const desktop = desktopBridge();
    if (desktop) {
      const eventTypes = ['reminder', 'event_invitation', 'event_update', 'conflict'];
      void desktop
        .notify({
          id: notification.id,
          title: notification.title,
          body: notification.message,
          kind: notification.type,
          sound: this.sound.enabled(),
          eventId: eventTypes.includes(notification.type) ? notification.relatedId : undefined,
          groupId: notification.messageMeta?.groupId ?? notification.metadata?.['groupId'],
          messageId: notification.messageMeta?.messageId,
          peerId: notification.metadata?.['directPeerId'],
        })
        .catch(() => undefined);
    } else {
      this.sound.notify(notification);
    }
    return true;
  }

  markAsRead(id: string): void {
    this.updateNotifications((list) =>
      list.map((n) => (n.id === id && !n.isRead ? { ...n, isRead: true } : n)),
    );
  }

  markAllAsRead(): void {
    this.updateNotifications((list) =>
      list.map((n) => (n.isRead ? n : { ...n, isRead: true })),
    );
  }

  respond(id: string, status: NotificationResponseStatus): void {
    this.updateNotifications((list) =>
      list.map((n) => (n.id === id ? { ...n, actionStatus: status, isRead: true } : n)),
    );
  }

  /** Dùng khi sự kiện nguồn bị thu hồi (lời mời bị rút lại, task bị xoá...). */
  remove(id: string): void {
    this.updateNotifications((list) => list.filter((n) => n.id !== id));
  }

  /** Xoá toàn bộ — người dùng chủ động dọn sạch trung tâm thông báo. */
  clearAll(): void {
    this.updateNotifications(() => []);
  }
}
