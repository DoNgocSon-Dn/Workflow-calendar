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
import { HttpErrorResponse } from '@angular/common/http';
import { NotificationService } from '../../../core/services/notification.service';
import { DialogService } from '../../../core/services/dialog.service';
import {
  AppNotification,
  NotificationRespondPayload,
  notificationCategory,
} from '../../../core/services/notification.model';
import { NotificationItem } from './notification-item';
import { GroupStore } from '../../../features/groups/data/group-store';
import { TranslationService } from '../../../core/i18n/translation.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { CalendarStore } from '../../../features/calendar/data/calendar-store';

type NotificationTabId = 'all' | 'unread' | 'message' | 'task' | 'event';

const TABS: readonly { id: NotificationTabId; labelKey: string }[] = [
  { id: 'all', labelKey: 'notif.tabAll' },
  { id: 'unread', labelKey: 'notif.tabUnread' },
  { id: 'message', labelKey: 'notif.tabMessage' },
  { id: 'task', labelKey: 'notif.tabTask' },
  { id: 'event', labelKey: 'notif.tabEvent' },
];

const EVENT_RELATED_TYPES = new Set<AppNotification['type']>(['event_invitation', 'event_update', 'reminder', 'conflict']);

/** Dưới ngưỡng này coi như người dùng vẫn đang ở đầu danh sách. */
interface NotificationSection {
  readonly key: string;
  readonly labelKey: string;
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
  private readonly dialog = inject(DialogService);
  protected readonly i18n = inject(TranslationService);
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
      this.respondError.set(this.i18n.t('notif.respondError'));
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
    const all = this.service.notifications().filter((n) => !n.id.startsWith('calendar-invite-'));
    if (tab === 'all') return all;
    if (tab === 'unread') return all.filter((n) => !n.isRead);
    if (tab === 'task') return all.filter((n) => notificationCategory(n.type) === 'task' || n.type === 'group_invitation' || notificationCategory(n.type) === 'group');
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
      { key: 'fresh', labelKey: 'notif.sectionFresh', items: fresh },
      { key: 'today', labelKey: 'notif.sectionToday', items: today },
      { key: 'earlier', labelKey: 'notif.sectionEarlier', items: earlier },
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

  /**
   * Vuốt thanh kéo xuống để đóng sheet trên mobile.
   *
   * Dùng Pointer Events nên chạy chung cho cả chạm lẫn chuột, và
   * setPointerCapture giữ được luồng sự kiện kể cả khi ngón tay trượt ra ngoài
   * thanh kéo — thiếu nó thì vuốt nhanh sẽ bị rớt giữa chừng.
   */
  onSheetDragStart(event: PointerEvent): void {
    const sheet = (event.currentTarget as HTMLElement).closest('.notif-panel') as HTMLElement | null;
    if (!sheet) return;

    const startY = event.clientY;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    sheet.style.transition = 'none';

    const onMove = (move: PointerEvent): void => {
      // Chỉ cho kéo XUỐNG; kéo lên không làm sheet dính lên trên mép màn hình.
      const delta = Math.max(0, move.clientY - startY);
      sheet.style.transform = `translateY(${delta}px)`;
    };

    const onEnd = (end: PointerEvent): void => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onEnd);
      target.removeEventListener('pointercancel', onEnd);
      sheet.style.transition = '';

      // Quá 1/4 chiều cao sheet thì coi như muốn đóng; chưa tới thì bật về.
      if (end.clientY - startY > sheet.offsetHeight * 0.25) {
        this.close.emit();
      } else {
        sheet.style.transform = '';
      }
    };

    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onEnd);
    target.addEventListener('pointercancel', onEnd);
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

  async clearAll(): Promise<void> {
    if (!this.hasAnyNotification()) return;
    const ok = await this.dialog.confirm(this.i18n.t('notif.clearConfirm'), { danger: true });
    if (!ok) return;
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

    this.respondingId.set(payload.id);
    this.respondError.set(null);
    try {
      if (notification?.type === 'group_invitation') {
        if (inviteId) {
          await this.groupStore.respondToInvite(inviteId, payload.status);
          if (payload.status === 'accepted') {
            await this.calendarStore.loadAll();
          }
        } else {
          this.service.respond(payload.id, payload.status);
        }
      } else if (payload.id.startsWith('calendar-invite-') || (notification?.type === 'event_invitation' && inviteId)) {
        const targetId = inviteId || payload.id.replace('calendar-invite-', '');
        await this.calendarStore.respondToCalendarInvite(targetId, payload.status);
      } else if (payload.id.startsWith('event-invite-') || (notification?.type === 'event_invitation' && notification?.relatedId)) {
        const eventId = notification?.relatedId || payload.id.replace('event-invite-', '');
        await this.calendarStore.respondToInvite(eventId, payload.status);
      } else {
        this.service.respond(payload.id, payload.status);
      }
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 404) {
        this.service.remove(payload.id);
      } else {
        console.error('[notification-panel] respond lời mời thất bại:', err);
        this.respondError.set(this.i18n.t('notif.respondError'));
      }
    } finally {
      this.respondingId.set(null);
    }
  }
}
