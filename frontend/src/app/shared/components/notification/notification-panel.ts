import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NotificationService } from '../../../core/services/notification.service';
import {
  AppNotification,
  NotificationRespondPayload,
  notificationCategory,
} from '../../../core/services/notification.model';
import { NotificationItem } from './notification-item';
import { GroupStore } from '../../../features/groups/data/group-store';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { CalendarStore } from '../../../features/calendar/data/calendar-store';

type NotificationTabId = 'all' | 'unread' | 'message' | 'task' | 'event' | 'group';

const TABS: readonly { id: NotificationTabId; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'unread', label: 'Chưa đọc' },
  { id: 'message', label: 'Tin nhắn' },
  { id: 'task', label: 'Công việc' },
  { id: 'event', label: 'Sự kiện' },
  { id: 'group', label: 'Nhóm' },
];

const EVENT_RELATED_TYPES = new Set<AppNotification['type']>(['event_invitation', 'event_update', 'reminder']);

/** Dưới ngưỡng này coi như người dùng vẫn đang ở đầu danh sách. */
interface NotificationSection {
  readonly key: string;
  readonly label: string;
  readonly items: readonly AppNotification[];
}

const SCROLL_TOP_THRESHOLD_PX = 24;

/** Yêu cầu mở workspace nhóm; có `messageId` nghĩa là mở thẳng tab Trò chuyện
 *  và cuộn tới đúng tin nhắn đó. */
export interface OpenGroupChatRequest {
  readonly groupId: string;
  readonly messageId?: string;
}

@Component({
  selector: 'app-notification-panel',
  templateUrl: './notification-panel.html',
  styleUrl: './notification-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NotificationItem],
})
export class NotificationPanel {
  private readonly service = inject(NotificationService);
  private readonly realtime = inject(RealtimeService);

  /** Real-time còn sống không — mất kết nối thì báo rõ, thay vì để danh sách
   *  đứng im và người dùng tưởng là không có gì mới. */
  protected readonly realtimeOffline = this.realtime.disconnected;
  private readonly groupStore = inject(GroupStore);
  protected readonly calendarStore = inject(CalendarStore);

  /** Id thông báo đang gọi API — chặn double-click và bật trạng thái loading. */
  protected readonly respondingId = signal<string | null>(null);
  protected readonly respondError = signal<string | null>(null);

  /** Lời mời chia sẻ lịch — nguồn dữ liệu riêng của CalendarStore (không đi
   *  qua NotificationService), hiển thị chung một chỗ với thông báo khác. */
  protected readonly pendingCalendarInvites = this.calendarStore.pendingInvites;
  protected readonly respondingInviteId = signal<string | null>(null);

  async onRespondCalendarInvite(inviteId: string, status: 'accepted' | 'declined'): Promise<void> {
    if (this.respondingInviteId()) return;
    this.respondingInviteId.set(inviteId);
    this.respondError.set(null);
    try {
      await this.calendarStore.respondToCalendarInvite(inviteId, status);
    } catch {
      this.respondError.set('Không thể xử lý lời mời. Vui lòng thử lại.');
    } finally {
      this.respondingInviteId.set(null);
    }
  }

  readonly close = output<void>();
  readonly openEvent = output<string>();
  readonly openGroup = output<OpenGroupChatRequest>();

  protected readonly tabs = TABS;
  protected readonly activeTab = signal<NotificationTabId>('all');

  protected readonly unreadCount = this.service.unreadCount;

  protected readonly filtered = computed<readonly AppNotification[]>(() => {
    const tab = this.activeTab();
    // Lời mời chia sẻ lịch có mục riêng ở trên (đã nối đúng
    // CalendarStore.respondToCalendarInvite) — lọc bỏ bản ghi thông báo cũ ở
    // đây để tránh một nút Đồng ý/Từ chối thứ hai chỉ đổi trạng thái cục bộ.
    const all = this.service.notifications().filter((n) => !n.id.startsWith('calendar-invite-'));
    if (tab === 'all') return all;
    if (tab === 'unread') return all.filter((n) => !n.isRead);
    return all.filter((n) => notificationCategory(n.type) === tab);
  });

  /**
   * Gom thông báo thành 3 mốc để mắt bắt được nhịp thay vì đọc một danh sách
   * phẳng: chưa đọc lên đầu, rồi tới hôm nay, rồi cũ hơn. Section rỗng bị loại
   * ngay tại đây nên template không phải tự kiểm tra.
   */
  protected readonly groupedSections = computed<readonly NotificationSection[]>(() => {
    const items = this.filtered();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const fresh: AppNotification[] = [];
    const today: AppNotification[] = [];
    const earlier: AppNotification[] = [];

    for (const n of items) {
      if (!n.isRead) fresh.push(n);
      else if (new Date(n.createdAt).getTime() >= startOfToday.getTime()) today.push(n);
      else earlier.push(n);
    }

    return [
      { key: 'fresh', label: 'Mới', items: fresh },
      { key: 'today', label: 'Hôm nay', items: today },
      { key: 'earlier', label: 'Trước đó', items: earlier },
    ].filter((section) => section.items.length > 0);
  });

  private readonly listRef = viewChild<ElementRef<HTMLElement>>('list');

  /** Số thông báo mới đến trong lúc người dùng đang cuộn xem các mục cũ. */
  protected readonly newWhileScrolled = signal(0);

  private previousTotal = this.service.notifications().length;

  constructor() {
    effect(() => {
      const total = this.service.notifications().length;
      untracked(() => {
        const added = total - this.previousTotal;
        this.previousTotal = total;
        if (added <= 0) return;
        // Chỉ báo khi người dùng đang xem mục cũ — ở đầu danh sách thì item mới
        // tự hiện ra, không cần làm phiền thêm.
        const el = this.listRef()?.nativeElement;
        if (el && el.scrollTop > SCROLL_TOP_THRESHOLD_PX) {
          this.newWhileScrolled.update((count) => count + added);
        }
      });
    });
  }

  onListScroll(): void {
    const el = this.listRef()?.nativeElement;
    if (el && el.scrollTop <= SCROLL_TOP_THRESHOLD_PX) this.newWhileScrolled.set(0);
  }

  scrollToNewest(): void {
    this.listRef()?.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
    this.newWhileScrolled.set(0);
  }

  setTab(tab: NotificationTabId): void {
    this.activeTab.set(tab);
    this.newWhileScrolled.set(0);
  }

  markAllRead(): void {
    this.service.markAllAsRead();
  }

  onDismiss(notification: AppNotification): void {
    this.service.remove(notification.id);
  }

  protected readonly hasAnyNotification = computed(() => this.service.notifications().length > 0);

  clearAll(): void {
    if (!this.hasAnyNotification()) return;
    if (!confirm('Xóa tất cả thông báo? Hành động này không thể hoàn tác.')) return;
    this.service.clearAll();
  }

  onActivate(notification: AppNotification): void {
    this.service.markAsRead(notification.id);

    if (EVENT_RELATED_TYPES.has(notification.type) && notification.relatedId) {
      this.openEvent.emit(notification.relatedId);
      this.close.emit();
      return;
    }

    if (notification.type === 'message') {
      const meta = notification.messageMeta;
      if (!meta) return;
      this.openGroup.emit({ groupId: meta.groupId, messageId: meta.messageId });
      this.close.emit();
      return;
    }

    if (notification.type === 'group_invitation' && notification.relatedId) {
      // Lời mời còn "pending" đã có nút Chấp nhận/Từ chối riêng — click vào
      // thân thông báo lúc đó chỉ nên đánh dấu đã đọc, không điều hướng.
      if (notification.actionStatus === 'pending') return;
      this.openGroup.emit({ groupId: notification.relatedId });
      this.close.emit();
    }
  }

  /** Chỉ cập nhật UI SAU KHI backend xác nhận; lỗi thì giữ nguyên action để
   *  người dùng thử lại. */
  async onRespond(payload: NotificationRespondPayload): Promise<void> {
    if (this.respondingId()) return;

    const notification = this.service.notifications().find((n) => n.id === payload.id);
    const inviteId = notification?.metadata?.['inviteId'];

    // Chưa nối được với lời mời thật ở backend (vd. dữ liệu demo) thì chỉ đổi
    // trạng thái cục bộ, không giả vờ đã gọi API.
    if (!inviteId) {
      this.service.respond(payload.id, payload.status);
      return;
    }

    this.respondingId.set(payload.id);
    this.respondError.set(null);
    try {
      await this.groupStore.respondToInvite(inviteId, payload.status);
    } catch {
      this.respondError.set('Không thể xử lý lời mời. Vui lòng thử lại.');
    } finally {
      this.respondingId.set(null);
    }
  }
}
